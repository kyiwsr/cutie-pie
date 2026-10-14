
// ======================= Boot: one lazily created game per theme =======================
const THEMES = { castle: CASTLE };
const ctxs = [];

// ---- one avatar per agent (max 10): the castle's five stock looks, recoloured when they run out ----
const MAX_AGENTS = 10;
const BASE_LOOKS = CASTLE.looks;
function hueShift(hex, deg) {
  const [r, g, b] = rgb(hex).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return hex;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hexOf([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]);
}
function lookFor(agent, i) {
  const base = BASE_LOOKS[i % BASE_LOOKS.length], turn = Math.floor(i / BASE_LOOKS.length) * 70;
  const look = Object.assign({}, base, { name: agent.name });
  if (turn) { look.hair = hueShift(base.hair, turn); look.shirt = hueShift(base.shirt, turn); }
  return look;
}
function applyAgents(list) {
  const agents = list.slice(0, MAX_AGENTS);
  if (window.office) window.office.agents = agents; // slot i of the castle = agents[i]
  CASTLE.looks = agents.map(lookFor);
  CASTLE.botCount = agents.length;
}
let agentsReady = fetch('/api/agents').then(r => r.json()).then(applyAgents).catch(() => applyAgents([{ name: 'MASTER' }]));
// the page calls this after the roster changes: the scene adds, removes and renames avatars in place (no rebuild, no flash)
const castleCtx = () => ctxs.find(c => c.game && c.bots && c.bots.length);
const bubbleEls = {}; // slot -> speech/thought bubble element
// An avatar in a duel must leave it cleanly, or its sparring partner waits for it forever.
function leaveDuel(ctx, bot) {
  const arena = ctx.world.arena;
  if (arena && arena.bots.includes(bot)) {
    ctx.world.arena = null;
    arena.bots.forEach(m => { if (m !== bot) { m.dueling = false; m.setState(m.state); } });
  }
}
window.office = {
  court: CASTLE.court,
  // Walk the avatar in `slot` to `spot` and hold it there. Resolves on arrival.
  summon(slot, spot) {
    return new Promise(resolve => {
      const ctx = castleCtx(), bot = ctx && ctx.bots[slot];
      if (!bot) return resolve();
      leaveDuel(ctx, bot);
      bot.dueling = true; // keeps the idle script from pulling it into a duel
      bot.divert((function* () { yield { walk: spot }; yield { do: 'idle', t: Infinity, on: () => resolve() }; })());
    });
  },
  // Walk the avatar to its own desk and start working there. Resolves once it is seated.
  work(slot) {
    return new Promise(resolve => {
      const ctx = castleCtx(), bot = ctx && ctx.bots[slot];
      if (!bot) return resolve();
      leaveDuel(ctx, bot);
      bot.dueling = true;
      const desk = ctx.spots.desk[bot.i];
      bot.divert((function* () { yield { walk: desk }; yield { do: 'type', t: Infinity, on: () => resolve() }; })());
    });
  },
  // Let the avatar go back to wandering.
  dismiss(slot) {
    const ctx = castleCtx(), bot = ctx && ctx.bots[slot];
    if (bot) { bot.dueling = false; bot.restart(); }
  },
  // A speech ('say') or thought ('think') bubble over the avatar in `slot`.
  say(slot, text, kind = 'say') {
    const ctx = castleCtx();
    if (!ctx || !ctx.bots[slot]) return;
    let el = bubbleEls[slot];
    if (!el) { el = bubbleEls[slot] = document.createElement('div'); ctx.nameLayer.appendChild(el); }
    el.className = 'bubble ' + kind;
    el.textContent = text;
  },
  clearBubble(slot) { if (bubbleEls[slot]) { bubbleEls[slot].remove(); delete bubbleEls[slot]; } },
  agents: [],
  onAgentClick: null, // the page sets this: called with the agent's slot when its avatar is clicked
  setAgents(list) {
    applyAgents(list);
    ctxs.forEach(ctx => { if (ctx.game && ctx.sync) ctx.sync(); });
  },
};


