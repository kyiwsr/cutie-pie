// Claude plan usage (session = 5 hour window, week = 7 day), read the way Claude Code's own usage screen does.
// The login token Claude Code keeps on this machine is read into memory and sent only to Anthropic's usage
// endpoint. The token is never logged or written; only the returned percentages are cached to .usage-cache.json.
// The endpoint is undocumented, so a failure is reported as { ok: false, reason } and the page shows "unavailable".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://api.anthropic.com/api/oauth/usage';

function readToken() {
  try {
    const file = path.join(os.homedir(), '.claude', '.credentials.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

function parseUsage(j) {
  const pick = (x) =>
    x && typeof x.utilization === 'number'
      ? { percent: Math.max(0, Math.min(100, Math.round(x.utilization))), resetsAt: x.resets_at ? Date.parse(x.resets_at) || null : null }
      : null;
  const session = pick(j?.five_hour), week = pick(j?.seven_day);
  return session || week ? { session, week } : null;
}

async function fetchUsage() {
  const token = readToken();
  if (!token) return { ok: false, reason: 'no Claude Code login token found on this machine' };
  try {
    const r = await fetch(ENDPOINT, {
      headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { ok: false, reason: `usage endpoint answered ${r.status}`, retryAfter: Number(r.headers.get('retry-after')) || 0 };
    const u = parseUsage(await r.json());
    return u ? { ok: true, ...u } : { ok: false, reason: 'usage endpoint answered in an unknown shape' };
  } catch (e) {
    return { ok: false, reason: e.name === 'TimeoutError' ? 'usage endpoint timed out' : e.message };
  }
}

// The endpoint rate-limits (429). So: cache good answers for 5 minutes, back off after a failure (as long as it
// asks, at least 5 minutes), and keep showing the last good numbers (marked stale) instead of "unavailable".
const GOOD_MS = 5 * 60 * 1000;
const FAIL_MS = 5 * 60 * 1000;
const SAVED = path.join(path.dirname(fileURLToPath(import.meta.url)), '.usage-cache.json');
let last = null, nextTry = 0;
try { last = JSON.parse(fs.readFileSync(SAVED, 'utf8')); } catch {}

export async function getUsage(refresh = false) {
  const now = Date.now();
  const fresh = last && now - last.at < GOOD_MS;
  if (fresh && !refresh) return last.value;
  if (now < nextTry) return last ? { ...last.value, stale: true } : { ok: false, reason: 'usage endpoint is rate-limiting; will retry shortly' };
  const v = await fetchUsage();
  if (v.ok) {
    last = { at: now, value: v }; nextTry = 0;
    try { fs.writeFileSync(SAVED, JSON.stringify(last)); } catch {}
    return v;
  }
  nextTry = now + Math.max(FAIL_MS, (v.retryAfter || 0) * 1000);
  return last ? { ...last.value, stale: true, reason: v.reason } : v;
}
