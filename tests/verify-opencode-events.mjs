// Issue 03: V2 event translation. Run with: node tests/verify-opencode-events.mjs
// Unit seam: translate()/finish()/newState() in opencode.mjs, fed with real
// captured V2 `opencode run --format json` lines. Live seam: the server.mjs
// close handler, driven through a real server + real binary (needs network
// for free models; the failing-model run fails before auth instead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newState, translate, finish } from '../opencode.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---------- captured V2 fixtures (opencode 2.0.29, `run --format json`) ----------
const V2_DENY_READ = '{"type":"tool_use","timestamp":1791984225976,"sessionID":"ses_askread","part":{"partID":"prt_x","sessionID":"ses_askread","messageID":"msg_x","type":"tool","id":"call_1","tool":"read","state":{"status":"error","input":{"path":"/tmp/opencode/v2probe/hello.txt"},"error":"This non-interactive run cannot ask the user for permission, so the request was rejected. Continue without this action.","metadata":{},"time":{"start":1,"end":2}}}}';
const V2_DENY_SHELL = '{"type":"tool_use","timestamp":1791984225976,"sessionID":"ses_shell","part":{"type":"tool","id":"call_2","tool":"shell","state":{"status":"error","input":{"command":"echo hi"},"error":"This non-interactive run cannot ask the user for permission, so the request was rejected. Continue without this action."}}}';
const V2_TEXT = '{"type":"text","timestamp":1791984090105,"sessionID":"ses_ok","part":{"id":"prt_t","sessionID":"ses_ok","messageID":"msg_t","type":"text","text":"HELLO-PROBE","time":{"start":1,"end":2}}}';
const V2_STEP_START = '{"type":"step_start","timestamp":1791984089781,"sessionID":"ses_ok","part":{"id":"prt_s","sessionID":"ses_ok","messageID":"msg_s","type":"step-start"}}';
const V2_STEP_FINISH = '{"type":"step_finish","timestamp":1791984225978,"sessionID":"ses_ok","part":{"id":"prt_f","sessionID":"ses_ok","messageID":"msg_s","type":"step-finish","reason":"tool-calls"}}';
const V2_ERR_BAD_MODEL = '{"type":"error","timestamp":1791984076056,"sessionID":"ses_bad","error":{"type":"provider.no-route","message":"Model unavailable: no-such-provider/no-such-model"}}';
const V2_ERR_FREETIER = '{"type":"error","timestamp":1791984151890,"sessionID":"ses_free","error":{"type":"provider.auth","message":"OpenCode\'s free tier can only be used from within OpenCode. Download it at https://opencode.ai and keep building.","status":403}}';
const V2_ERR_NO_PROFILE = '{"type":"error","timestamp":1791984099896,"sessionID":"ses_noprofile","error":{"type":"unknown","message":"Agent not found: \\"cutie\\""}}';
const V1_DENY = '{"type":"tool_use","part":{"tool":"bash","state":{"status":"error","input":{"command":"ls"},"error":"rejected permission: ask mode in non-interactive run"}}}';
const V2_OS_ERROR = '{"type":"tool_use","timestamp":1791984225976,"sessionID":"ses_os","part":{"type":"tool","id":"call_9","tool":"read","state":{"status":"error","input":{"path":"/root/locked"},"error":"EACCES: permission denied, open \'/root/locked\'"}}}';

const texts = (events) => events.filter((e) => e.type === 'assistant').flatMap((e) => e.message.content).filter((c) => c.type === 'text').map((c) => c.text);

// ---------- denial: V2 non-interactive rejection wording ----------
test('V2 ask-rejection records the denial under the Manage Agents tool name', () => {
  const state = newState();
  const events = translate(V2_DENY_READ, state);
  assert.equal(state.denied, 'Read');
  const toolUses = events.filter((e) => e.type === 'assistant');
  assert.equal(toolUses.length, 1);
  assert.equal(toolUses[0].message.content[0].name, 'Read');
});

test('V2 shell rejection maps back to the Bash checkbox name', () => {
  const state = newState();
  translate(V2_DENY_SHELL, state);
  assert.equal(state.denied, 'Bash');
});

test('a denied write tool is reported under its own Write checkbox', () => {
  const state = newState();
  translate(V2_DENY_READ.replace('"tool":"read"', '"tool":"write"').replace('ses_askread', 'ses_write'), state);
  assert.equal(state.denied, 'Write');
});

test('a tool OS error is not a policy denial', () => {
  const state = newState();
  translate(V2_OS_ERROR, state);
  assert.equal(state.denied, '');
  assert.ok(!texts(finish(state)).some((t) => /not allowed to use/.test(t)));
});

test('legacy V1 rejection wording still matches', () => {
  const state = newState();
  translate(V1_DENY, state);
  assert.equal(state.denied, 'Bash');
});

