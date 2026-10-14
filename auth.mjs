// Sign in / sign out through Claude Code's own commands (`claude auth ...`). This app never sees a password or a
// token: the sign-in itself happens on Anthropic's page, opened by Claude Code. Note that Claude Code keeps one login
// per computer, so signing out here signs out the terminal too.
import { spawn } from 'node:child_process';

// CLAUDE_BIN / CLAUDE_BIN_ARGS let a test point this at a stand-in command instead of the real login.
const BIN = process.env.CLAUDE_BIN || 'claude';
const PRE = process.env.CLAUDE_BIN_ARGS ? process.env.CLAUDE_BIN_ARGS.split(' ') : [];
const claude = (args, opts) => {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return spawn(BIN, [...PRE, ...args], { env, ...opts });
};

function run(args, timeout = 20000) {
  return new Promise((resolve) => {
    let out = '', missing = false;
    let p;
    const done = (code) => { clearTimeout(timer); resolve({ code, out, missing }); };
    const timer = setTimeout(() => { try { p.kill(); } catch {} done(-1); }, timeout);
    try { p = claude(args, { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return done(-1); }
    p.stdout.on('data', (d) => (out += d));
    p.on('error', (e) => { missing = e.code === 'ENOENT'; done(-1); }); // ENOENT: Claude Code is not installed
    p.on('close', done);
  });
}

// ---------- who is signed in ----------
let cache = { at: 0, v: null };
let lastEmail = '';

export async function status(force = false) {
  if (!force && cache.v && Date.now() - cache.at < 3000) return { ...cache.v, login: loginInfo() };
  const { out, missing } = await run(['auth', 'status']);
  if (missing) { // Claude Code is not installed: the same as being signed out, except signing in cannot work
    cache = { at: Date.now(), v: { loggedIn: false, installed: false, email: '', plan: '' } };
    return { ...cache.v, login: loginInfo() };
  }
  let v;
  try {
    const j = JSON.parse(out);
    v = { loggedIn: !!j.loggedIn, email: j.email || '', plan: j.subscriptionType || '' };
    if (v.email) lastEmail = v.email;
  } catch {
    v = { loggedIn: null, email: '', plan: '' }; // could not tell (command missing or timed out): the page must not guess
  }
  cache = { at: Date.now(), v };
  return { ...v, login: loginInfo() };
}

export async function logout() {
  cancelLogin();
  const r = await run(['auth', 'logout']);
  cache.at = 0;
  return r.code === 0;
}

// ---------- signing back in ----------
let login = { proc: null, running: false, error: '', url: '', cancelled: false };
const loginInfo = () => ({ running: login.running, error: login.error, url: login.url });
const SAFE_LINK = /^https:\/\/([a-z0-9-]+\.)*(claude\.ai|claude\.com|anthropic\.com)\//i;

export function startLogin() {
  if (login.running) return;
  const args = ['auth', 'login'];
  if (/^[^\s@]+@[^\s@]+$/.test(lastEmail)) args.push('--email', lastEmail); // pre-fills the email on the sign-in page
  login = { proc: null, running: true, error: '', url: '', cancelled: false };
  const me = login;
  let out = '';
  try {
    me.proc = claude(args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    me.running = false; me.error = 'Could not start the sign-in.';
    return;
  }
  const onData = (d) => {
    out = (out + d).slice(-2000);
    const m = out.match(/https?:\/\/\S+/);
    if (m && SAFE_LINK.test(m[0]) && !me.url) me.url = m[0]; // shown as a fallback link if no browser window opens
  };
  me.proc.stdout.on('data', onData);
  me.proc.stderr.on('data', onData);
  const limit = setTimeout(() => { me.error = 'Sign-in timed out.'; try { me.proc.kill(); } catch {} }, 5 * 60 * 1000);
  me.proc.on('error', () => { me.running = false; me.error = 'Could not start the sign-in.'; clearTimeout(limit); });
  me.proc.on('close', (code) => {
    clearTimeout(limit);
    me.running = false;
    cache.at = 0;
    if (code !== 0 && !me.cancelled && !me.error) me.error = 'Sign-in did not finish. Try again.';
  });
}

export function cancelLogin() {
  if (!login.running) return;
  login.cancelled = true;
  try { login.proc.kill(); } catch {}
}
