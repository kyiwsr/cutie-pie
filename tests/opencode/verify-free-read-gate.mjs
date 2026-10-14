// Free-tier read gate: free models 403 unless read is allowed, so a
// coordinator with no tools ticked (Master) must still get read allowed.
// Run with: node --test tests/opencode/verify-free-read-gate.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRun, isFreeModel } from '../../opencode.mjs';

const permsOf = (run) => JSON.parse(run.env.OPENCODE_CONFIG_CONTENT).agents.cutie.permissions;
const effectOf = (run, action) => permsOf(run).find((p) => p.action === action)?.effect;

test('free models are detected (prefix-free ids and big-pickle)', () => {
  assert.equal(isFreeModel('opencode/big-pickle'), true);
  assert.equal(isFreeModel('opencode/mimo-v2.6-flash-free'), true);
  assert.equal(isFreeModel('opencode/cat-jam-free'), true);
  assert.equal(isFreeModel('ollama/llama3.2:latest'), false);
  assert.equal(isFreeModel(''), false);
});

test('Master with no tools on a free model still gets read allowed', () => {
  const run = buildRun({ name: 'Master', model: 'opencode/big-pickle', tools: '' }, 'hi', undefined, 'sys');
  assert.equal(effectOf(run, 'read'), 'allow');
  assert.equal(effectOf(run, 'external_directory'), 'allow');
  assert.equal(effectOf(run, 'shell'), 'ask'); // shell stays ask, never allow-by-default
});

test('paid models keep read denied when unticked', () => {
  const run = buildRun({ name: 'M', model: 'ollama/llama3.2:latest', tools: '' }, 'hi', undefined, 'sys');
  assert.equal(effectOf(run, 'read'), 'deny');
  assert.ok(!permsOf(run).some((p) => p.action === 'external_directory'));
});

test('explicitly ticked Read still allows read on any model', () => {
  const run = buildRun({ name: 'M', model: 'ollama/llama3.2:latest', tools: 'Read' }, 'hi', undefined, 'sys');
  assert.equal(effectOf(run, 'read'), 'allow');
  assert.equal(effectOf(run, 'external_directory'), 'allow');
});
