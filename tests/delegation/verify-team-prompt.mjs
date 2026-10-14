// Delegation is plain-text <delegate> blocks parsed by chat.js, not a tool.
// Regression test: teamPrompt() must say so explicitly, and the default
// Master role must name the mechanism, so weak models stop reporting
// "no delegation tool wired up". Run with: node --test tests/delegation/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const serverSrc = await readFile(path.join(ROOT, 'server.mjs'), 'utf8');

const promptBody = serverSrc.slice(serverSrc.indexOf('function teamPrompt'));
const identityBody = serverSrc.slice(serverSrc.indexOf('function identityPrompt'), serverSrc.indexOf('function teamPrompt'));
const composeBody = serverSrc.slice(serverSrc.indexOf('function composeSystem'));

test('teamPrompt states delegation is plain text, not a tool', () => {
  assert.match(promptBody, /plain text/);
  assert.match(promptBody, /There is no delegation tool/);
  assert.match(promptBody, /Never say you cannot reach teammates/);
});

test('teamPrompt covers one block per task with a multi-teammate example', () => {
  assert.match(promptBody, /one block per task/);
  assert.match(promptBody, /<delegate agent="ID"/);
});

test('default Master roles name the <delegate> mechanism', async () => {
  for (const file of ['agents.example.json', 'agents.opencode.json']) {
    const agents = JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
    const master = agents.find((a) => a.id === 'master');
    assert.ok(master, `${file} must define a master roster agent`);
    assert.match(master.role, /<delegate agent="id">/);
    assert.match(master.role, /ONLY/);
  }
});

test('chat still parses <delegate> blocks', async () => {
  const chatSrc = await readFile(path.join(ROOT, 'chat.js'), 'utf8');
  assert.ok(chatSrc.includes('<delegate'), 'chat.js must reference <delegate> blocks');
  assert.ok(chatSrc.includes('allowHandoff'), 'chat.js must gate handoff parsing on allowHandoff');
});

test('identity comes first and forbids adopting other roles', () => {
  assert.match(identityBody, /NOT any other agent/);
  assert.match(composeBody, /identityPrompt\(agent\)/);
  assert.ok(composeBody.indexOf('identityPrompt') < composeBody.indexOf('teamPrompt'), 'identity must precede team knowledge');
});

test('workers get zero roster and never delegate', () => {
  assert.match(promptBody, /Never output <delegate> blocks/);
  assert.match(serverSrc, /zero roster/i);
  assert.doesNotMatch(identityBody, /teammates/);
});

test('only the coordinator path carries a roster', () => {
  assert.match(promptBody, /Your teammates/);
  assert.match(promptBody, /isCoordinator/);
});

test('chat strips leaked reasoning before display', async () => {
  const chatSrc = await readFile(path.join(ROOT, 'chat.js'), 'utf8');
  assert.ok(chatSrc.includes('stripReasoning'), 'chat.js must strip think/reasoning leaks');
});
