// The MCP servers your Claude Code is connected to, from `claude mcp list`.
import { spawn } from 'node:child_process';

const STATUS = { '✔': 'connected', '✓': 'connected', '!': 'needs-auth', '✗': 'failed', '✘': 'failed', '⏸': 'pending' };
const display = (name) => name.replace(/^claude\.ai\s+/, '').replace(/\s+MCP$/, '');

export function parseList(text) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
    const m = line.match(/^(.+?):\s+(.+?)\s+-\s+(\S)\s*(.*)$/); // "name: target - ✔ Connected"
    if (!m) continue;
    const status = STATUS[m[3]] || (/connected/i.test(m[4]) ? 'connected' : /auth/i.test(m[4]) ? 'needs-auth' : 'failed');
    out.push({ name: display(m[1]), status });
  }
  return out;
}

let servers = [];
let inflight = null;

export function discover(timeout = 45000) {
  if (inflight) return inflight;
  inflight = new Promise((resolve) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    let out = '';
    let p;
    const done = () => { clearTimeout(timer); inflight = null; servers = parseList(out); resolve(servers); };
    const timer = setTimeout(() => { try { p.kill(); } catch {} done(); }, timeout);
    try { p = spawn('claude', ['mcp', 'list'], { env, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return done(); }
    p.stdout.on('data', (d) => (out += d));
    p.on('error', done);
    p.on('close', done);
  });
  return inflight;
}

export const list = () => servers;
export const ready = () => inflight || Promise.resolve();
