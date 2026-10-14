import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { getUsage } from './usage.mjs';
import * as mcp from './mcp.mjs';
import * as auth from './auth.mjs';
import * as opencode from './opencode.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4530;
// The folder agents work in. By default a separate "workspace" folder, so agents cannot touch this app's own files.
// Set WORKDIR to point them at one of your own projects instead.
const WORKDIR = process.env.WORKDIR || path.join(ROOT, 'workspace');
const MAX_AGENTS = 10;
const AGENTS_FILE = path.join(ROOT, 'agents.json');
const STATIC = { '/': 'index.html', '/index.html': 'index.html', '/office.js': 'office.js', '/topbar.js': 'topbar.js', '/chat.js': 'chat.js', '/auth.js': 'auth.js' };
const LOGO_DIR = path.join(ROOT, 'logos');
const LOGO_ALIAS = { claudedocs: 'claude', googlecalendar: 'googlecalendar', googledrive: 'googledrive' };
const logoKey = (name) => {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const k = LOGO_ALIAS[n] || n;
  return existsSync(path.join(LOGO_DIR, k + '.png')) ? k : null;
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const loadAgents = async () => JSON.parse(await readFile(AGENTS_FILE, 'utf8'));
const saveAgents = (list) => writeFile(AGENTS_FILE, JSON.stringify(list, null, 2) + '\n');

const send = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 100_000) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

const readJson = async (req) => JSON.parse(await readBody(req));

// "UBAI" / "ubai" / "  mary-jane  " -> "Ubai" / "Ubai" / "Mary-Jane"
const standardName = (s) =>
  String(s).trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const MODELS = ['haiku', 'sonnet', 'opus']; // '' = whatever Claude Code is set to
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']; // thinking level; '' = Claude Code's own default
const PROVIDERS = ['claude', 'opencode'];
const OC_MODEL = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._:\/-]+$/; // opencode names models as provider/model
const TOOLS_OK = /^[A-Za-z0-9_*(),:. -]*$/;

function cleanAgent(body, id) {
  const name = standardName(body.name || '').slice(0, 40);
  const role = String(body.role || '').trim().slice(0, 4000);
  const tools = String(body.tools || '').trim().slice(0, 300);
  if (!name) throw new Error('name is required');
  if (!role) throw new Error('role is required');
  if (!TOOLS_OK.test(tools)) throw new Error('tools contains characters that are not allowed');
  const provider = String(body.provider || 'claude').trim();
  if (!PROVIDERS.includes(provider)) throw new Error('provider is not one of: ' + PROVIDERS.join(', '));
  const model = String(body.model || '').trim();
  if (provider === 'claude' && model && !MODELS.includes(model)) throw new Error('model is not one of: ' + MODELS.join(', '));
  if (provider === 'opencode' && !OC_MODEL.test(model)) throw new Error('model is required for opencode, written provider/model');
  const effort = String(body.effort || '').trim();
  if (effort && !EFFORTS.includes(effort)) throw new Error('thinking level is not one of: ' + EFFORTS.join(', '));
  return { id, name, role, tools, ...(provider !== 'claude' && { provider }), ...(model && { model }), ...(effort && { effort }) };
}

async function manageAgents(req, res, url) {
  const agents = await loadAgents();
  const id = url.pathname.split('/')[3];
  if (req.method === 'POST' && !id) {
    const body = await readJson(req);
    if (agents.length >= MAX_AGENTS) return send(res, 400, { error: `the castle fits ${MAX_AGENTS} agents` });
    let base = slug(body.name) || 'agent', n = base, i = 2;
    while (agents.some((a) => a.id === n)) n = `${base}-${i++}`;
    const agent = cleanAgent(body, n);
    await saveAgents([...agents, agent]);
    return send(res, 201, agent);
  }
  const idx = agents.findIndex((a) => a.id === id);
  if (idx < 0) return send(res, 404, { error: 'no such agent' });
  if (req.method === 'PUT') {
    agents[idx] = cleanAgent(await readJson(req), id);
    await saveAgents(agents);
    return send(res, 200, agents[idx]);
  }
  if (req.method === 'DELETE') {
    if (agents.length === 1) return send(res, 400, { error: 'keep at least one agent' });
    agents.splice(idx, 1);
    await saveAgents(agents);
    return send(res, 200, { ok: true });
  }
  send(res, 405, { error: 'method not allowed' });
}

