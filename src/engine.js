
// ======================= Shared vocabulary =======================
// Every theme speaks the same state vocabulary; themes may add animations (th.anims) and frame specs (th.specs).
const ANIMS = {
  'walk-down': { n: 4, rate: 8 },  'walk-up': { n: 4, rate: 8 },  'walk-side': { n: 4, rate: 8 },
  'idle-down': { n: 4, rate: 2 },  'idle-up': { n: 2, rate: 2 },  'idle-side': { n: 4, rate: 2 },
  fidget: { n: 4, rate: 4 },
  type:   { n: 4, rate: 9 },
  sleep:  { n: 2, rate: 1 },
  coffee: { n: 4, rate: 1.6 },
  needs:  { n: 2, rate: 3 },
  done:   { n: 4, rate: 5, yOff: [0, -3, 0, -3] },
  failed: { n: 2, rate: 1.5 },
};
const STATES = {
  idle:    { label: 'Idle',      behaviour: 'roam' },
  working: { label: 'Working',   behaviour: 'desk' },
  needs:   { label: 'Needs you', behaviour: 'pose', anim: 'needs' },
  done:    { label: 'Done',      behaviour: 'pose', anim: 'done' },
  failed:  { label: 'Failed',    behaviour: 'pose', anim: 'failed' },
};
const ORDER = Object.keys(STATES);

// ======================= Navigation (grid + line-of-sight smoothing) =======================
// makeNav(w, h, blocks) -> route(bot, spot): waypoints from the bot to the spot, via spot.approach and the
// bot's current seat exit (bot.at.exit) when they exist. blocks are [col0, row0, col1, row1] tile rectangles.
function makeNav(w, h, blocks) {
  const COLS = w / T, ROWS = h / T, blocked = new Uint8Array(COLS * ROWS);
  blocks.forEach(([c0, r0, c1, r1]) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[r * COLS + c] = 1; });
  const isBlocked = (x, y) => { const c = Math.floor(x / T), r = Math.floor(y / T); return c < 0 || r < 0 || c >= COLS || r >= ROWS || blocked[r * COLS + c] === 1; };
  const clearLine = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
    for (let i = 0; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
      if (isBlocked(x, y) || isBlocked(x - 4, y) || isBlocked(x + 4, y)) return false;
    }
    return true;
  };
  function bfs(sx, sy, gx, gy) {
    const tile = (x, y) => [Math.floor(x / T), Math.floor(y / T)];
    let [sc, sr] = tile(sx, sy); const [gc, gr] = tile(gx, gy);
    if (blocked[sr * COLS + sc]) {
      let best = null;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!blocked[r * COLS + c]) {
        const d = Math.abs(c - sc) + Math.abs(r - sr); if (!best || d < best[0]) best = [d, c, r];
      }
      sc = best[1]; sr = best[2];
    }
    const prev = new Int16Array(COLS * ROWS).fill(-2); prev[sr * COLS + sc] = -1;
    const q = [sr * COLS + sc];
    for (let i = 0; i < q.length; i++) {
      const cur = q[i]; if (cur === gr * COLS + gc) break;
      const c = cur % COLS, r = (cur / COLS) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
        const nc = c + dc, nr = r + dr, n = nr * COLS + nc;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || blocked[n] || prev[n] !== -2) return;
        prev[n] = cur; q.push(n);
      });
    }
    const out = []; let cur = gr * COLS + gc;
    if (prev[cur] === -2) return [];
    while (cur !== -1) { out.push({ x: (cur % COLS) * T + T / 2, y: ((cur / COLS) | 0) * T + T / 2 }); cur = prev[cur]; }
    return out.reverse();
  }
  return function route(bot, spot) {
    const pts = []; let sx = bot.x, sy = bot.y;
    if (bot.at && bot.at.exit) { pts.push(bot.at.exit); sx = bot.at.exit.x; sy = bot.at.exit.y; }
    const goal = spot.approach || spot;
    const nodes = bfs(sx, sy, goal.x, goal.y).concat([{ x: goal.x, y: goal.y }]);
    let cur = { x: sx, y: sy }, i = 0;
    while (i < nodes.length) {
      let j = i;
      for (let k = nodes.length - 1; k > i; k--) if (clearLine(cur, nodes[k])) { j = k; break; }
      pts.push(nodes[j]); cur = nodes[j]; i = j + 1;
    }
    if (spot.approach) pts.push({ x: spot.x, y: spot.y });
    return pts;
  };
}