test('a denied run with no other output explains itself like before', () => {
  const state = newState();
  translate(V2_DENY_SHELL, state);
  const out = finish(state);
  const guidance = texts(out).find((t) => /not allowed to use/.test(t));
  assert.match(guidance || '', /I am not allowed to use the Bash tool, so I could not do that\. You can allow it in this agent's allowed tools\./);
});

// ---------- errors: real upstream text, failed regardless of exit code ----------
test('failing runs surface the upstream V2 message, not a generic failure', () => {
  for (const line of [V2_ERR_BAD_MODEL, V2_ERR_FREETIER]) {
    const state = newState();
    const events = translate(line, state);
    assert.equal(state.failed, true);
    const errors = events.filter((e) => e.type === 'error');
    assert.equal(errors.length, 1);
  }
  const s1 = newState();
  assert.match(translate(V2_ERR_BAD_MODEL, s1).find((e) => e.type === 'error').text, /Model unavailable: no-such-provider\/no-such-model/);
  const s2 = newState();
  assert.match(translate(V2_ERR_FREETIER, s2).find((e) => e.type === 'error').text, /free tier can only be used from within OpenCode/);
});

test('unknown-profile runs surface the upstream message too', () => {
  const state = newState();
  const error = translate(V2_ERR_NO_PROFILE, state).find((e) => e.type === 'error');
  assert.equal(state.failed, true);
  assert.match(error.text, /Agent not found: "cutie"/);
  assert.match(finish(state).find((e) => e.type === 'result').result || '', /Agent not found/);
});

test('denial guidance survives a non-zero exit when no error text arrived', () => {
  const state = newState();
  translate(V2_DENY_SHELL, state);
  state.failed = true; // what server.mjs does on a non-zero exit with no error event
  const out = finish(state);
  assert.ok(texts(out).some((t) => /not allowed to use the Bash tool/.test(t)));
  assert.equal(out.find((e) => e.type === 'result').is_error, true);
});

test('an upstream error wins over the denial guidance', () => {
  const state = newState();
  translate(V2_DENY_SHELL, state);
  translate(V2_ERR_BAD_MODEL, state);
  const out = finish(state);
  assert.ok(!texts(out).some((t) => /not allowed to use/.test(t)));
  assert.match(out.find((e) => e.type === 'result').result || '', /Model unavailable/);
});

test('string and missing error payloads never crash and never go blank', () => {
  const s1 = newState();
  const e1 = translate('{"type":"error","sessionID":"s","error":"boom"}', s1).find((e) => e.type === 'error');
  assert.equal(e1.text, 'boom');
  const s2 = newState();
  const e2 = translate('{"type":"error","sessionID":"s"}', s2).find((e) => e.type === 'error');
  assert.equal(e2.text, 'opencode failed');
});

test('an error event marks the run failed even with a zero exit code', () => {
  const state = newState();
  translate(V2_ERR_BAD_MODEL, state); // exit code plays no part in finish()
  const out = finish(state);
  const result = out.find((e) => e.type === 'result');
  assert.equal(result.is_error, true);
  assert.match(result.result || '', /Model unavailable/);
});

test('a clean run still ends with a non-error result', () => {
  const state = newState();
  translate(V2_TEXT, state);
  const result = finish(state).find((e) => e.type === 'result');
  assert.equal(result.is_error, false);
});

// ---------- passthrough + session ----------
test('text events pass through and mark the run as having spoken', () => {
  const state = newState();
  const events = translate(V2_TEXT, state);
  assert.equal(state.sawText, true);
  assert.equal(state.session, 'ses_ok');
  assert.deepEqual(texts(events), ['HELLO-PROBE']);
});

test('session id is captured from non-text events too', () => {
  const state = newState();
  translate(V2_STEP_START, state);
  assert.equal(state.session, 'ses_ok');
});

// ---------- unknown types: visible server-side, silent chat-side ----------
test('unrecognized event types log server-side once per type and emit nothing', () => {
  const warnings = [];
  const orig = console.warn;
  console.warn = (...a) => { warnings.push(a.join(' ')); };
  try {
    const state = newState();
    translate(V2_TEXT, state); // pins the session so step lines below emit nothing
    assert.deepEqual(translate(V2_STEP_START, state), []);
    assert.deepEqual(translate(V2_STEP_FINISH, state), []);
    assert.deepEqual(translate(V2_STEP_START, state), []); // repeat: no second warning
    assert.equal(warnings.filter((w) => w.includes('step_start')).length, 1);
    assert.equal(warnings.filter((w) => w.includes('step_finish')).length, 1);
  } finally {
    console.warn = orig;
  }
});

test('garbage lines are ignored silently', () => {
  assert.deepEqual(translate('not json', newState()), []);
  assert.deepEqual(translate('', newState()), []);
});

// ---------- live seam: server.mjs close handler against a real server ----------
// Spawns `node server.mjs` on a scratch port with a scratch workdir, adds a
// temporary roster agent, runs it, and checks the NDJSON the chat would read.
// Skip with LIVE=0. The failing-model run needs no model auth (it fails first).
const LIVE_PORT = '4537';
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

async function withServer(t, fn) {
  const agentsFile = path.join(ROOT, 'agents.json');
  const backup = await readFile(agentsFile, 'utf8');
  const workdir = '/tmp/opencode/liveprobe';
  await mkdir(workdir, { recursive: true });
  const child = spawn('node', ['server.mjs'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: LIVE_PORT, WORKDIR: workdir },
  });
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try { ready = (await liveFetch('/api/agents')).ok; } catch {}
    }
    if (!ready) return t.skip('live server did not start');
    await fn();
  } finally {
    await writeFile(agentsFile, backup);
    child.kill();
  }
}

