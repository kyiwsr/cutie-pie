// Issue 04: refuse opencode 1.x with a copy-paste upgrade command.
// Seam 1 (unit): version parsing + upgrade message in opencode.mjs.
// Seam 2 (live): server.mjs refuses an opencode run before spawning when pointed at a 1.x binary.
// Run with: node --test tests/verify-opencode-v1-refusal.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { majorOf, needsUpgradeVersion, upgradeMessage, info } from '../opencode.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---------- seam 1: version parsing ----------
test('1.x versions need an upgrade, 2.x do not', () => {
  assert.equal(needsUpgradeVersion('opencode v1.19.0'), true);
  assert.equal(needsUpgradeVersion('1.19.0'), true);
  assert.equal(needsUpgradeVersion('opencode v2.0.29'), false);
  assert.equal(needsUpgradeVersion('2.0.0'), false);
});

test('majorOf parses the leading major number, null when unknown', () => {
  assert.equal(majorOf('opencode v1.19.0'), 1);
  assert.equal(majorOf('opencode v2.0.29'), 2);
  assert.equal(majorOf('v2.1.0'), 2);
  assert.equal(majorOf(''), null);
  assert.equal(majorOf(null), null);
});

test('unparseable versions fail open (no refusal)', () => {
  assert.equal(needsUpgradeVersion(''), false);
  assert.equal(needsUpgradeVersion(null), false);
  assert.equal(needsUpgradeVersion('not-a-version'), false);
});

test('upgrade message contains copy-paste commands for npm and other installs', () => {
  const msg = upgradeMessage('opencode v1.19.0');
  assert.match(msg, /npm install -g opencode-ai@latest/);
  assert.match(msg, /curl -fsSL https:\/\/opencode\.ai\/install \| bash/);
  assert.match(msg, /https:\/\/opencode\.ai\/v2\/docs/);
});

// ---------- seam 2: live refusal before any run starts ----------
// Points OPENCODE_BIN at a fake 1.x binary (slow on purpose: if the server
// spawned it, the run would take 5s; refusal returns immediately without spawning).
const LIVE_PORT = '4538';
const LIVE_BASE = `http://127.0.0.1:${LIVE_PORT}`;
const liveFetch = (p, opts = {}) => fetch(LIVE_BASE + p, {
  ...opts,
  headers: { 'Content-Type': 'application/json', Origin: LIVE_BASE, ...(opts.headers || {}) },
});
const readEvents = async (res) => {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', events = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) events.push(JSON.parse(line));
    }
  }
  return events;
};

test('live: pointed at a 1.x binary, an opencode run is refused up front with the upgrade prompt', { timeout: 60000 }, async (t) => {
  if (process.env.LIVE === '0') return t.skip('LIVE=0');
  const agentsFile = path.join(ROOT, 'agents.json');
  const backup = await readFile(agentsFile, 'utf8');
  const workdir = '/tmp/opencode/v1probe';
  await mkdir(workdir, { recursive: true });
  const fakeDir = '/tmp/opencode/fakev1bin';
  await mkdir(fakeDir, { recursive: true });
  const fakeBin = path.join(fakeDir, 'opencode');
  // Fake 1.x binary: reports 1.x for --version; sleeps 5s for run (refusal must not reach it).
  await writeFile(fakeBin, '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "opencode v1.19.0"; exit 0; fi\nsleep 5\necho "should never run"\n');
  await chmod(fakeBin, 0o755);
  const child = spawn('node', ['server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: LIVE_PORT, WORKDIR: workdir, OPENCODE_BIN: fakeBin },
  });
  try {
    let ready = false;
    for (let i = 0; i < 30 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { ready = (await liveFetch('/api/agents')).ok; } catch {}
    }
    if (!ready) return t.skip('live server did not start');
    const oc = await liveFetch('/api/opencode').then((r) => r.json());
    assert.equal(oc.needsUpgrade, true);
    assert.match(oc.version || '', /1\.19\.0/);
    const addRes = await liveFetch('/api/agents', { method: 'POST', body: JSON.stringify({ name: 'V1 Probe', role: 'probe', provider: 'opencode', model: 'opencode/nemotron-3-ultra-free', tools: 'Read' }) });
    assert.equal(addRes.status, 201);
    const rosterAgent = await addRes.json();
    try {
      const start = Date.now();
      const res = await liveFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ agent: rosterAgent.id, prompt: 'say hi' }) });
      assert.equal(res.status, 200);
      const events = await readEvents(res);
      const elapsed = Date.now() - start;
      assert.ok(elapsed < 4000, `refusal must return before the 5s fake run (took ${elapsed}ms)`);
      const texts = events.flatMap((e) => {
        if (e.type === 'error') return [e.text];
        if (e.type === 'result' && e.result) return [e.result];
        return [];
      }).join('\n');
      assert.match(texts, /npm install -g opencode-ai@latest/);
      assert.match(texts, /curl -fsSL https:\/\/opencode\.ai\/install \| bash/);
      const results = events.filter((e) => e.type === 'result');
      assert.equal(results.length, 1);
      assert.equal(results[0].is_error, true);
    } finally {
      await liveFetch('/api/agents/' + rosterAgent.id, { method: 'DELETE' }).catch(() => {});
    }
  } finally {
    await writeFile(agentsFile, backup);
    child.kill();
  }
});
