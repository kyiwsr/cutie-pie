(() => {
const $ = (id) => document.getElementById(id);
const bar = $('chatWrap'), barForm = $('chat'), barIn = $('chatIn'), barSend = $('chatSend'), barPick = $('chatAgent');
const convo = $('convo'), log = $('convoLog'), form = $('convoForm'), input = $('convoIn'), send = $('convoSend'), pick = $('convoAgent');
const sessions = {};  // agent id -> Claude session id, so follow-ups keep context
const history = {};   // agent id -> [{ text, cls }]: every agent has its own chat
const running = {};   // agent id -> true while that agent is working

// ---------- the panel shows the chat of whichever agent is selected ----------
const node = (text, cls) => {
  const d = document.createElement('div');
  d.className = ['tool', 'wait', 'handoff'].includes(cls) ? cls : 'msg ' + cls;
  d.textContent = text;
  return d;
};
function render() {
  const id = pick.value;
  log.replaceChildren(...(history[id] || []).map((m) => node(m.text, m.cls)));
  if (running[id]) log.append(node('Working…', 'wait'));
  log.scrollTop = log.scrollHeight;
  const busy = !!running[id];
  [barIn, barSend, input, send].forEach((e) => { e.disabled = busy; });
}
function add(agentId, text, cls) {
  (history[agentId] = history[agentId] || []).push({ text, cls });
  if (agentId !== pick.value) return; // it is stored, and shows when you switch to that agent
  log.querySelector('.wait')?.remove();
  log.append(node(text, cls));
  if (running[agentId]) log.append(node('Working…', 'wait'));
  log.scrollTop = log.scrollHeight;
}

// ---------- agents (both pickers show the same list and stay in step) ----------
async function loadAgents() {
  const agents = await fetch('/api/agents').then((r) => r.json());
  const keep = pick.value;
  [barPick, pick].forEach((sel) => {
    sel.replaceChildren(...agents.map((a) => { const o = document.createElement('option'); o.value = a.id; o.textContent = a.name; return o; }));
    sel.hidden = agents.length < 2;
  });
  if (agents.some((a) => a.id === keep)) barPick.value = pick.value = keep;
  render();
}
barPick.addEventListener('change', () => { pick.value = barPick.value; render(); });
pick.addEventListener('change', () => { barPick.value = pick.value; render(); });

// ---------- which chat is showing: the bottom bar, or the panel on the left ----------
function openConvo() { bar.hidden = true; convo.hidden = false; input.focus(); }
function closeConvo() { convo.hidden = true; bar.hidden = false; barIn.focus(); }
$('convoMin').onclick = closeConvo;

// clicking an avatar in the castle opens the chat with that agent
window.office.onAgentClick = (slot) => {
  const a = window.office.agents[slot];
  if (!a) return;
  const id = a.id || [...pick.options].find((o) => o.textContent === a.name)?.value;
  if (id) { barPick.value = pick.value = id; render(); }
  openConvo();
};

// ---------- sending ----------
const nameOf = (id) => [...pick.options].find((o) => o.value === id)?.textContent || id;
const isAgent = (id) => [...pick.options].some((o) => o.value === id);
const slotOf = (id) => window.office.agents.findIndex((a) => a.id === id); // an agent's avatar in the castle
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (t, n = 150) => { const s = String(t).replace(/[*#`>_]/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const HANDOFF = /<delegate\s+([^>]*?)>([\s\S]*?)<\/delegate>/g;
const attr = (attrs, name) => (attrs.match(new RegExp(name + '="([^"]*)"')) || [])[1] || '';
const MAX_ROUNDS = 3; // how many times an agent may hand work out and get answers back in one request

// Runs one agent and shows its reply in its own chat. Resolves with its text and any hand-offs it asked for.
// label: the bubble shown for the prompt (null = show none). allowHandoff: read <delegate> blocks in its replies.
// thinkBubble: show a "Thinking…" bubble over its avatar while it works.
async function runAgent(agentId, prompt, { label = prompt, labelCls = 'you', allowHandoff = false, thinkBubble = true } = {}) {
  const slot = slotOf(agentId);
  running[agentId] = true;
  if (label !== null) add(agentId, label, labelCls);
  if (thinkBubble) window.office.say(slot, 'Thinking…', 'think');
  render(); // shows "Working…" and locks this agent's inputs
  let text = '', shown = '';
  const handoffs = [];
  const onEvent = (ev) => {
    if (ev.type === 'system' && ev.session_id) sessions[agentId] = ev.session_id;
    else if (ev.type === 'assistant') {
      for (const c of ev.message.content) {
        if (c.type === 'text') {
          text += c.text + '\n';
          const before = handoffs.length;
          const visible = allowHandoff
            ? c.text.replace(HANDOFF, (_, attrs, task) => { handoffs.push({ to: attr(attrs, 'agent'), why: attr(attrs, 'why'), task: task.trim() }); return ''; }).trim()
            : c.text;
          if (visible) { add(agentId, visible, 'reply'); shown += visible + '\n'; }
          handoffs.slice(before).forEach((h) => {
            if (h.why) add(agentId, `Chose ${nameOf(h.to)}: ${h.why}`, 'handoff');
            add(agentId, `→ ${nameOf(h.to)}: ${h.task}`, 'handoff');
          });
        } else if (c.type === 'tool_use') add(agentId, `Using ${c.name}`, 'tool');
      }
    } else if (ev.type === 'result') {
      if (ev.session_id) sessions[agentId] = ev.session_id;
      if (ev.is_error) add(agentId, ev.result || 'error', 'err');
    } else if (ev.type === 'stderr' || ev.type === 'error') add(agentId, ev.text, 'err');
  };
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentId, prompt, session: sessions[agentId] }),
    });
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) try { onEvent(JSON.parse(line)); } catch {}
      }
    }
  } catch (err) {
    add(agentId, String(err), 'err');
  }
  running[agentId] = false;
  if (thinkBubble) window.office.clearBubble(slot);
  render();
  return { text: text.trim(), shown: shown.trim(), handoffs };
}