const addRosterAgent = async (body) => {
  const res = await liveFetch('/api/agents', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 201);
  return res.json();
};
const delRosterAgent = (id) => liveFetch('/api/agents/' + id, { method: 'DELETE' }).catch(() => {});
const runTask = async (rosterAgentId, prompt) => {
  const res = await liveFetch('/api/tasks', { method: 'POST', body: JSON.stringify({ agent: rosterAgentId, prompt }) });
  assert.equal(res.status, 200);
  return readEvents(res);
};

test('live: failing run shows the upstream V2 message and ends failed', { timeout: 180000 }, async (t) => {
  if (process.env.LIVE === '0') return t.skip('LIVE=0');
  await withServer(t, async () => {
    const rosterAgent = await addRosterAgent({ name: 'Live Bad', role: 'probe', provider: 'opencode', model: 'no-such-provider/no-such-model', tools: 'Read' });
    try {
      const events = await runTask(rosterAgent.id, 'say hi');
      const errors = events.filter((e) => e.type === 'error');
      assert.ok(errors.length >= 1, 'expected at least one error event');
      assert.match(errors[0].text, /Model unavailable: no-such-provider\/no-such-model/);
      assert.ok(!events.some((e) => e.type === 'error' && /opencode stopped with code/.test(e.text)), 'no generic failure message');
      const results = events.filter((e) => e.type === 'result');
      assert.equal(results.length, 1);
      assert.equal(results[0].is_error, true);
      assert.match(results[0].result || '', /Model unavailable/);
    } finally {
      await delRosterAgent(rosterAgent.id);
    }
  });
});

test('live: denied shell run explains itself when the model stays silent', { timeout: 300000 }, async (t) => {
  if (process.env.LIVE === '0') return t.skip('LIVE=0');
  await withServer(t, async () => {
    // Everything ticked except Bash: shell becomes ask (auto-rejected), and no
    // deny rule is present, which free models reject outright (HTTP 403).
    const rosterAgent = await addRosterAgent({ name: 'Live Deny', role: process.env.DENY_ROLE || 'You only run shell commands. Do exactly what the user asks.', provider: 'opencode', model: 'opencode/mimo-v2.6-flash-free', tools: 'Read,Glob,Grep,Edit,Write,WebFetch,WebSearch,Agent,Skill' });
    try {
      const events = await runTask(rosterAgent.id, process.env.DENY_PROMPT || 'Run exactly this shell command and nothing else: echo denied-probe-123');
      const results = events.filter((e) => e.type === 'result');
      assert.equal(results.length, 1);
      const usedTools = events.flatMap((e) => e.type === 'assistant' ? (e.message.content || []) : []).filter((c) => c.type === 'tool_use').map((c) => c.name);
      const usedShell = usedTools.includes('Bash');
      const saidText = events.some((e) => e.type === 'assistant' && (e.message.content || []).some((c) => c.type === 'text' && c.text.trim()));
      const said = events.flatMap((e) => e.type === 'assistant' ? (e.message.content || []) : []).filter((c) => c.type === 'text').map((c) => c.text.slice(0, 200));
      console.log(`live deny probe: usedTools=${JSON.stringify(usedTools)} saidText=${saidText} is_error=${results[0].is_error} said=${JSON.stringify(said)}`);
      if (usedShell && !saidText) {
        const guidance = events.some((e) => e.type === 'assistant' && (e.message.content || []).some((c) => c.type === 'text' && /not allowed to use the Bash tool/.test(c.text)));
        assert.ok(guidance, 'silent denied run must carry the Bash guidance');
        assert.equal(results[0].is_error, false);
      }
    } finally {
      await delRosterAgent(rosterAgent.id);
    }
  });
});
