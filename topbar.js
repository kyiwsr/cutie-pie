(() => {
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const getJson = (url) => fetch(url).then((r) => r.json());

// ---------- MCP connector strip ----------
const STATUS_TIP = { connected: 'connected', 'needs-auth': 'needs authentication (run claude, then /mcp)', failed: 'failed to connect', pending: 'connecting…' };
async function loadConnectors(refresh) {
  const box = $('topconn');
  // Working without Claude: show opencode's own connectors, and only the ones that are connected.
  const off = document.body.dataset.noClaude === '1';
  const { servers } = await getJson('/api/mcp' + (off ? '?source=opencode' : refresh ? '?refresh=1' : ''));
  if ((document.body.dataset.noClaude === '1') !== off) return; // the mode changed while this loaded; the newer load wins
  box.replaceChildren();
  servers.forEach((s) => {
    const tip = `${s.name} — ${STATUS_TIP[s.status] || s.status}`;
    let chip;
    if (s.logo) { chip = el('img', 'chip'); chip.src = `/logos/${s.logo}.png`; chip.alt = s.name; }
    else chip = el('span', 'chip', s.name.slice(0, 2).toUpperCase());
    chip.classList.add('st-' + s.status);
    chip.title = tip;
    box.append(chip);
  });
}

// ---------- usage gauge ----------
const when = (ts) => (ts ? new Date(ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
function gauge(label, x) {
  if (!x) return [];
  const cls = x.percent >= 90 ? 'c' : x.percent >= 75 ? 'w' : '';
  const bar = el('span', 'ub'); const fill = el('i', cls); fill.style.width = x.percent + '%'; bar.append(fill);
  return [el('span', null, label), bar, el('b', null, x.percent >= 100 ? 'LIMIT' : x.percent + '%')];
}
async function loadUsage() {
  const box = $('topusage'); const u = await getJson('/api/usage');
  box.replaceChildren();
  if (u.ok) {
    box.className = u.stale ? 'tm-usage off' : 'tm-usage';
    box.append(...gauge('SESSION', u.session), ...(u.session && u.week ? [el('span', 'sep', '·')] : []), ...gauge('WEEK', u.week));
    box.title = `Your Claude plan. Session resets ${when(u.session?.resetsAt)} · week resets ${when(u.week?.resetsAt)}.` + (u.stale ? ` Last known numbers (${u.reason || 'refresh failed'}).` : '');
  } else {
    box.className = 'tm-usage off';
    box.append(el('span', null, 'USAGE UNAVAILABLE'));
    box.title = u.reason || '';
  }
}

// ---------- Manage Agents ----------
const PRESETS = [
  ['Assistant', 'You are a general-purpose assistant. Be concise and do what is asked.'],
  ['Researcher', 'You are a researcher. Find and read the relevant files or sources, cross-check facts, and report your findings with where each one came from. Say clearly when something is unknown.'],
  ['Coder', 'You are a software engineer. Read the existing code before changing it, make small focused changes that match the surrounding style, and explain what you changed and why.'],
  ['Reviewer', 'You are a code reviewer. Look for bugs, security problems and unclear code. List the issues by severity with the file and line, and suggest a fix for each. Do not rewrite code unless asked.'],
  ['Writer', 'You are a writer and editor. Write clear, direct copy in the requested tone. Keep it short, avoid filler, and ask for missing details instead of guessing.'],
  ['Planner', 'You are a project planner. Break the goal into small ordered steps, flag risks and dependencies, and keep the plan short enough to act on.'],
  ['Analyst', 'You are a data analyst. Inspect the data first, state your assumptions, show the numbers behind each conclusion, and point out anything that looks wrong.'],
  ['System expert', 'You are a system expert for this computer. Search and read files on this device to answer questions. Explain what you found and where you found it. Do not change anything unless asked.'],
];
const dlg = $('manage'), list = $('mlist'), form = $('mform'), err = $('merr');
let agents = [], editing = null;

async function loadAgents() { agents = await getJson('/api/agents'); renderList(); }
const syncOffice = () => { window.dispatchEvent(new Event('agents-changed')); if (window.office) window.office.setAgents(agents); };
function renderList() {
  list.replaceChildren();
  agents.forEach((a) => {
    const row = el('div', 'arow');
    const info = el('div', 'ainfo'); info.append(el('b', null, a.name), el('span', null, [a.provider === 'opencode' ? 'opencode · ' + a.model.replace(/^opencode\//, '') : a.model, a.provider !== 'opencode' && a.effort && `${a.effort} thinking`, a.tools || 'no tools'].filter(Boolean).join(' · ')));
    const edit = el('button', null, 'Edit'); edit.type = 'button'; edit.onclick = () => startEdit(a);
    const del = el('button', 'danger', 'Delete'); del.type = 'button'; del.onclick = () => remove(a);
    row.append(info, edit, del); list.append(row);
  });
}
// ---- allowed tools: a checkbox list of Claude Code's built-in tools ----
const TOOL_INFO = [
  ['Read', 'Read files'],
  ['Glob', 'Find files by name'],
  ['Grep', 'Search for text inside files'],
  ['Edit', 'Change parts of existing files'],
  ['Write', 'Create or overwrite files'],
  ['NotebookEdit', 'Edit Jupyter notebook cells'],
  ['Bash', 'Run commands on this computer'],
  ['WebFetch', 'Open a web page and read it'],
  ['WebSearch', 'Search the web'],
  ['Agent', 'Hand a job to a helper agent'],
  ['Skill', 'Use saved skills'],
  ['TodoWrite', 'Keep a to-do list while working'],
];
const TOOLS = TOOL_INFO.map((t) => t[0]);
const DEFAULT_TOOLS = ['Read', 'Glob', 'Grep'];
const toolList = $('mtoolList');
const toolRows = {};
TOOL_INFO.forEach(([t, desc]) => {
  const row = el('label'), box = document.createElement('input');
  box.type = 'checkbox'; box.value = t;
  row.append(box, el('b', null, t), el('span', null, desc)); toolList.append(row);
  toolRows[t] = row;
});
// Tools with no V2 action: hidden for opencode so the UI never promises a
// restriction the runtime does not enforce. Stored values are kept (see setTools/
// getTools and extraTools) so switching back to Claude restores them.
const NO_V2_ACTION = ['NotebookEdit', 'TodoWrite'];
function syncToolVisibility() {
  const opencode = form.provider.value === 'opencode';
  NO_V2_ACTION.forEach((t) => { if (toolRows[t]) toolRows[t].style.display = opencode ? 'none' : ''; });
  // Effort is a Claude-only setting: hide it for opencode but keep the value
  // so switching back to Claude restores prior behavior.
  form.effort.closest('label').hidden = opencode;
}
const toolsBtn = $('mtoolsBtn'), toolsCard = $('mtoolsCard'), toolsCount = $('mtoolsCount');
const showTools = (on) => { toolsCard.hidden = !on; toolsBtn.setAttribute('aria-expanded', String(on)); };
const updateToolCount = () => {
  const n = toolList.querySelectorAll('input:checked').length + extraTools.length;
  toolsCount.textContent = n ? `${n} selected` : 'none selected';
};
toolsBtn.onclick = () => showTools(toolsCard.hidden);
$('mtoolsDone').onclick = () => { showTools(false); toolsBtn.focus(); };
toolList.addEventListener('change', updateToolCount);
let extraTools = []; // entries saved earlier that are not in the list (e.g. "Bash(git *)") are kept as they were
const splitTools = (str) => String(str || '').split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);
function setTools(str) {
  const have = splitTools(str);
  toolList.querySelectorAll('input').forEach((b) => { b.checked = have.includes(b.value); });
  extraTools = have.filter((x) => !TOOLS.includes(x));
  updateToolCount();
}
const getTools = () => [...[...toolList.querySelectorAll('input:checked')].map((b) => b.value), ...extraTools].join(',');

const OTHER = '__other__';
const presetBox = $('mpresets');
presetBox.append(new Option('Choose a role…', ''));
PRESETS.forEach(([label, text]) => presetBox.append(new Option(label, text)));
presetBox.append(new Option('Other…', OTHER));
const isPreset = (text) => PRESETS.some((p) => p[1] === text);
// the dropdown mirrors the prompt: a known role, "Other" for any custom text, empty when blank
const markPreset = (text) => { presetBox.value = isPreset(text) ? text : text.trim() ? OTHER : ''; };
const otherRow = $('motherRow'), otherIn = $('mother');
const showOther = (on) => { otherRow.hidden = !on; if (!on) otherIn.value = ''; };
presetBox.addEventListener('change', () => {
  if (presetBox.value === OTHER) {
    form.role.value = ''; // choosing Other always starts from a blank prompt
    showOther(true); otherIn.focus();
  } else {
    showOther(false);
    if (presetBox.value) form.role.value = presetBox.value;
  }
});
// the role typed in the Other bar becomes the system prompt (still editable in the box below)
otherIn.addEventListener('input', () => {
  const r = otherIn.value.trim();
  form.role.value = r ? `Your role is ${r}. Be concise and do what is asked.` : '';
});
form.role.addEventListener('input', () => markPreset(form.role.value));
// ---- provider and model: the list of models depends on who runs the agent ----
const hint = $('mhint');
const CLAUDE_MODELS = [['', 'Default (your Claude setting)'], ['haiku', 'Haiku (fastest)'], ['sonnet', 'Sonnet (balanced)'], ['opus', 'Opus (most capable)']];
const RECOMMENDED_FREE = 'opencode/nemotron-3-ultra-free';
let ocInfo = null;
const loadOpencode = () => ocInfo || (ocInfo = fetch('/api/opencode').then((r) => r.json()).catch(() => ({ installed: false, models: [] })));
async function fillModels(selected) {
  const sel = form.model, save = form.querySelector('button[type=submit]');
  hint.className = 'hint'; hint.textContent = '';
  if (form.provider.value === 'claude') {
    sel.replaceChildren(...CLAUDE_MODELS.map(([v, t]) => new Option(t, v)));
    sel.value = CLAUDE_MODELS.some((m) => m[0] === selected) ? selected : '';
    sel.disabled = false; save.disabled = false;
    return;
  }
  sel.replaceChildren(new Option('Loading models…', '')); sel.disabled = true; save.disabled = true; // no saving until there is a model to save
  const info = await loadOpencode();
  save.disabled = false;
  if (form.provider.value !== 'opencode') return; // the provider was changed while this loaded
  if (info.needsUpgrade) {
    sel.replaceChildren(new Option('opencode 1.x — upgrade needed', ''));
    hint.className = 'hint bad'; hint.textContent = `This needs opencode 2 (found ${info.version || '1.x'}). Upgrade: npm install -g opencode-ai@latest, or curl -fsSL https://opencode.ai/install | bash (then restart Cutie Pie). See https://opencode.ai/v2/docs.`;
    return;
  }
  if (!info.installed || !info.models.length) {
    sel.replaceChildren(new Option('opencode is not installed', ''));
    hint.className = 'hint bad'; hint.textContent = 'Install it with: npm install -g opencode-ai@latest (then restart Cutie Pie). See the README.';
    return;
  }
  const group = (label, list) => { const g = document.createElement('optgroup'); g.label = label; list.forEach((m) => g.append(new Option(m.id.replace(/^opencode\//, ''), m.id))); return g; };
  const free = info.models.filter((m) => m.free), other = info.models.filter((m) => !m.free);
  sel.replaceChildren(group('Free, no account needed', free), ...(other.length ? [group('Other, from providers you signed in to', other)] : []));
  sel.disabled = false;
  sel.value = info.models.some((m) => m.id === selected) ? selected : (info.models.some((m) => m.id === RECOMMENDED_FREE) ? RECOMMENDED_FREE : info.models[0].id);
  hint.textContent = 'Free models need no account. Thinking level is a Claude setting and is ignored by opencode runs.';
}
form.provider.addEventListener('change', () => { syncToolVisibility(); fillModels(''); });

// Working without Claude (chosen on the login page): the form no longer offers Claude at all.
const noClaude = () => document.body.dataset.noClaude === '1';
const PROVIDERS = [['claude', 'Claude (needs a Claude login)'], ['opencode', 'opencode (free models available)']];
function setProviders() {
  form.provider.replaceChildren(...PROVIDERS.filter(([v]) => !(noClaude() && v === 'claude')).map(([v, t]) => new Option(t, v)));
}

function closeForm() { showTools(false); showOther(false); form.hidden = true; dlg.classList.remove('editing'); }
async function startEdit(a) {
  editing = a ? a.id : null;
  $('mformTitle').textContent = a ? `Edit ${a.name}` : 'New agent';
  form.name.value = a ? a.name : ''; form.role.value = a ? a.role : ''; markPreset(form.role.value); setTools(a ? a.tools : DEFAULT_TOOLS.join(',')); form.effort.value = a ? (a.effort || '') : '';
  setProviders();
  form.provider.value = noClaude() ? 'opencode' : a && a.provider ? a.provider : 'claude';
  syncToolVisibility();
  showTools(false); showOther(false); err.textContent = ''; form.hidden = false; dlg.classList.add('editing'); form.name.focus();
  await fillModels(a ? a.model || '' : '');
}
async function remove(a) {
  if (!confirm(`Delete ${a.name}?`)) return;
  const r = await fetch('/api/agents/' + a.id, { method: 'DELETE' });
  if (!r.ok) { alert((await r.json()).error); return; }
  await loadAgents(); syncOffice();
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = JSON.stringify({ name: form.name.value, role: form.role.value, tools: getTools(), provider: form.provider.value, model: form.model.value, effort: form.effort.value });
  const r = await fetch(editing ? '/api/agents/' + editing : '/api/agents', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!r.ok) { err.textContent = (await r.json()).error; return; }
  closeForm(); await loadAgents(); syncOffice();
});
$('topManage').onclick = async () => { closeForm(); await loadAgents(); dlg.showModal(); };
$('mnew').onclick = () => startEdit(null);
$('mcancel').onclick = closeForm;
$('mclose').onclick = () => dlg.close();

loadConnectors(); loadUsage();
window.addEventListener('claude-mode', () => loadConnectors()); // signed in with Claude <-> working with opencode
setInterval(loadUsage, 5 * 60 * 1000);
})();