// One request from the user. If the agent hands work to teammates, the castle shows it: the master says he understood,
// shows why he picked each agent and takes the throne; each chosen agent is briefed there, goes to their desk to work,
// then comes back to the throne to report. The master stays on the throne until the results are in and he has reported.
//
// Timing: the real work never waits for the animation. A teammate's job starts the moment the hand-off is read, and the
// master's final summary starts the moment every job is done, while the visitors are still walking back to report.
async function converse(agentId, prompt) {
  const court = window.office.court, mSlot = slotOf(agentId), guests = new Set();
  let tookThrone = false, finalSaid = '';
  try {
    let r = await runAgent(agentId, prompt, { allowHandoff: true });
    for (let round = 1; r.handoffs.length && round <= MAX_ROUNDS; round++) {
      // 1. He understood; why he picked them
      tookThrone = true;
      const tasks = r.handoffs.map((h, k) => ({ ...h, slot: slotOf(h.to), spot: court.guests[k % court.guests.length], ok: isAgent(h.to) && h.to !== agentId }));
      window.office.say(mSlot, short(r.shown.split(/(?<=[.!?])\s/)[0] || 'Understood.', 110), 'say');
      const seated = window.office.summon(mSlot, court.seat);
      const arrivals = tasks.map((t) => { if (!t.ok || t.slot < 0) return Promise.resolve(); guests.add(t.slot); return window.office.summon(t.slot, t.spot); });
      sleep(1800).then(() => {
        const why = tasks.filter((t) => t.ok).map((t) => {
          const w = t.why || 'best fit for this task';
          return w.includes(nameOf(t.to)) ? w : `${nameOf(t.to)}: ${w}`; // do not repeat the name when the reason already says it
        }).join('\n');
        if (why) window.office.say(mSlot, why, 'think');
      });

      // 2. The real work starts now, in parallel with the walking and briefing below
      const jobs = tasks.map((t) => {
        if (!t.ok) return Promise.resolve({ to: t.to, text: 'There is no such teammate.' });
        if (running[t.to]) return Promise.resolve({ to: t.to, text: `${nameOf(t.to)} is busy with another task.` });
        return runAgent(t.to, t.task, { label: `From ${nameOf(agentId)}: ${t.task}`, thinkBubble: false })
          .then((res) => ({ to: t.to, text: res.text || '(no reply)' }));
      });

      // 3. The show: brief them one after another (Master has one bubble), then each goes to their desk, and returns to report
      const brief = tasks.map(() => { let done; const p = new Promise((res) => { done = res; }); return { p, done }; });
      (async () => {
        await Promise.all([seated, ...arrivals]);
        for (const [k, t] of tasks.entries()) {
          if (t.ok) {
            window.office.say(mSlot, `${nameOf(t.to)}, ${short(t.task, 120)}`, 'say'); await sleep(1800);
            window.office.say(t.slot, 'Understood. On it.', 'say'); await sleep(800);
          }
          brief[k].done();
        }
        const names = tasks.filter((t) => t.ok).map((t) => nameOf(t.to));
        if (names.length) window.office.say(mSlot, `Waiting for ${names.join(' and ')}…`, 'think');
      })();
      const visuals = Promise.all(tasks.map(async (t, k) => {
        if (!t.ok) return;
        await brief[k].p; // they have been told the task
        window.office.say(t.slot, 'Working…', 'think');
        const atDesk = window.office.work(t.slot); // walk to their desk and start typing
        const res = await jobs[k];
        await atDesk; // report only once the work is done and they are sitting at the desk
        await sleep(800);
        window.office.clearBubble(t.slot);
        await window.office.summon(t.slot, t.spot); // back to the throne
        window.office.say(mSlot, 'Thank you.', 'say'); // the answer itself shows in the chat, not as a bubble
        await sleep(1500); // a moment at the throne, then they go back to wandering
        window.office.clearBubble(t.slot); window.office.dismiss(t.slot); guests.delete(t.slot);
      }));

      // 4. As soon as every job is done the master starts his summary, while the visitors are still reporting
      const results = await Promise.all(jobs);
      add(agentId, `${results.map((x) => nameOf(x.to)).join(', ')} finished. Sending the results back.`, 'tool');
      const report = results.map((x) => `${nameOf(x.to)} replied:\n${x.text}`).join('\n\n');
      let summaryDone = false;
      const summary = runAgent(agentId, `Your teammates have finished. Their replies:\n\n${report}\n\nTell the user the outcome briefly.`,
        { label: null, allowHandoff: round < MAX_ROUNDS, thinkBubble: false }).finally(() => { summaryDone = true; });
      await visuals;
      if (!summaryDone) window.office.say(mSlot, 'Thinking…', 'think');
      r = await summary;
      window.office.clearBubble(mSlot);
      if (!r.handoffs.length) {
        // He has the information now: he says it aloud in a speech bubble (the full text is in the chat)
        finalSaid = short(r.shown || results.map((x) => x.text).join(' '), 260);
        window.office.say(mSlot, finalSaid, 'say');
      }
    }
  } finally {
    // he comes down only now: the completed task is in and he has reported; give the bubble time to be read
    if (!tookThrone) return;
    await sleep(finalSaid ? Math.min(8000, 2500 + finalSaid.length * 25) : 1000);
    window.office.clearBubble(mSlot);
    window.office.dismiss(mSlot);
    guests.forEach((s) => { window.office.clearBubble(s); window.office.dismiss(s); });
  }
}

async function sendMessage(prompt) {
  prompt = prompt.trim();
  const agentId = pick.value;
  if (!prompt || running[agentId]) return;
  openConvo();
  await converse(agentId, prompt);
  if (!convo.hidden && agentId === pick.value) input.focus();
}

barForm.addEventListener('submit', (e) => { e.preventDefault(); const t = barIn.value; barIn.value = ''; sendMessage(t); });
form.addEventListener('submit', (e) => { e.preventDefault(); const t = input.value; input.value = ''; sendMessage(t); });

window.addEventListener('agents-changed', loadAgents);
loadAgents();
})();
