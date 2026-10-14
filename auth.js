(() => {
const $ = (id) => document.getElementById(id);
const page = $('loginPage'), msg = $('loginMsg'), loginBtn = $('loginBtn'), wait = $('loginWait'), link = $('loginLink');
const logoutBtn = $('logoutBtn'), confirmDlg = $('logoutConfirm'), skipBtn = $('loginSkip');
const SKIP = 'cutie.skipClaude'; // set when someone chooses to work with opencode only
const skipped = () => { try { return localStorage.getItem(SKIP) === '1'; } catch { return false; } };
const setSkipped = (on) => { try { on ? localStorage.setItem(SKIP, '1') : localStorage.removeItem(SKIP); } catch {} };
const post = (url) => fetch(url, { method: 'POST' }).then((r) => r.json());
let timer = null;
const noClaude = () => document.body.dataset.noClaude === '1';
// "Working without Claude" mode: Manage Agents stops offering Claude and the connector strip switches to opencode's.
function setMode(off) {
  const was = noClaude();
  if (off) document.body.dataset.noClaude = '1'; else delete document.body.dataset.noClaude;
  if (was !== off) window.dispatchEvent(new Event('claude-mode'));
}

// ---------- one place decides what the page looks like for the current sign-in state ----------
function apply(s) {
  if (s.loggedIn === null) return; // could not tell: leave things as they are rather than guess
  const usage = $('topusage');
  if (s.loggedIn) {
    if (!page.hidden) { location.reload(); return; } // signed back in: start fresh so everything reconnects
    setSkipped(false);
    setMode(false);
    usage.style.display = '';
    logoutBtn.hidden = false;
    logoutBtn.title = s.email ? `Signed in as ${s.email}` : 'Signed in';
    return;
  }
  usage.style.display = 'none'; // the usage gauge is for a Claude plan
  const l = s.login || {};
  if (skipped() && !l.running && !l.error) { // working with opencode only: no login wall
    setMode(true);
    page.hidden = true;
    logoutBtn.hidden = false; // the same red button; here it leaves opencode mode
    logoutBtn.title = 'Working with opencode';
    return;
  }
  setMode(false);
  logoutBtn.hidden = true;
  page.hidden = false;
  wait.hidden = !l.running;
  const missing = s.installed === false; // Claude Code itself is not on this computer, so signing in cannot work
  loginBtn.hidden = !!l.running || missing;
  skipBtn.hidden = !!l.running;
  link.hidden = !(l.running && l.url);
  if (l.url) link.href = l.url;
  msg.textContent = l.error || (l.running ? 'Waiting for you to sign in…' : missing ? 'Claude Code is not installed on this computer. You can still use opencode.' : 'You are signed out of Claude.');
  msg.classList.toggle('bad', !!l.error);
}

async function check() {
  try { apply(await (await fetch('/api/auth/status')).json()); } catch {}
  // while the sign-in page is up, look often so it continues the moment you finish; otherwise once a minute
  timer = setTimeout(check, page.hidden ? 60000 : 2000);
}
function recheck() { clearTimeout(timer); check(); }

// ---------- skip Claude and use opencode ----------
skipBtn.onclick = () => { setSkipped(true); recheck(); };

// ---------- log out (asks first, because Claude Code is signed out on this whole computer) ----------
logoutBtn.onclick = () => {
  const off = noClaude();
  $('lcTitle').textContent = off ? 'Log out?' : 'Log out of Claude?';
  $('lcText').textContent = off
    ? 'This leaves opencode mode and takes you back to the login page.'
    : 'This signs Claude Code out on this whole computer, including your terminal. You can log back in from this page.';
  confirmDlg.showModal();
};
$('logoutCancel').onclick = () => confirmDlg.close();
$('logoutGo').onclick = async () => {
  if (noClaude()) { setSkipped(false); confirmDlg.close(); recheck(); return; } // nothing to sign out of: just leave the mode
  const b = $('logoutGo');
  b.disabled = true; b.textContent = 'Logging out…';
  try { await post('/api/auth/logout'); } catch {}
  b.disabled = false; b.textContent = 'Log out';
  confirmDlg.close();
  recheck();
};

// ---------- log in again ----------
loginBtn.onclick = async () => {
  loginBtn.disabled = true;
  try { await post('/api/auth/login'); } catch {}
  loginBtn.disabled = false;
  recheck();
};
$('loginCancel').onclick = async () => { try { await post('/api/auth/login/cancel'); } catch {} recheck(); };

check();
window.addEventListener('focus', recheck); // coming back from the sign-in window
})();
