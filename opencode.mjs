// opencode as a second provider next to Claude Code. An agent set to "opencode" runs through `opencode run`,
// output is translated into the same events the chat already reads from Claude Code, so nothing else has to change.
//
// Two facts found by testing opencode V2:
//  - Its free models (provider "opencode", ids ending in -free) reject a request when the shell action is missing
//    from it (HTTP 403 "free tier can only be used from within OpenCode"). So shell is never denied: when an agent
//    may not use it, the action is set to "ask", which a scripted run refuses automatically, and nothing can run.
//  - Each agent's system prompt and permissions are passed as a native-V2 profile in OPENCODE_CONFIG_CONTENT
//    (`agents` with `system` and `permissions[]`), and each run uses `--standalone` for a per-run private server,
//    so no files are written anywhere and concurrent runs stay isolated.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Where to find the program, in order: OPENCODE_BIN; a copy in tools/opencode; one installed with `npm install -g
// opencode-ai`; then plain `opencode` on PATH (the install script, Homebrew, Scoop and Chocolatey put it there).
// npm's own launcher on Windows is a .cmd file that cannot be started directly, so the real program is looked up.
const EXE = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
const npmGlobalRoots = () => [
  process.env.APPDATA && path.join(process.env.APPDATA, 'npm', 'node_modules'),
  path.join(path.dirname(process.execPath), 'node_modules'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules'),
  '/usr/local/lib/node_modules', '/opt/homebrew/lib/node_modules',
  process.env.HOME && path.join(process.env.HOME, '.npm-global', 'lib', 'node_modules'),
].filter(Boolean);

export function binary() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const local = path.join(ROOT, 'tools', 'opencode', 'node_modules', 'opencode-ai', 'bin', EXE);
  if (existsSync(local)) return local;
  for (const root of npmGlobalRoots()) {
    const found = path.join(root, 'opencode-ai', 'bin', EXE);
    if (existsSync(found)) return found;
  }
  return 'opencode';
}