// ======================= Default behaviour scripts =======================
// A script is a generator yielding steps:
//   { walk: spot }                    walk there (spot: x, y, face, optional approach / exit / zone)
//   { travel: spot }                  theme-driven motion: th.travel(bot, spot) returns { update(dt) -> done }
//   { do: anim, t: seconds }          play an animation; optional until() ends it early,
//                                     dx slides sideways over t, on(bot) runs once at the start
// Defaults read spots.{desk, pose, bed, coffee, wander} and world.{bed, coffee}; themes override per state via th.behaviours.
const pick = (a, not) => { let s; do { s = a[Math.floor(Math.random() * a.length)]; } while (s === not && a.length > 1); return s; };
const rand = (a, b) => a + Math.random() * (b - a);

function* scriptIdle(bot) {
  const { spots, world } = bot.ctx;
  if (reduceMotion) { yield { walk: spots.pose[bot.i] }; yield { do: 'idle', t: Infinity }; return; }
  let n = 0, last = null;
  yield { walk: last = pick(spots.wander) }; yield { do: 'idle', t: rand(1, 3) };
  for (;;) {
    n++; const r = Math.random();
    const extra = n > 1 && bot.th.idleExtra && bot.th.idleExtra(bot);
    if (extra) { yield* extra; n = 1; continue; }
    if (n > 1 && r < 0.4 && !world.bed) {
      world.bed = bot;
      try { yield { walk: spots.bed }; yield { do: 'sleep', t: rand(9, 14) }; } finally { if (world.bed === bot) world.bed = null; }
      n = 0; continue;
    }
    if (n > 1 && r < 0.8 && !world.coffee) {
      world.coffee = bot;
      try { yield { walk: spots.coffee }; yield { do: 'coffee', t: rand(6, 9) }; } finally { if (world.coffee === bot) world.coffee = null; }
      continue;
    }
    yield { walk: last = pick(spots.wander, last) };
    yield { do: Math.random() < 0.5 ? 'fidget' : 'idle', t: rand(2, 4.5) };
  }
}
function* scriptDesk(bot) { yield { walk: bot.ctx.spots.desk[bot.i] }; yield { do: 'type', t: Infinity }; }
function* scriptPose(bot, def) {
  yield { walk: bot.ctx.spots.pose[bot.i] };
  yield { do: def.anim, t: def.anim === 'done' && !reduceMotion ? 4.5 : Infinity };
  yield* bot.script('roam');
}
const BEHAVIOURS = { roam: scriptIdle, desk: scriptDesk, pose: scriptPose };