function setupTheme(stage) {
  const th = THEMES[stage.dataset.theme];
  const ctx = {
    theme: th, stage, holder: stage.querySelector('.game'), statusEl: stage.querySelector('.status'),
    anims: Object.assign({}, ANIMS, th.anims), spots: th.spots(), route: th.route, world: th.world ? th.world() : { bed: null, coffee: null },
    bots: [], game: null, now: 0,
  };
  ctx.announce = (text) => { if (ctx.statusEl) ctx.statusEl.textContent = text; };
  ctx.syncButtons = () => {
    const same = ctx.bots.length && ctx.bots.every(b => b.state === ctx.bots[0].state) ? ctx.bots[0].state : null;
    stage.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.state === same)));
  };
  ctx.setAll = (state) => { ctx.bots.forEach(b => b.setState(state)); ctx.syncButtons(); ctx.announce(STATES[state].label); };
  ctx.cycle = (b) => { if (window.office.onAgentClick) window.office.onAgentClick(b.i); }; // clicking an avatar opens its chat
  // Fullscreen: scale the scene to cover the stage area below the top bar (no side margins), keeping its aspect ratio; overflow is cropped.
  ctx.size = () => {
    const s = Math.max(ctx.stage.clientWidth / th.w, ctx.stage.clientHeight / th.h);
    ctx.holder.style.width = th.w * s + 'px'; ctx.holder.style.height = th.h * s + 'px';
    return Math.max(1, Math.ceil(s));
  };
  ctx.size();
  // keep Phaser's pointer mapping in sync with the (CSS-scaled) canvas before it reads the click
  ['pointerdown', 'mousedown', 'touchstart'].forEach(ev =>
    ctx.holder.addEventListener(ev, () => ctx.game && ctx.game.scale.updateBounds(), true));
  stage._ctx = ctx; ctxs.push(ctx);
  return ctx;
}

function startGame(ctx) {
  const th = ctx.theme;
  ctx.game = new Phaser.Game({
    type: Phaser.AUTO, parent: ctx.holder, width: th.w, height: th.h, pixelArt: true, backgroundColor: th.bg,
    banner: false, audio: { noAudio: true },
    scene: makeScene(ctx), scale: { mode: Phaser.Scale.NONE, zoom: ctx.size() },
  });
  attachNames(ctx);
}

// Name tags: HTML labels above each avatar, so the text stays sharp at any window size.
function attachNames(ctx) {
  if (!ctx.nameLayer) {
    ctx.nameLayer = document.createElement('div');
    ctx.nameLayer.className = 'names';
    ctx.holder.appendChild(ctx.nameLayer);
  }
  const layer = ctx.nameLayer;
  layer.replaceChildren();
  let tags = [];
  ctx.game.events.on('poststep', () => {
    const bots = ctx.bots;
    if (!bots.length) return;
    if (tags.length !== bots.length) {
      layer.replaceChildren();
      tags = bots.map(b => { const d = document.createElement('div'); d.className = 'name'; d.textContent = b.look.name; layer.appendChild(d); return d; });
    }
    const k = ctx.holder.clientWidth / ctx.theme.w;
    layer.style.fontSize = Math.max(11, Math.round(k * 3.4)) + 'px';
    Object.entries(bubbleEls).forEach(([slot, el]) => {
      const b = bots[slot];
      if (!b) { el.remove(); delete bubbleEls[slot]; return; }
      const atThrone = b.sprite.y < 60; // no room above the throne, so the bubble goes to the side
      el.classList.toggle('left', atThrone); el.classList.toggle('up', !atThrone);
      el.style.transform = atThrone
        ? `translate(${(b.sprite.x - 20) * k}px, ${(b.sprite.y - 22) * k}px) translate(-100%, -50%)`
        : `translate(${b.sprite.x * k}px, ${(b.sprite.y - 46) * k}px) translate(-50%, -100%)`;
    });
    bots.forEach((b, i) => {
      if (tags[i].textContent !== b.look.name) tags[i].textContent = b.look.name;
      tags[i].style.transform = `translate(${b.sprite.x * k}px, ${(b.sprite.y - 30) * k}px) translate(-50%, -100%)`;
    });
  });
}

document.querySelectorAll('.stage').forEach(setupTheme);

// Create each game when its section nears the viewport; sleep the render loop while offscreen.
const io = new IntersectionObserver((entries) => entries.forEach(e => {
  const ctx = e.target._ctx;
  if (e.isIntersecting) { if (!ctx.game && !ctx.starting) { ctx.starting = true; agentsReady.then(() => { ctx.starting = false; if (!ctx.game) startGame(ctx); }); } else if (ctx.game) ctx.game.loop.wake(); }
  else if (ctx.game) ctx.game.loop.sleep();
}), { rootMargin: '200px 0px' });
ctxs.forEach(ctx => io.observe(ctx.stage));

mq.addEventListener('change', () => { reduceMotion = mq.matches; ctxs.forEach(c => c.bots.forEach(b => b.setState(b.state))); });
addEventListener('resize', () => ctxs.forEach(c => { c.size(); if (c.game) { c.game.scale.setZoom(c.size()); c.game.scale.refresh(); } }));