function run(args, timeout = 30000) {
  return new Promise((resolve) => {
    let out = '', p;
    const done = (code) => { clearTimeout(timer); resolve({ code, out }); };
    const timer = setTimeout(() => { try { p.kill(); } catch {} done(-1); }, timeout);
    try { p = spawn(binary(), args, { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return done(-1); }
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => done(-1));
    p.on('close', done);
  });
}

// ---------- what is installed and which models are on offer ----------
let modelCache = { at: 0, value: null };

export async function info() {
  if (modelCache.value && Date.now() - modelCache.at < 10 * 60 * 1000) return { installed: true, version: modelCache.version, models: modelCache.value };
  const v = await run(['--version'], 15000);
  if (v.code !== 0) return { installed: false, models: [] };
  const m = await run(['models'], 60000);
  const models = m.out.split('\n').map((l) => l.trim()).filter((l) => /^[\w.-]+\/\S+$/.test(l))
    .map((id) => ({ id, free: /-free$/.test(id) || id === 'opencode/big-pickle' })); // no account needed for these
  if (models.length) modelCache = { at: Date.now(), value: models, version: v.out.trim() };
  return { installed: true, version: v.out.trim(), models };
}

// ---------- opencode's own connectors (MCP servers), for the top bar when working without Claude ----------
let mcpCache = { at: 0, value: null };
const ANSI = /\x1b\[[0-9;]*m/g;

// `opencode mcp list` prints one line per server, e.g. "◇  ✓ name connected", "✗ name failed", "○ name disabled".
export async function mcpServers() {
  if (mcpCache.value && Date.now() - mcpCache.at < 2 * 60 * 1000) return mcpCache.value;
  const r = await run(['mcp', 'list'], 60000);
  const list = [];
  for (const raw of r.out.split('\n')) {
    const m = raw.replace(ANSI, '').replace(/\r/g, '').trim().match(/^\S+\s+\S\s+(\S+)\s+(connected|failed|disabled|needs\S*(?: \S+)?|pending)$/i);
    if (!m) continue;
    const word = m[2].toLowerCase();
    list.push({ name: m[1], status: word === 'connected' ? 'connected' : word === 'failed' ? 'failed' : word === 'disabled' ? 'disabled' : word.startsWith('needs') ? 'needs-auth' : 'pending' });
  }
  mcpCache = { at: Date.now(), value: list };
  return list;
}

// ---------- one agent run ----------
// Claude Code's tool names, as the Manage Agents list shows them, mapped to opencode's V2 action names.
// Only V2 actions from the permissions table appear here: NotebookEdit and TodoWrite have no V2 action,
// so they are hidden in Manage Agents for opencode and any stored values are ignored here (kept, not deleted).
// Agent maps to the V2 subagent action (V1 called it task).
const PERMS = {
  read: ['Read'], glob: ['Glob'], grep: ['Grep'],
  edit: ['Edit', 'Write'],
  shell: ['Bash'], webfetch: ['WebFetch'], websearch: ['WebSearch'],
  subagent: ['Agent'], skill: ['Skill'],
};

export function buildRun(agent, message, session, systemText) {
  const ticked = new Set(String(agent.tools || '').split(/,(?![^(]*\))/).map((t) => t.trim()).filter(Boolean));
  const permissions = [];
  for (const [action, names] of Object.entries(PERMS)) {
    permissions.push({ action, resource: '*', effect: names.some((n) => ticked.has(n)) ? 'allow' : action === 'shell' ? 'ask' : 'deny' });
  }
  if (ticked.has('Read')) permissions.push({ action: 'external_directory', resource: '*', effect: 'allow' }); // Claude Code's Read tool reaches outside the folder too
  const config = { agents: { cutie: { description: agent.name, mode: 'primary', system: systemText, permissions } } };
  const args = ['run', '--standalone', '--format', 'json', '--agent', 'cutie', '-m', agent.model];
  // Effort is a Claude-only setting: opencode V2 has no such flag, so it is never passed.
  // The stored value is kept untouched so switching back to Claude restores prior behavior.
  if (/^ses_[A-Za-z0-9]+$/.test(session || '')) args.push('-s', session);
  args.push('--', message);
  return { cmd: binary(), args, env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } };
}

// ---------- opencode's events -> the events the chat understands ----------
// V2 tool names are opencode actions (read, shell, subagent, …); the guidance below names them in the Manage Agents
// (Claude Code) vocabulary the checkboxes use, so report the checkbox name, not the raw action.
const cap = (s) => String(s || 'tool').replace(/^./, (c) => c.toUpperCase());
const checkboxName = (t) => {
  const s = String(t || 'tool');
  for (const names of Object.values(PERMS)) {
    const hit = names.find((n) => n.toLowerCase() === s.toLowerCase());
    if (hit) return hit;
  }
  for (const [action, names] of Object.entries(PERMS)) {
    if (action === s.toLowerCase()) return names[0];
  }
  return cap(s);
};
// V2 error events carry { error: { type, message } }; keep the V1 fallbacks so old lines never go blank.
const errorText = (e) => {
  if (!e) return 'opencode failed';
  if (typeof e === 'string') return e;
  return e.message || (e.data && e.data.message) || e.name || 'opencode failed';
};
// A scripted run cannot approve an "ask" permission, so V2 rejects the tool call with this wording (V1 said
// "rejected permission"). Either wording records the denial for the closing guidance. Kept narrow on purpose:
// a tool's own OS errors (e.g. EACCES "permission denied") are not policy denials and must not match.
const DENIED_RE = /rejected permission|request was rejected|cannot ask the user for permission/i;

export function newState() { return { session: '', failed: false, sawText: false, denied: '', error: '', unwarnedEventTypes: [] }; }

export function translate(line, state) {
  let j;
  try { j = JSON.parse(line); } catch { return []; }
  const out = [];
  if (j.sessionID && !state.session) { state.session = j.sessionID; out.push({ type: 'system', session_id: j.sessionID }); }
  const p = j.part || {};
  if (j.type === 'text' && p.text) state.sawText = true;
  if (j.type === 'tool_use' && p.state && p.state.status === 'error' && DENIED_RE.test(String(p.state.error))) state.denied = state.denied || checkboxName(p.tool);
  if (j.type === 'text' && p.text) out.push({ type: 'assistant', message: { content: [{ type: 'text', text: p.text }] } });
  else if (j.type === 'tool_use') out.push({ type: 'assistant', message: { content: [{ type: 'tool_use', name: checkboxName(p.tool), input: (p.state && p.state.input) || {} }] } });
  else if (j.type === 'error') {
    // An error event fails the run no matter what exit code follows.
    state.failed = true;
    const text = errorText(j.error);
    state.error = state.error || text;
    out.push({ type: 'error', text });
  } else if (j.type && !state.unwarnedEventTypes.includes(j.type)) {
    // Unknown event types stay out of the chat but are logged here, so the next upstream format drift is visible.
    state.unwarnedEventTypes.push(j.type);
    console.warn(`[opencode] unrecognized event type: ${j.type}`);
  }
  return out;
}

// The closing events. A scripted run refuses a tool the agent may not use and the model often just stops, so say so,
// unless an upstream error already explains the failure (the error text wins, the guidance would only add noise).
export function finish(state) {
  const out = [];
  if (!state.sawText && state.denied && !state.error) {
    out.push({ type: 'assistant', message: { content: [{ type: 'text', text: `I am not allowed to use the ${state.denied} tool, so I could not do that. You can allow it in this agent's allowed tools.` }] } });
  }
  out.push({ type: 'result', session_id: state.session, is_error: state.failed, ...(state.failed && state.error ? { result: state.error } : {}) });
  return out;
}