// ======================= Bot =======================
// Theme hooks read here: th.speed, th.gaits, th.travel, th.offsetOf, th.botFx, th.fxDepth, th.noChair,
// th.behaviours, th.idleExtra; spot.chair places the seat prop (default: the desk spot itself).
class Bot {
  constructor(scene, ctx, i, s0) {
    const th = ctx.theme, d = ctx.spots.desk[i], c = d.chair || d;
    this.ctx = ctx; this.th = th; this.look = th.looks[i];
    this.i = i; this.scene = scene; this.x = s0.x; this.y = s0.y; this.dir = 'down'; this.at = null; this.zone = s0.zone || null;
    this.state = 'idle'; this.anim = 'idle-down'; this.t = 0; this.path = []; this.timer = 0; this.step = null; this.gen = null; this.walking = false;
    this.mode = 'walk'; this.seg = null; this.via = null; this.hopY = 0; this.motion = null; this.pending = false; this.until = null; this.slide = null;
    this.shadow = scene.add.image(s0.x, s0.y, 'fx-shadow').setOrigin(0.5, 0.7);
    this.chair = th.noChair ? null : scene.add.image(c.x, c.y, 'chair').setOrigin(...th.origin).setDepth(d.y);
    this.sprite = scene.add.sprite(s0.x, s0.y, 'x').setOrigin(...th.origin).setInteractive({ useHandCursor: true });
    this.sprite.setData('bot', this);
    this.fx = {
      bang: scene.add.image(0, 0, 'fx-bang'), cloud: scene.add.image(0, 0, 'fx-cloud'),
      rain: [0, 1, 2].map(() => scene.add.image(0, 0, 'fx-rain')),
      spark: [0, 1, 2].map(() => scene.add.image(0, 0, 'fx-spark')),
      z: [0, 1, 2].map(() => scene.add.image(0, 0, 'fx-z0')),
      steam: [0, 1, 2].map(() => scene.add.image(0, 0, 'fx-steam')),
    };
    Object.values(this.fx).flat().forEach(o => o.setDepth(th.fxDepth || 1000));
  }
  script(name) { return ((this.th.behaviours && this.th.behaviours[name]) || BEHAVIOURS[name])(this, STATES[this.state]); }
  setState(state) {
    this.state = state;
    if (this.motion) { this.pending = true; return; }   // a theme motion (flight) finishes first
    this.restart();
  }
  restart() { this.pending = false; this.divert(this.script(STATES[this.state].behaviour)); }
  divert(gen) {
    if (this.gen) this.gen.return();
    this.gen = gen; this.step = null; this.path = []; this.walking = false; this.timer = 0; this.until = null; this.slide = null; this.seg = null; this.hopY = 0;
  }
  setAnim(a) { if (a !== this.anim) { this.anim = a; this.t = 0; } }
  next() {
    const r = this.gen.next();
    this.step = r.done ? { do: 'idle', t: Infinity } : r.value;
    const s = this.step;
    this.slide = s.dx ? { rem: s.dx, rate: s.dx / s.t } : null;
    if (s.on) s.on(this);
    if (s.travel) {
      if (reduceMotion) { this.teleport(s.travel); return this.next(); }
      this.motion = this.th.travel(this, s.travel); this.walking = false; this.at = null; this.setAnim('idle-down');
    } else if (s.walk) {
      if (reduceMotion) { this.teleport(s.walk); return this.next(); }
      this.path = this.ctx.route(this, s.walk); this.at = null; this.walking = true; this.target = s.walk; this.until = null; this.mode = 'walk';
      if (!this.path.length) this.arrive();
    } else {
      this.timer = s.t; this.walking = false; this.until = s.until || null;
      this.setAnim(s.do === 'idle' ? 'idle-' + (this.dir === 'left' || this.dir === 'right' ? 'side' : this.dir) : s.do);
    }
  }
  // Route points may carry m (a th.gaits entry), z (zone entered on reaching it), via (the link being crossed) and last.
  finishPoint() {
    const p = this.path.shift(), g = this.th.gaits, nx = this.path[0];
    if (p.z) this.zone = p.z;
    this.via = p.via && !p.last ? p.via : null;
    if (!nx || !(g && g[nx.m] && g[nx.m].arc)) this.hopY = 0;
    this.seg = null;
  }
  teleport(spot) { this.x = spot.x; this.y = spot.y; this.dir = spot.face; this.at = spot; this.path = []; this.via = null; if (spot.zone) this.zone = spot.zone; }
  arrive() { this.walking = false; this.path = []; this.at = this.target; if (this.target.zone) this.zone = this.target.zone; this.dir = this.target.face; this.next(); }
  update(dt) {
    if (!this.gen) return;
    if (this.motion) {
      if (this.motion.update(dt)) { this.motion = null; if (this.pending) this.restart(); else this.next(); }
      this.t += reduceMotion ? 0 : dt; return;
    }
    if (!this.step) this.next();
    const gaits = this.th.gaits;
    if (this.walking) {
      let budget = (this.th.speed || 38) * dt;
      while (budget > 0 && this.path.length) {
        const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
        if (!this.seg || this.seg.p !== p) this.seg = { p, x0: this.x, y0: this.y, len: d || 1 };
        this.mode = p.m || 'walk';
        const g = gaits && gaits[this.mode], cost = (g && g.cost) || 1;
        if (d < 0.01) { this.finishPoint(); continue; }
        if (g && g.dir) this.dir = g.dir;
        else if (Math.abs(dx) > Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left'; else this.dir = dy > 0 ? 'down' : 'up';
        const m = Math.min(budget, d * cost), k = m / cost;
        this.x += dx / d * k; this.y += dy / d * k; budget -= m;
        this.hopY = g && g.arc ? -Math.sin(Math.PI * Math.min(1, Math.hypot(this.x - this.seg.x0, this.y - this.seg.y0) / this.seg.len)) * g.arc : 0;
        if (k >= d - 1e-6) this.finishPoint();
      }
      const g = gaits && gaits[this.mode];
      this.setAnim(g && g.anim ? g.anim : 'walk-' + (this.dir === 'left' || this.dir === 'right' ? 'side' : this.dir));
      if (!this.path.length && this.walking) { this.arrive(); }
    } else if (this.timer !== Infinity) {
      if (this.slide && this.slide.rem) {
        const m = Math.sign(this.slide.rem) * Math.min(Math.abs(this.slide.rem), Math.abs(this.slide.rate) * dt);
        this.x += m; this.slide.rem -= m;
      }
      this.timer -= dt; if (this.timer <= 0 || (this.until && this.until())) this.next();
    }
    this.t += reduceMotion ? 0 : dt;
  }
  destroy() {
    [this.shadow, this.chair, this.sprite, ...Object.values(this.fx).flat(), ...(this.dz || [])].forEach(o => o && o.destroy());
  }
  render(time) {
    const th = this.th, def = this.ctx.anims[this.anim], f = reduceMotion ? 0 : Math.floor(this.t * def.rate) % def.n;
    const off = th.offsetOf ? th.offsetOf(this, time) : [0, 0];
    const gy = Math.round(this.y), x = Math.round(this.x) + off[0], y = gy + off[1], yo = (def.yOff && !reduceMotion) ? def.yOff[f] : 0;
    // hovering looks float a few pixels above the floor while on their feet
    const hov = this.look.hover && /^(walk|idle|fidget|needs|done|coffee)/.test(this.anim)
      ? -3 + (reduceMotion ? 0 : Math.round(Math.sin(time * 3 + this.i * 1.7))) : 0;
    const g = this.walking && th.gaits && th.gaits[this.mode];
    this.sprite.setTexture(`${th.id}-${this.i}-${this.anim}-${f}`).setPosition(x, y + yo + hov + Math.round(this.hopY)).setDepth(gy + (this.anim === 'type' ? 0.5 : 0));
    this.sprite.setFlipX(this.dir === 'left' && this.anim !== 'type');
    const seated = this.anim === 'type', sleeping = this.anim === 'sleep';
    if (this.chair) this.chair.setVisible(!seated);
    this.shadow.setVisible(!seated && !sleeping && !(g && g.noShadow)).setPosition(x, y).setDepth(gy - 0.5);
    this.effects(time, f, x, y + hov);
    if (th.botFx) th.botFx(this, time);
  }
  effects(time, f, x, y) {
    const fx = this.fx, a = this.anim, t = reduceMotion ? 0 : time;
    Object.values(fx).flat().forEach(o => o.setVisible(false));
    const at = (o, px, py, alpha = 1) => o.setVisible(true).setPosition(Math.round(px), Math.round(py)).setAlpha(alpha);
    if (a === 'needs') at(fx.bang, x, y - 30 + (reduceMotion ? 0 : Math.floor(t * 3) % 2));
    if (a === 'failed') {
      const cy = y - 29 + (reduceMotion ? 0 : Math.floor(t * 1.5) % 2);
      at(fx.cloud, x, cy);
      fx.rain.forEach((o, k) => { const ph = reduceMotion ? 0.3 + k * 0.1 : ((t * 1.4 + k / 3) % 1); at(o, x - 4 + k * 4, cy + 5 + ph * 7, 1 - ph * 0.6); });
    }
    if (a === 'done') {
      [[-12, -16], [12, -19], [1, -30]].forEach(([dx, dy], k) => {
        if (reduceMotion || Math.floor(t * 4 + k) % 2 === 0) at(fx.spark[k], x + dx, y + dy);
      });
    }
    if (a === 'sleep') {
      fx.z.forEach((o, k) => {
        const ph = reduceMotion ? [0.15, 0.5, 0.85][k] : (t / 3 + k / 3) % 1;
        o.setTexture('fx-z' + Math.min(2, Math.floor(ph * 3)));
        at(o, x + 10 + ph * 12, y - 16 - ph * 20, Math.sin(Math.PI * ph));
      });
    }
    if (a === 'coffee' && !reduceMotion) {
      const s = this.dir === 'left' ? -1 : 1, cupY = [13, 11, 9, 11][f] - 24;
      fx.steam.forEach((o, k) => {
        const ph = (t * 0.9 + k / 3) % 1;
        at(o, x + s * 5 + Math.sin(ph * 7 + k * 2) * 1.5, y + cupY - 2 - ph * 9, 0.9 - ph * 0.9);
      });
    }
  }
}

// ======================= Scene (one per theme) =======================
// Theme manifest (everything optional unless marked):
//   id, bg, w, h, origin, out, looks (required); anims / specs: extra animations and frame specs
//   spots() -> { desk[], pose[], ... } (required), route(bot, spot) (required), world() -> shared mutable state
//   start(i) -> { x, y, zone? }, botCount, speed, fxDepth, noChair
//   chair / cup / sleepCover (sprite drawing), fx (effect glyphs), props(put) (static art)
//   deskFx { frames, at(i), depth } (glow on a used desk), ambient(scene, ctx) -> (now, dt) per frame
//   behaviours { roam, desk, pose }, idleExtra(bot), gaits, travel(bot, spot), offsetOf(bot, now), botFx(bot, now)
const chairTex = (th) => { const cv = mk(24, 24); (th.chair || drawChair)(cv.getContext('2d')); return outline(cv, th.out || OUT); };
function makeScene(ctx) {
  const th = ctx.theme;
  return class extends Phaser.Scene {
    create() {
      const tex = (key, cv) => this.textures.addCanvas(key, cv);
      const ensureLook = (i) => {
        if (this.textures.exists(`${th.id}-${i}-walk-down-0`)) return;
        Object.entries(ctx.anims).forEach(([anim, def]) => {
          for (let f = 0; f < def.n; f++) tex(`${th.id}-${i}-${anim}-${f}`, charFrame(th, th.looks[i], anim, f));
        });
      };
      tex('x', mk(24, 24));
      if (!th.noChair) tex('chair', chairTex(th));
      Object.entries(th.fx).forEach(([k, fn]) => tex('fx-' + k, fn()));
      const put = (key, cv, x, y, depth) => { tex(key, cv); return this.add.image(x, y, key).setOrigin(0, 0).setDepth(depth); };
      if (th.props) th.props(put);
      ctx.deskImgs = null;
      if (th.deskFx) {
        th.deskFx.frames.forEach((fn, k) => tex('dfx' + k, fn()));
        ctx.deskImgs = ctx.spots.desk.map((d, i) => {
          const [x, y] = th.deskFx.at(i);
          return this.add.image(x, y, 'dfx0').setOrigin(0, 0).setDepth(th.deskFx.depth === undefined ? d.y - 0.8 : th.deskFx.depth).setVisible(false);
        });
      }
      ctx.amb = th.ambient ? th.ambient(this, ctx) : null;
      ctx.bots = [];
      // Bring the avatars in line with th.looks / th.botCount without rebuilding the scene: add the missing
      // ones, drop the extra ones, and refresh names (a look's art depends only on its slot, so slots keep their textures).
      ctx.sync = () => {
        const want = th.botCount || th.looks.length;
        while (ctx.bots.length > want) {
          const b = ctx.bots.pop(), arena = ctx.world.arena;
          if (arena && arena.bots.includes(b)) { // drop a duel the leaving avatar was in
            ctx.world.arena = null;
            arena.bots.forEach(m => { if (m !== b) { m.dueling = false; m.setState(m.state); } });
          }
          b.destroy();
        }
        ctx.bots.forEach((b, i) => { b.look = th.looks[i]; });
        for (let i = ctx.bots.length; i < want; i++) {
          ensureLook(i);
          const b = new Bot(this, ctx, i, th.start ? th.start(i) : { x: 110 + 28 * i, y: 168 - (i % 2) * 14 });
          b.setState('idle');
          ctx.bots.push(b);
        }
      };
      ctx.sync();
      this.input.on('gameobjectdown', (_p, obj) => { const b = obj.getData('bot'); if (b) ctx.cycle(b); });
      ctx.announce(STATES.idle.label);
    }
    update(time, delta) {
      const dt = Math.min(delta / 1000, 0.1), now = time / 1000;
      ctx.now = now;
      ctx.bots.forEach(b => { b.update(dt); b.render(now); });
      if (ctx.deskImgs) {
        const fr = reduceMotion ? 0 : Math.floor(now * 3) % th.deskFx.frames.length;
        ctx.deskImgs.forEach((im, i) => {
          const on = ctx.bots.some(b => b.anim === 'type' && b.at === ctx.spots.desk[i]);
          im.setVisible(on); if (on) im.setTexture('dfx' + fr);
        });
      }
      if (ctx.amb) ctx.amb(now, dt);
    }
  };
}