// What an agent is told about the rest of the team, and how to hand work over. The page watches replies for
// <delegate agent="id">instruction</delegate> and sends each instruction to that agent.
function teamPrompt(agents, self) {
  const others = agents.filter((a) => a.id !== self.id);
  if (!others.length) return '';
  const list = others.map((a) => `- ${a.name} (id: ${a.id}): ${a.role.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n');
  return '\n\nYour teammates (other agents you can hand work to):\n' + list + '\n\n' +
    'If your role says you hand work to other agents instead of doing tasks yourself, this is mandatory: ' +
    'do NOT use any tools and do NOT do any part of the task yourself, even if you could. ' +
    'Your whole reply is the acknowledgement plus the delegate blocks, nothing else.\n' +
    'When your role tells you to hand work over:\n' +
    '1. Start with one short sentence (under 15 words) telling the user you understood the task.\n' +
    '2. Compare your teammates\' roles and pick the one best suited to the task.\n' +
    '3. Hand the task over with one block per task, exactly like this:\n' +
    '<delegate agent="ID" why="under 20 words: why this teammate fits and the others do not">complete instruction for that agent</delegate>\n' +
    'Use ID from the list above. Write each instruction so the agent can act without seeing this chat, but keep it brief. ' +
    'Their answers are sent back to you afterwards. ' +
    'If your role does not tell you to hand work over, just do the task yourself and ignore this.';
}

// An agent on opencode: same stream the page already understands, produced from opencode's own events.
async function runOpencode(agent, agents, body, res) {
  const write = (ev) => res.write(JSON.stringify(ev) + '\n');
  // A 1.x binary cannot run the V2 profile, so refuse before any run starts
  // instead of failing mysteriously mid-run.
  const oc = await opencode.info();
  if (oc.needsUpgrade) {
    const text = opencode.upgradeMessage(oc.version);
    write({ type: 'error', text });
    write({ type: 'result', session_id: '', is_error: true, result: text });
    write({ type: 'exit', code: 1 });
    return res.end();
  }
  const { cmd, args, env } = opencode.buildRun(agent, body.prompt, body.session, agent.role + teamPrompt(agents, agent));
  const state = opencode.newState();
  let child, buf = '', lastErr = '';
  try {
    child = spawn(cmd, args, { cwd: WORKDIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    write({ type: 'error', text: 'Could not start opencode: ' + e.message });
    return res.end();
  }
  const feed = (line) => { if (line.trim()) opencode.translate(line, state).forEach(write); };
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { feed(buf.slice(0, i)); buf = buf.slice(i + 1); }
  });
  child.stderr.on('data', (d) => { lastErr = String(d).slice(-300); });
  child.on('error', (e) => { write({ type: 'error', text: /ENOENT/.test(e.message) ? 'opencode is not installed. Run: npm install -g opencode-ai@latest, then restart Cutie Pie.' : e.message }); res.end(); });
  child.on('close', (code) => {
    feed(buf);
    // A failing run reports the real text: an upstream error event if one arrived, else the captured stderr.
    // Either way a non-zero exit fails the run, so the closing result reads as an error, not a success.
    if (code !== 0 && !state.error) state.error = lastErr.trim() || `opencode stopped with code ${code}`;
    if (code !== 0) state.failed = true;
    opencode.finish(state).forEach(write);
    write({ type: 'exit', code });
    res.end();
  });
  res.on('close', () => child.kill());
}

async function runTask(req, res) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    res.writeHead(400).end('bad json');
    return;
  }
  const agents = await loadAgents();
  const agent = agents.find((a) => a.id === body.agent) || agents[0];
  if (!body.prompt || typeof body.prompt !== 'string') {
    res.writeHead(400).end('prompt required');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' });
  if (agent.provider === 'opencode') return runOpencode(agent, agents, body, res);

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--append-system-prompt', agent.role + teamPrompt(agents, agent),
    '--allowedTools', agent.tools || 'Read',
    ...(agent.model ? ['--model', agent.model] : []),
    ...(agent.effort ? ['--effort', agent.effort] : []),
    // Agents cannot use connectors (they are not in their allowed tools), and connecting to them at startup costs
    // about 1.5 s per run. To give agents connectors later, remove these two flags.
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
  ];
  if (body.session) args.push('--resume', body.session);

  const child = spawn('claude', args, { cwd: WORKDIR, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(body.prompt);

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) res.write(line + '\n');
    }
  });
  child.stderr.on('data', (d) => res.write(JSON.stringify({ type: 'stderr', text: String(d) }) + '\n'));
  child.on('error', (e) => {
    const text = /ENOENT/.test(e.message)
      ? 'Claude Code is not installed on this computer. Install it (see the README), or set this agent to opencode in Manage Agents.'
      : e.message;
    res.write(JSON.stringify({ type: 'error', text }) + '\n');
    res.end();
  });
  child.on('close', (code) => {
    if (buf.trim()) res.write(buf.trim() + '\n');
    res.write(JSON.stringify({ type: 'exit', code }) + '\n');
    res.end();
  });
  res.on('close', () => child.kill());
}

// First run: create the roster from a starter file. Claude agents if Claude Code is installed and signed in,
// otherwise opencode agents when opencode is installed (its free models need no account).
async function ensureSetup() {
  await mkdir(WORKDIR, { recursive: true });
  if (existsSync(AGENTS_FILE)) return;
  const claudeOk = (await auth.status(true)).loggedIn === true;
  const ocOk = !claudeOk && (await opencode.info()).installed;
  const starter = ocOk ? 'agents.opencode.json' : 'agents.example.json';
  await copyFile(path.join(ROOT, starter), AGENTS_FILE);
  console.log(`first run: created agents.json from ${starter}`);
}
await ensureSetup();

mcp.discover();
opencode.info().then(() => opencode.mcpServers()); // warm the model and connector lists so the page does not wait for them

createServer(async (req, res) => {
  try {
    // only the local page may talk to this server (blocks DNS-rebinding and other sites' requests)
    const host = req.headers.host || '';
    if (host !== `127.0.0.1:${PORT}` && host !== `localhost:${PORT}`) return send(res, 403, { error: 'forbidden host' });

    // Changes (log out, edit agents, run tasks) must come from this page. A browser tells us where a request came from,
    // so another website cannot make your browser press these buttons.
    const origin = req.headers.origin;
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin && origin !== `http://127.0.0.1:${PORT}` && origin !== `http://localhost:${PORT}`) {
      return send(res, 403, { error: 'forbidden origin' });
    }

    const url = new URL(req.url, 'http://local');
    const p = url.pathname;
    if (req.method === 'GET' && STATIC[p]) {
      const file = STATIC[p];
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)], 'Cache-Control': 'no-store' });
      return res.end(await readFile(path.join(ROOT, file)));
    }
    if (p === '/api/agents' && req.method === 'GET') return send(res, 200, await loadAgents());
    if (p === '/api/agents' || p.startsWith('/api/agents/')) return await manageAgents(req, res, url);
    if (p === '/api/auth/status') return send(res, 200, await auth.status(url.searchParams.get('refresh') === '1'));
    if (p === '/api/auth/logout' && req.method === 'POST') return send(res, 200, { ok: await auth.logout() });
    if (p === '/api/auth/login' && req.method === 'POST') { auth.startLogin(); return send(res, 200, { started: true }); }
    if (p === '/api/auth/login/cancel' && req.method === 'POST') { auth.cancelLogin(); return send(res, 200, { ok: true }); }
    if (p === '/api/opencode') return send(res, 200, await opencode.info());
    if (p === '/api/usage') return send(res, 200, await getUsage(url.searchParams.get('refresh') === '1'));
    if (p === '/api/mcp' && url.searchParams.get('source') === 'opencode') {
      // working without Claude: opencode's own connectors, and only the ones that are connected
      const servers = (await opencode.mcpServers()).filter((s) => s.status === 'connected');
      return send(res, 200, { servers: servers.map((s) => ({ ...s, logo: logoKey(s.name) })) });
    }
    if (p === '/api/mcp') {
      if (url.searchParams.get('refresh') === '1') await mcp.discover();
      else await mcp.ready();
      return send(res, 200, { servers: mcp.list().map((s) => ({ ...s, logo: logoKey(s.name) })) });
    }
    if (/^\/logos\/[a-z0-9]+\.png$/.test(p) && existsSync(path.join(ROOT, p))) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
      return res.end(await readFile(path.join(ROOT, p)));
    }
    if (p === '/api/tasks' && req.method === 'POST') return await runTask(req, res);
    res.writeHead(404).end('not found');
  } catch (e) {
    if (!res.headersSent) send(res, e instanceof SyntaxError || /required|allowed|large|model is not|provider is not|thinking level is not/.test(e.message) ? 400 : 500, { error: e.message });
    else res.end();
  }
}).listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`${url}  (agents work in: ${WORKDIR})`);
  if (process.argv.includes('--open')) { // used by start.bat / start.sh
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
  }
});
