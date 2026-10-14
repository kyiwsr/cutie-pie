(() => {
// ======================= Pixel helpers =======================
const T = 16;
const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = mq.matches;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const P = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
const rgb = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const hexOf = (a) => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shade = (c, k) => hexOf(rgb(c).map(v => v * k));
const lift = (c, n) => hexOf(rgb(c).map(v => v + n));
const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// Auto 1px outline around opaque pixels (consistent silhouette for every frame).
function outline(cv, col) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  const d = c.getImageData(0, 0, w, h), s = new Uint8ClampedArray(d.data);
  const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : s[(y * w + x) * 4 + 3];
  const [r, g, b] = rgb(col);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a(x, y) < 128 && (a(x - 1, y) > 128 || a(x + 1, y) > 128 || a(x, y - 1) > 128 || a(x, y + 1) > 128)) {
      const i = (y * w + x) * 4; d.data[i] = r; d.data[i + 1] = g; d.data[i + 2] = b; d.data[i + 3] = 255;
    }
  }
  c.putImageData(d, 0, 0);
  return cv;
}
const blob = (c, cx, cy, r, col) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 1) P(c, cx + x, cy + y, 1, 1, col);
};

// ======================= Character drawing =======================
const OUT = '#2b2230';
function pal(look) {
  return Object.assign({
    skin: look.skin, skinS: shade(look.skin, 0.82), hair: look.hair, hairH: lift(look.hair, 38),
    shirt: look.shirt, shirtS: shade(look.shirt, 0.78), shirtH: lift(look.shirt, 36),
    pants: '#3a4560', pantsS: '#2c354b', shoe: '#23232e', eye: '#1d1b2a', mouth: '#8a3b3b', blush: '#e8958f',
    white: '#f4f1ea', cup: '#d9d4c8', brown: '#5a3a22', hand: look.skin,
  }, look.p);
}

function hairExtras(c, p, style, view, hy) {
  const Y = (r) => r + hy;
  if (style === 'bun') {
    if (view === 'side') { P(c, 7, Y(2), 4, 2, p.hair); P(c, 8, Y(2), 2, 1, p.hairH); }
    else { P(c, 10, Y(2), 4, 1, p.hair); P(c, 9, Y(3), 6, 1, p.hair); P(c, 10, Y(2), 2, 1, p.hairH); }
  }
  if (style === 'curly') {
    P(c, 9, Y(3), 6, 1, p.hair); P(c, 7, Y(4), 10, 1, p.hair); P(c, 10, Y(3), 2, 1, p.hairH);
  }
}

function eyesDown(c, p, e, hy) {
  const Y = (r) => r + hy;
  if (e === 'open') { P(c, 10, Y(9), 1, 2, p.eye); P(c, 13, Y(9), 1, 2, p.eye); P(c, 9, Y(11), 1, 1, p.blush); P(c, 14, Y(11), 1, 1, p.blush); }
  if (e === 'blink') { P(c, 10, Y(10), 1, 1, p.eye); P(c, 13, Y(10), 1, 1, p.eye); }
  if (e === 'closed') { P(c, 9, Y(10), 2, 1, p.eye); P(c, 13, Y(10), 2, 1, p.eye); }
  if (e === 'x') {
    // 3x3 crosses, 2px gap between them so they read as X, not blocks
    [[8, 8], [13, 8]].forEach(([x, y]) => {
      [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]].forEach(([dx, dy]) => P(c, x + dx, Y(y + dy), 1, 1, p.eye));
    });
  }
}
function mouthDown(c, p, m, hy) {
  const Y = (r) => r + hy, M = p.mouth;
  if (m === 'smile') { P(c, 10, Y(11), 1, 1, M); P(c, 11, Y(12), 2, 1, M); P(c, 13, Y(11), 1, 1, M); }
  if (m === 'o') P(c, 11, Y(11), 2, 2, M);
  if (m === 'frown') { P(c, 10, Y(12), 1, 1, M); P(c, 11, Y(11), 2, 1, M); P(c, 13, Y(12), 1, 1, M); }
}

function headDown(c, p, look, s, back) {
  if (look.head) return look.head(c, p, s, back ? 'up' : 'down');
  const hy = s.hy || 0, Y = (r) => r + hy;
  if (back) {
    P(c, 8, Y(4), 8, 1, p.hair); P(c, 7, Y(5), 10, 7, p.hair); P(c, 10, Y(12), 4, 1, p.skin);
    P(c, 9, Y(5), 3, 1, p.hairH); P(c, 8, Y(6), 2, 1, p.hairH);
    hairExtras(c, p, look.hairStyle, 'up', hy);
    return;
  }
  P(c, 8, Y(7), 8, 5, p.skin); P(c, 9, Y(12), 6, 1, p.skinS);
  P(c, 8, Y(4), 8, 1, p.hair); P(c, 7, Y(5), 10, 2, p.hair);
  P(c, 7, Y(7), 1, 3, p.hair); P(c, 16, Y(7), 1, 3, p.hair);
  P(c, 8, Y(7), 3, 1, p.hair); P(c, 13, Y(7), 3, 1, p.hair); P(c, 8, Y(8), 1, 1, p.hair); P(c, 15, Y(8), 1, 1, p.hair);
  P(c, 9, Y(5), 2, 1, p.hairH);
  if (look.hairStyle === 'long') { P(c, 7, Y(10), 1, 5, p.hair); P(c, 16, Y(10), 1, 5, p.hair); }
  hairExtras(c, p, look.hairStyle, 'down', hy);
  eyesDown(c, p, s.eyes || 'open', hy);
  mouthDown(c, p, s.mouth, hy);
}

function thruster(c, s) {
  P(c, 10, 19, 4, 1, '#6b7280'); P(c, 11, 19, 2, 1, '#8b93a1');
  if (!s.legTop) { const k = (s.hy || 0) & 1; P(c, 11, 20, 2, 2 + k, '#ff9f3a'); P(c, 11, 20, 2, 1, '#ffd23f'); }
}
function legsFront(c, p, s, top) {
  if (s.look.noLegs) return thruster(c, s);
  const t = top || 19;
  [[10, s.lf || 0, p.pants], [12, s.rf || 0, p.pants]].forEach(([x, l, col]) => {
    P(c, x, t, 2, 23 - t - l, col); P(c, x, 22 - l, 2, 1, p.shoe);
  });
  P(c, 11, t, 1, 3, p.pantsS);
}

function torso(c, p, ty) {
  P(c, 9, 13 + ty, 6, 6, p.shirt); P(c, 9, 13 + ty, 5, 1, p.shirtH);
  P(c, 14, 13 + ty, 1, 6, p.shirtS); P(c, 9, 18 + ty, 6, 1, p.shirtS);
}

function armHang(c, p, x, ty, d) {
  P(c, x, 14 + ty, 1, 3 + d, p.shirt); P(c, x, 17 + ty + d, 1, 1, p.hand);
}
// raised arm. mirror=true draws the right arm. hdx/hdy shift the hand.
function armUp(c, p, mirror, hdx = 0, hdy = 0) {
  const X = (x, w = 1) => mirror ? 24 - x - w : x;
  P(c, X(8), 14, 1, 1, p.shirt); P(c, X(7), 13, 1, 1, p.shirt); P(c, X(6), 9, 1, 4, p.shirt);
  P(c, X(5 + (mirror ? -hdx : hdx), 2), 7 + hdy, 2, 2, p.hand);
}

function viewDown(c, p, look, s, back) {
  const ty = s.ty || 0;
  if (!s.seated) legsFront(c, p, s, 19 + (s.legTop || 0));
  torso(c, p, ty);
  if (look.deco) look.deco(c, p, s, back ? 'up' : 'down');
  const arm = (mirror, v) => {
    if (typeof v === 'number') armHang(c, p, mirror ? 15 : 8, ty, v);
    else if (v === 'up') armUp(c, p, mirror);
    else if (v === 'wave0') armUp(c, p, mirror, 0, 0);
    else if (v === 'wave1') armUp(c, p, mirror, 1, -1);
  };
  arm(false, s.aL === undefined ? 0 : s.aL);
  if (s.aR === 'scratch0' || s.aR === 'scratch1') {
    const k = s.aR === 'scratch1' ? 1 : 0;
    P(c, 15, 14, 1, 1, p.shirt); P(c, 16, 11, 1, 3, p.shirt); P(c, 16, 13, 1, 1, p.shirt);
    P(c, 16 + k, 9, 2, 2, p.hand);
  } else arm(true, s.aR === undefined ? 0 : s.aR);
  headDown(c, p, look, s, back);
  if (back && look.hairStyle === 'long') { P(c, 8, 12 + (s.hy || 0), 8, 3, p.hair); P(c, 9, 12 + (s.hy || 0), 3, 1, p.hairH); }
}

function viewSeat(c, p, look, s) {
  // back view: arms reach forward to the keyboard, chair back drawn in front of the torso
  torso(c, p, 0);
  if (look.deco) look.deco(c, p, s, 'up');
  const arm = (mirror, h) => {
    const X = (x, w = 1) => mirror ? 24 - x - w : x;
    P(c, X(8), 14, 1, 1, p.shirt); P(c, X(7), 14, 1, 1, p.shirt);
    P(c, X(6), h + 2, 1, 13 - h, p.shirt); P(c, X(5, 2), h, 2, 2, p.hand);
  };
  arm(false, s.hL); arm(true, s.hR);
  headDown(c, p, look, s, true);
  (s.th.chair || drawChair)(c);
}

function drawChair(c) {
  P(c, 8, 17, 8, 3, '#5b6270'); P(c, 8, 17, 8, 1, '#737b8a');
  P(c, 7, 21, 10, 2, '#4a505c'); P(c, 7, 21, 10, 1, '#5d6574');
  P(c, 11, 23, 2, 1, '#2a2e36');
}

function viewUp(c, p, look, s) { viewDown(c, p, look, s, true); }

function defaultCup(c, cx, cy, p) {
  P(c, cx, cy, 3, 1, p.brown); P(c, cx, cy + 1, 3, 1, p.white); P(c, cx, cy + 2, 3, 1, p.cup); P(c, cx + 3, cy + 1, 1, 1, p.white);
}
function viewSide(c, p, look, s) {
  const hy = s.hy || 0, ty = s.ty || 0, Y = (r) => r + hy;
  const leg = (x, l, col) => { P(c, x, 19, 2, 4 - l, col); P(c, x, 22 - l, 3, 1, p.shoe); };
  const far = s.far || [10, 0], near = s.near || [11, 0];
  if (look.noLegs) thruster(c, s); else { leg(far[0], far[1], p.pantsS); leg(near[0], near[1], p.pants); }
  P(c, 9, 13 + ty, 6, 6, p.shirt); P(c, 9, 13 + ty, 6, 1, p.shirtH); P(c, 9, 13 + ty, 1, 6, p.shirtS); P(c, 9, 18 + ty, 6, 1, p.shirtS);
  if (look.deco) look.deco(c, p, s, 'side');
  if (look.head) look.head(c, p, s, 'side');
  else {
    if (look.hairStyle === 'long') P(c, 7, Y(10), 4, 5, p.hair);
    // head, facing right
    P(c, 12, Y(8), 5, 4, p.skin); P(c, 12, Y(12), 4, 1, p.skinS);
    P(c, 9, Y(4), 7, 1, p.hair); P(c, 7, Y(5), 10, 2, p.hair); P(c, 12, Y(7), 5, 1, p.hair);
    P(c, 7, Y(7), 5, 5, p.hair); P(c, 9, Y(5), 3, 1, p.hairH);
    P(c, 11, Y(9), 1, 2, p.skinS); P(c, 17, Y(10), 1, 1, p.skin);
    if (s.eyes === 'blink') P(c, 14, Y(10), 1, 1, p.eye);
    else if (s.eyes === 'closed') P(c, 13, Y(10), 2, 1, p.eye);
    else { P(c, 14, Y(9), 1, 2, p.eye); P(c, 13, Y(11), 1, 1, p.blush); }
    hairExtras(c, p, look.hairStyle, 'side', hy);
  }
  // near arm
  if (s.armPx) {
    s.armPx.forEach(([x, y]) => P(c, x, y, 1, 1, p.shirtS));
    P(c, s.hand[0], s.hand[1], 1, 2, p.hand);
    const [cx, cy] = s.cup;
    (s.item || s.th.cup || defaultCup)(c, cx, cy, p);
  } else {
    const ax = s.arm === undefined ? 11 : s.arm;
    P(c, ax, 14 + ty, 2, 3, p.shirtS); P(c, ax, 17 + ty, 2, 1, p.hand);
  }
}

function viewSleep(c, p, look, s) {
  c.save(); c.translate(0, -1);
  headDown(c, p, look, { eyes: 'closed' });
  c.restore();
  (s.th.sleepCover || defaultCover)(c, p, 12 - s.breath, s);
}
function defaultCover(c, p, top) {
  P(c, 2, top, 20, 24 - top, p.shirt);
  c.clearRect(2, top, 1, 1); c.clearRect(21, top, 1, 1);
  P(c, 3, top, 18, 1, p.shirtH); P(c, 2, top + 3, 20, 1, p.shirtS);
  P(c, 21, top + 1, 1, 23 - top, p.shirtS); P(c, 2, 23, 20, 1, p.shirtS);
}

// Frame specs per animation: (frame index) -> params for a view.
const SPECS = {
  'idle-down': f => ({ view: 'down', hy: [0, 1, 1, 0][f], eyes: f === 2 ? 'blink' : 'open' }),
  'idle-up':   f => ({ view: 'up', hy: [0, 1][f] }),
  'idle-side': f => ({ view: 'side', hy: [0, 1, 1, 0][f], eyes: f === 2 ? 'blink' : 'open' }),
  fidget: f => ({ view: 'down', hy: [0, 0, 1, 0][f], eyes: f === 3 ? 'blink' : 'open', aR: f % 2 ? 'scratch1' : 'scratch0' }),
  'walk-down': f => ({ view: 'down', hy: [0, -1, 0, -1][f], ty: [0, -1, 0, -1][f], rf: [1, 0, 0, 0][f], lf: [0, 0, 1, 0][f], aL: [-1, 0, 1, 0][f], aR: [1, 0, -1, 0][f] }),
  'walk-up':   f => ({ view: 'up', hy: [0, -1, 0, -1][f], ty: [0, -1, 0, -1][f], rf: [1, 0, 0, 0][f], lf: [0, 0, 1, 0][f], aL: [-1, 0, 1, 0][f], aR: [1, 0, -1, 0][f] }),
  'walk-side': f => ({
    view: 'side', hy: [0, -1, 0, -1][f], ty: [0, -1, 0, -1][f],
    far:  [[9, 0], [11, 0], [13, 0], [11, 1]][f], near: [[13, 0], [11, 1], [9, 0], [11, 0]][f],
    arm: [9, 11, 13, 11][f],
  }),
  type: f => ({ view: 'seat', hy: [0, 0, 0, 1][f], hL: [11, 12, 12, 11][f], hR: [12, 12, 11, 11][f] }),
  sleep: f => ({ view: 'sleep', breath: f }),
  coffee: f => ({
    view: 'side', eyes: f === 2 ? 'closed' : 'open',
    armPx: [[[11, 14], [11, 15], [12, 15], [13, 15]], [[11, 14], [11, 15], [12, 15], [13, 14], [13, 13]],
            [[11, 14], [11, 15], [12, 14], [13, 13], [13, 12]], [[11, 14], [11, 15], [12, 15], [13, 14], [13, 13]]][f],
    hand: [[14, 14], [14, 12], [14, 10], [14, 12]][f], cup: [[15, 13], [15, 11], [15, 9], [15, 11]][f],
  }),
  needs:  f => ({ view: 'down', aR: f ? 'wave1' : 'wave0', mouth: 'o', hy: f ? 0 : 0 }),
  done:   f => ({ view: 'down', aL: 'up', aR: 'up', mouth: 'smile', lf: [0, 1, 0, 1][f], rf: [0, 1, 0, 1][f] }),
  failed: f => ({ view: 'down', hy: 2 + f, ty: 1, legTop: 1, aL: 1, aR: 1, eyes: 'x', mouth: 'frown' }),
};
const VIEWS = { down: viewDown, up: viewUp, side: viewSide, seat: viewSeat, sleep: viewSleep };

function charFrame(th, look, anim, f) {
  const cv = mk(24, 24), c = cv.getContext('2d');
  const s = ((th.specs && th.specs[anim]) || SPECS[anim])(f);
  s.th = th; s.look = look;
  VIEWS[s.view](c, pal(look), look, s);
  return outline(cv, th.out || OUT);
}

// ======================= Props / effects helpers =======================
function glyph(rows, map, scale = 1) {
  const cv = mk(rows[0].length * scale, rows.length * scale), c = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (map[ch]) P(c, x * scale, y * scale, scale, scale, map[ch]); }));
  return cv;
}
const fxPad = (cv, col) => { const o = mk(cv.width + 2, cv.height + 2); o.getContext('2d').drawImage(cv, 1, 1); return outline(o, col); };

const FX = {
  bang: () => fxPad(glyph(['.xxxxxxx.', 'xxxxxxxxx', 'xxxxrxxxx', 'xxxxrxxxx', 'xxxxrxxxx', 'xxxxrxxxx', 'xxxxxxxxx', 'xxxxrxxxx', '.xxxxxxx.', '...xxx...', '....x....'], { x: '#ffffff', r: '#e5484d' }), OUT),
  z0: () => fxPad(glyph(['xxx', '.x.', 'xxx'], { x: '#ffffff' }), OUT),
  z1: () => fxPad(glyph(['xxxx', '..x.', '.x..', 'xxxx'], { x: '#ffffff' }), OUT),
  z2: () => fxPad(glyph(['xxxxx', '...x.', '..x..', '.x...', 'xxxxx'], { x: '#ffffff' }), OUT),
  steam: () => glyph(['xx', 'xx'], { x: '#ffffff' }),
  spark: () => fxPad(glyph(['..y..', '..y..', 'yywyy', '..y..', '..y..'], { y: '#ffd23f', w: '#fff6c9' }), '#b8860b'),
  cloud: () => fxPad(glyph(['....cccc....', '..cccccccc..', '.cccccccccc.', 'cccccccccccc', 'sssssssssss.'.slice(0, 12)], { c: '#b4bbc7', s: '#8b93a1' }), OUT),
  rain: () => glyph(['b', 'b', 'b'], { b: '#5aa9f2' }),
  shadow: () => { const cv = mk(14, 5), c = cv.getContext('2d'); c.globalAlpha = 0.28; P(c, 2, 0, 10, 5, '#000'); P(c, 0, 1, 14, 3, '#000'); return cv; },
};

// ======================= Shared helpers for the non-Studio themes =======================
const ell = (c, cx, cy, rx, ry, col) => {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y / (ry + 0.5)) ** 2)) + 0.5);
    P(c, cx - w, cy + y, w * 2 + 1, 1, col);
  }
};
const line = (c, x0, y0, x1, y1, col) => {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    P(c, x0, y0, 1, 1, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
};
const clip = (c, x, y, w, h, fn) => { c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); fn(); c.restore(); };
const scatter = (c, r, n, x, y, w, h, cols, pw = 1, ph = 1) => {
  for (let i = 0; i < n; i++) P(c, x + Math.floor(r() * w), y + Math.floor(r() * h), pw, ph, cols[Math.floor(r() * cols.length)]);
};

// Generic eye / mouth / side-eye drawing for head functions (same state vocabulary as Studio).
function eyes2(c, Y, s, p, xs, y, o = {}) {
  const e = s.eyes || 'open', col = o.col || p.eye, sc = o.sc || '#ffffff', lid = o.lid || p.skin;
  xs.forEach(x => {
    if (o.big) {
      if (e === 'open') { P(c, x - 1, Y(y - 1), 3, 3, sc); P(c, x, Y(y), 1, 2, col); return; }
      P(c, x - 1, Y(y - 1), 3, 3, lid);
      if (e === 'blink') P(c, x - 1, Y(y), 3, 1, col);
      else if (e === 'closed') P(c, x - 1, Y(y + 1), 3, 1, col);
    } else {
      if (e === 'open') { P(c, x, Y(y), 1, 2, col); return; }
      if (e === 'blink') P(c, x, Y(y + 1), 1, 1, col);
      else if (e === 'closed') P(c, x - 1 + (x >= 12 ? 1 : 0), Y(y + 1), 2, 1, col);
    }
    if (e === 'x') [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]].forEach(([dx, dy]) => P(c, x - 1 + dx, Y(y - 1 + dy), 1, 1, o.xcol || p.eye));
  });
}
function mouth2(c, Y, s, col, x0 = 10, y0 = 11) {
  const m = s.mouth;
  if (m === 'smile') { P(c, x0, Y(y0), 1, 1, col); P(c, x0 + 1, Y(y0 + 1), 2, 1, col); P(c, x0 + 3, Y(y0), 1, 1, col); }
  if (m === 'o') P(c, x0 + 1, Y(y0), 2, 2, col);
  if (m === 'frown') { P(c, x0, Y(y0 + 1), 1, 1, col); P(c, x0 + 1, Y(y0), 2, 1, col); P(c, x0 + 3, Y(y0 + 1), 1, 1, col); }
}
function sideEye(c, Y, s, x, y, col) {
  const e = s.eyes || 'open';
  if (e === 'blink') P(c, x, Y(y + 1), 1, 1, col);
  else if (e === 'closed') P(c, x - 1, Y(y + 1), 2, 1, col);
  else P(c, x, Y(y), 1, 2, col);
}
const BANG_ROWS = ['.xxxxxxx.', 'xxxxxxxxx', 'xxxxrxxxx', 'xxxxrxxxx', 'xxxxrxxxx', 'xxxxrxxxx', 'xxxxxxxxx', 'xxxxrxxxx', '.xxxxxxx.', '...xxx...', '....x....'];
function baseFx(o) {
  return {
    bang: () => fxPad(glyph(BANG_ROWS, { x: o.bangFill, r: o.bangMark }), o.out),
    z0: () => fxPad(glyph(['xxx', '.x.', 'xxx'], { x: o.z }), o.zOut || o.out),
    z1: () => fxPad(glyph(['xxxx', '..x.', '.x..', 'xxxx'], { x: o.z }), o.zOut || o.out),
    z2: () => fxPad(glyph(['xxxxx', '...x.', '..x..', '.x...', 'xxxxx'], { x: o.z }), o.zOut || o.out),
    steam: () => glyph(['xx', 'xx'], { x: o.steam }),
    shadow: FX.shadow,
  };
}


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


// ======================= Theme: Castle (top-down castle with a courtyard arena) =======================
const CASTLE = (() => {
const W = 480, H = 288;
// ---- characters: wizard, alchemist, knight, hooded mage, ranger ----
function csWizard(c, p, s, v) {
  const Y = (r) => r + (s.hy || 0), side = v === 'side', back = v === 'up';
  const hat = () => {
    P(c, side ? 9 : 12, Y(1), 2, 1, p.hair); P(c, side ? 9 : 10, Y(2), 4, 1, p.hair); P(c, side ? 8 : 9, Y(3), 6, 1, p.hair); P(c, 8, Y(4), 8, 1, p.hair);
    P(c, 6, Y(5), 12, 1, p.hairH); P(c, 7, Y(5), 10, 1, p.hair); P(c, 6, Y(5), 12, 1, shade(p.hair, 0.8));
    P(c, side ? 9 : 10, Y(3), 2, 2, p.a);
  };
  if (side) {
    P(c, 7, Y(6), 5, 5, p.b); P(c, 12, Y(6), 5, 4, p.skin); P(c, 17, Y(8), 1, 2, p.skinS);
    P(c, 13, Y(7), 3, 1, p.b); P(c, 11, Y(10), 5, 2, p.b); P(c, 11, Y(12), 4, 2, p.b); P(c, 11, Y(14), 2, 1, p.b);
    hat(); sideEye(c, Y, s, 14, 8, p.eye);
    return;
  }
  if (back) { P(c, 7, Y(6), 10, 5, p.b); P(c, 8, Y(11), 8, 2, p.b); P(c, 9, Y(13), 6, 1, p.b); hat(); return; }
  P(c, 8, Y(6), 8, 5, p.skin); P(c, 11, Y(9), 2, 1, p.skinS);
  P(c, 9, Y(7), 2, 1, p.b); P(c, 13, Y(7), 2, 1, p.b);
  eyes2(c, Y, s, p, [10, 13], 8);
  P(c, 8, Y(10), 8, 1, p.b); P(c, 8, Y(11), 8, 1, p.b); P(c, 9, Y(12), 6, 1, p.b); P(c, 10, Y(13), 4, 2, p.b); P(c, 11, Y(15), 2, 1, p.b);
  P(c, 9, Y(12), 1, 1, '#c9c4b8'); P(c, 14, Y(13), 1, 2, '#c9c4b8');
  mouth2(c, Y, s, p.mouth, 10, 11);
  hat();
}
function csRobeDeco(c, p, s, v) {
  const ty = s.ty || 0;
  P(c, 8, 19, 8, 3, p.shirt); P(c, 8, 19, 8, 1, p.shirtH); P(c, 8, 21, 8, 1, p.shirtS);
  if (v !== 'side') P(c, 9, 17 + ty, 6, 1, p.a2 || '#ffd23f'); else P(c, 9, 17 + ty, 6, 1, p.a2 || '#ffd23f');
  P(c, 11, 17 + ty, 2, 1, '#fff6c9');
}
function csAlchemist(c, p, s, v) {
  const Y = (r) => r + (s.hy || 0), side = v === 'side', back = v === 'up';
  if (side) {
    P(c, 7, Y(4), 9, 2, p.hair); P(c, 7, Y(6), 5, 6, p.hair); P(c, 12, Y(8), 5, 4, p.skin); P(c, 12, Y(12), 4, 1, p.skinS);
    P(c, 8, Y(2), 1, 2, p.hair); P(c, 11, Y(1), 2, 3, p.hair); P(c, 14, Y(3), 2, 1, p.hair);
    P(c, 12, Y(5), 4, 3, p.a); P(c, 14, Y(6), 2, 1, p.b); P(c, 17, Y(10), 1, 1, p.skin);
    sideEye(c, Y, s, 14, 9, p.eye);
    return;
  }
  P(c, 7, Y(4), 10, 2, p.hair); P(c, 7, Y(3), 2, 1, p.hair); P(c, 10, Y(2), 1, 2, p.hair); P(c, 12, Y(1), 2, 3, p.hair); P(c, 15, Y(3), 2, 1, p.hair);
  if (back) { P(c, 7, Y(6), 10, 6, p.hair); P(c, 7, Y(7), 10, 1, p.a); P(c, 9, Y(5), 3, 1, p.hairH); return; }
  P(c, 7, Y(6), 1, 4, p.hair); P(c, 16, Y(6), 1, 4, p.hair);
  P(c, 8, Y(6), 8, 6, p.skin); P(c, 9, Y(12), 6, 1, p.skinS);
  P(c, 8, Y(5), 4, 3, p.a); P(c, 12, Y(5), 4, 3, p.a); P(c, 9, Y(6), 2, 1, p.b); P(c, 13, Y(6), 2, 1, p.b);
  eyes2(c, Y, s, p, [10, 13], 9);
  P(c, 14, Y(11), 2, 1, '#4a3a30');
  mouth2(c, Y, s, p.mouth, 10, 11);
}
function csApronDeco(c, p, s, v) {
  const ty = s.ty || 0;
  if (v === 'down') { P(c, 10, 14 + ty, 4, 5, p.apron); P(c, 10, 14 + ty, 4, 1, shade(p.apron, 1.2)); P(c, 11, 16 + ty, 2, 2, '#5c3b24'); P(c, 9, 13 + ty, 1, 2, p.apron); P(c, 14, 13 + ty, 1, 2, p.apron); }
  if (v === 'up') P(c, 9, 16 + ty, 6, 1, p.apron);
  if (v === 'side') { P(c, 12, 14 + ty, 2, 5, p.apron); P(c, 13, 16 + ty, 1, 2, '#5c3b24'); }
}
function csKnight(c, p, s, v) {
  const Y = (r) => r + (s.hy || 0), side = v === 'side';
  if (side) { P(c, 7, Y(2), 4, 2, p.hair); P(c, 6, Y(3), 3, 1, p.hair); P(c, 5, Y(4), 3, 1, p.hair); }
  else { P(c, 10, Y(2), 4, 2, p.hair); P(c, 11, Y(1), 3, 1, p.hair); P(c, 9, Y(3), 1, 1, p.hair); }
  P(c, 8, Y(4), 8, 1, p.skin); P(c, 7, Y(5), 10, 8, p.skin); P(c, 15, Y(5), 2, 8, p.skinS); P(c, 9, Y(5), 2, 1, p.hairH); P(c, 8, Y(12), 8, 1, p.skinS);
  if (v === 'up') { P(c, 11, Y(5), 2, 8, p.skinS); return; }
  if (side) { P(c, 11, Y(7), 6, 3, p.a); sideEye(c, Y, s, 14, 8, p.eye); P(c, 16, Y(10), 1, 2, p.skinS); return; }
  P(c, 8, Y(7), 8, 3, p.a);
  eyes2(c, Y, s, p, [10, 13], 8);
  P(c, 11, Y(10), 2, 2, p.skinS); [9, 14].forEach(x => P(c, x, Y(11), 1, 1, p.skinS));
}
function csKnightDeco(c, p, s, v) {
  const ty = s.ty || 0;
  P(c, 8, 13 + ty, 2, 2, p.shirtH); P(c, 14, 13 + ty, 2, 2, p.shirtH);
  if (v === 'down') { P(c, 11, 14 + ty, 2, 4, p.hair); P(c, 10, 15 + ty, 4, 1, p.hair); }
  if (v === 'up') P(c, 11, 14 + ty, 2, 5, p.shirtS);
  if (v === 'side') P(c, 12, 14 + ty, 2, 4, p.hair);
}
function csMage(c, p, s, v) {
  const Y = (r) => r + (s.hy || 0), side = v === 'side';
  if (side) {
    P(c, 8, Y(2), 6, 1, p.hair); P(c, 7, Y(3), 9, 1, p.hair); P(c, 7, Y(4), 10, 9, p.hair); P(c, 12, Y(6), 5, 6, p.skin); P(c, 12, Y(5), 5, 1, p.skinS);
    P(c, 17, Y(8), 1, 1, p.skinS); sideEye(c, Y, s, 14, 8, p.eye); P(c, 6, Y(9), 2, 6, p.braid);
    return;
  }
  P(c, 9, Y(2), 6, 1, p.hair); P(c, 8, Y(3), 8, 1, p.hair); P(c, 7, Y(4), 10, 9, p.hair); P(c, 8, Y(4), 3, 1, p.hairH);
  if (v === 'up') { P(c, 11, Y(10), 2, 7, p.braid); P(c, 11, Y(15), 2, 1, p.trim); P(c, 11, Y(5), 2, 5, shade(p.hair, 0.85)); return; }
  P(c, 9, Y(6), 6, 6, p.skin); P(c, 9, Y(5), 6, 1, p.skinS); P(c, 9, Y(11), 6, 1, p.skinS);
  eyes2(c, Y, s, p, [10, 13], 8, { col: p.eye });
  P(c, 11, Y(9), 2, 1, p.skinS);
  mouth2(c, Y, s, p.mouth, 10, 11);
  P(c, 15, Y(11), 2, 4, p.braid); P(c, 15, Y(15), 2, 1, p.trim);
}
function csMageDeco(c, p, s, v) {
  const ty = s.ty || 0;
  P(c, 8, 19, 8, 3, p.shirt); P(c, 8, 21, 8, 1, p.shirtS); P(c, 8, 19, 8, 1, p.trim);
  if (v === 'down') P(c, 11, 13 + ty, 2, 1, '#ffd23f');
}

function csRanger(c, p, s, v) {
  const Y = (r) => r + (s.hy || 0), side = v === 'side', back = v === 'up', hs = shade(p.hair, 0.72);
  const feather = (x) => { P(c, x, Y(0), 1, 3, '#e8e0c8'); P(c, x, Y(0), 1, 1, '#ffffff'); };
  if (side) {
    P(c, 8, Y(2), 6, 1, p.hair); P(c, 7, Y(3), 9, 1, p.hair); P(c, 7, Y(4), 10, 8, p.hair); P(c, 5, Y(5), 2, 6, p.hair); P(c, 4, Y(6), 1, 3, hs);
    P(c, 12, Y(6), 5, 5, p.skin); P(c, 12, Y(5), 5, 1, hs); P(c, 17, Y(8), 1, 1, p.skinS); P(c, 12, Y(10), 4, 1, p.skinS);
    sideEye(c, Y, s, 14, 8, p.eye); P(c, 9, Y(11), 7, 2, p.trim); feather(9);
    return;
  }
  if (back) {
    P(c, 9, Y(2), 6, 1, p.hair); P(c, 8, Y(3), 8, 1, p.hair); P(c, 7, Y(4), 10, 9, p.hair); P(c, 8, Y(4), 3, 1, p.hairH); P(c, 11, Y(5), 2, 7, hs);
    P(c, 13, Y(9), 3, 6, '#6e4527'); P(c, 13, Y(8), 1, 1, '#e8e0c8'); P(c, 15, Y(8), 1, 1, '#c0392b'); P(c, 14, Y(9), 1, 6, '#573619'); feather(14);
    return;
  }
  P(c, 9, Y(2), 6, 1, p.hair); P(c, 8, Y(3), 8, 1, p.hair); P(c, 7, Y(4), 10, 2, p.hair); P(c, 7, Y(6), 2, 6, p.hair); P(c, 15, Y(6), 2, 6, p.hair);
  P(c, 9, Y(6), 6, 6, p.skin); P(c, 9, Y(6), 6, 1, hs); P(c, 9, Y(11), 6, 1, p.skinS); P(c, 8, Y(4), 3, 1, p.hairH);
  eyes2(c, Y, s, p, [10, 13], 8, { col: p.eye });
  P(c, 11, Y(9), 2, 1, p.skinS);
  mouth2(c, Y, s, p.mouth, 10, 10);
  P(c, 8, Y(12), 8, 2, p.trim); feather(14);
}
function csRangerDeco(c, p, s, v) {
  const ty = s.ty || 0;
  P(c, 9, 18 + ty, 6, 1, '#5a3a22');
  if (v === 'down') { [[9, 13], [10, 14], [11, 15], [12, 16], [13, 17]].forEach(([x, y]) => P(c, x, y + ty, 1, 1, '#6e4527')); P(c, 11, 18 + ty, 2, 1, CS_GOLD); }
  if (v === 'side') P(c, 11, 18 + ty, 2, 1, CS_GOLD);
}

// ======================= Castle art (all procedural) =======================
const CS_OUT = '#241b2b';
const CS_STONE = '#8a8794', CS_WOOD = '#8a5a3a', CS_RED = '#a8323e', CS_GOLD = '#d9ae4a';
const csRound = (cv) => outline(cv, CS_OUT);

function csBricks(c, x, y, w, h, base, r, bh = 6, bw = 12) {
  P(c, x, y, w, h, shade(base, 0.74));
  for (let row = 0, yy = y; yy < y + h; row++, yy += bh) {
    const off = (row % 2) * (bw / 2);
    for (let xx = x - off; xx < x + w; xx += bw) {
      const col = [base, shade(base, 0.94), lift(base, 8)][Math.floor(r() * 3)];
      const x0 = Math.max(xx + 1, x), x1 = Math.min(xx + bw, x + w), y1 = Math.min(yy + bh, y + h);
      if (x1 > x0 && y1 > yy + 1) { P(c, x0, yy + 1, x1 - x0, y1 - yy - 1, col); P(c, x0, yy + 1, x1 - x0, 1, lift(col, 12)); }
    }
  }
}
function csCobble(c, x, y, w, h, r, base) {
  P(c, x, y, w, h, shade(base, 0.66));
  for (let yy = y; yy < y + h; yy += 8) {
    let xx = x - Math.floor(r() * 8);
    while (xx < x + w) {
      const sw = 8 + Math.floor(r() * 6), col = [base, shade(base, 0.93), lift(base, 8), shade(base, 1.04)][Math.floor(r() * 4)];
      const x0 = Math.max(xx + 1, x), x1 = Math.min(xx + sw, x + w), y1 = Math.min(yy + 8, y + h);
      if (x1 > x0 && y1 > yy + 1) { P(c, x0, yy + 1, x1 - x0, y1 - yy - 1, col); P(c, x0, yy + 1, x1 - x0, 1, lift(col, 10)); }
      xx += sw;
    }
  }
}
function csPlanks(c, x, y, w, h, base, r) {
  P(c, x, y, w, h, shade(base, 0.6));
  for (let yy = y; yy < y + h; yy += 6) {
    let xx = x - Math.floor(r() * 20);
    while (xx < x + w) {
      const pw = 22 + Math.floor(r() * 18), col = [base, shade(base, 0.92), lift(base, 8)][Math.floor(r() * 3)];
      const x0 = Math.max(xx + 1, x), x1 = Math.min(xx + pw, x + w), y1 = Math.min(yy + 6, y + h);
      if (x1 > x0 && y1 > yy + 1) { P(c, x0, yy + 1, x1 - x0, y1 - yy - 1, col); P(c, x0, yy + 1, x1 - x0, 1, lift(col, 12)); }
      xx += pw;
    }
  }
}
function csMarble(c, x, y, w, h) {
  for (let yy = 0; yy < h; yy += 16) for (let xx = 0; xx < w; xx += 16) {
    const a = ((xx + yy) / 16) % 2 === 0, col = a ? '#a9a4b6' : '#8f8aa0';
    P(c, x + xx, y + yy, 16, 16, col); P(c, x + xx, y + yy, 16, 1, lift(col, 14)); P(c, x + xx, y + yy, 1, 16, lift(col, 8));
    P(c, x + xx + 15, y + yy, 1, 16, shade(col, 0.86)); P(c, x + xx, y + yy + 15, 16, 1, shade(col, 0.86));
  }
}
function csCarpet(c, x, y, w, h) {
  P(c, x, y, w, h, '#9b2d35'); P(c, x + 2, y, 1, h, CS_GOLD); P(c, x + w - 3, y, 1, h, CS_GOLD);
  P(c, x + 4, y, 1, h, '#7a1f28'); P(c, x + w - 5, y, 1, h, '#7a1f28');
  for (let yy = y + 4; yy < y + h; yy += 12) { P(c, x + w / 2 - 1, yy, 2, 4, CS_GOLD); P(c, x + w / 2 - 3, yy + 1, 6, 2, '#c24a52'); }
}
const csTorchHolder = (c, x, y) => { P(c, x - 1, y - 5, 3, 5, '#2f2c38'); P(c, x - 2, y - 2, 5, 2, '#4a4658'); P(c, x - 1, y - 7, 3, 2, '#c9a14a'); };

// ---- the baked ground / back walls / walkways ----
function csGround() {
  const cv = mk(W, H), c = cv.getContext('2d'), r = rng(31);
  P(c, 0, 0, W, H, '#5c9a4e');
  scatter(c, r, 760, 0, 0, W, H, ['#4e8742', '#6aae58', '#4a7f3f', '#74b861']);
  // meadow outside the moat: the road from the drawbridge, a trodden lane to the village, flowers
  P(c, 224, 256, 32, 32, '#b8946a'); scatter(c, r, 60, 224, 256, 32, 32, ['#a38159', '#c9a77c']);
  P(c, 60, 276, 360, 5, '#b8946a'); scatter(c, r, 90, 60, 276, 360, 5, ['#a38159', '#c9a77c']);
  [[132, 262, '#ffffff'], [208, 268, '#ffd23f'], [96, 266, '#ff7a9a'], [284, 264, '#ffffff'], [330, 270, '#ffd23f'], [370, 262, '#ff7a9a'], [118, 283, '#ffd23f'], [300, 284, '#ffffff'],
    [24, 282, '#ff7a9a'], [180, 284, '#ff7a9a'], [260, 270, '#ffd23f'], [448, 282, '#ffffff'], [70, 262, '#ffffff'], [420, 264, '#ffd23f'], [156, 270, '#ff7a9a'], [350, 283, '#ff7a9a']]
    .forEach(([x, y, col]) => { P(c, x, y, 2, 2, col); P(c, x, y + 2, 1, 2, '#3f7a35'); });

  // back wall (rows 0-1) with merlons
  P(c, 0, 0, W, 8, '#8fc4ec');
  csBricks(c, 0, 6, W, 26, '#7e7b8a', r);
  for (let x = 0; x < W; x += 16) { csBricks(c, x + 2, 0, 11, 9, '#908d9c', r, 4, 6); P(c, x + 2, 0, 11, 1, '#b2afbe'); }
  P(c, 0, 8, W, 1, '#b2afbe');
  // arrow slits, tapestry behind the throne
  [24, 58, 92, 122, 150, 326, 366].forEach(x => { P(c, x, 14, 3, 9, '#1c1824'); P(c, x + 1, 17, 1, 3, '#f0c060'); });
  P(c, 214, 10, 52, 22, '#7a1f28'); P(c, 216, 12, 48, 18, '#a8323e'); P(c, 214, 10, 52, 2, CS_GOLD); P(c, 214, 30, 52, 2, CS_GOLD);
  for (let i = 0; i < 5; i++) P(c, 218 + i * 10, 12, 1, 18, '#8f2330');
  // barracks shields, tavern sign
  [34, 68, 102].forEach(x => { const y = 12; P(c, x - 1, y - 1, 12, 14, '#2f2c38'); P(c, x, y, 10, 12, '#2b4a9a'); P(c, x + 4, y, 2, 12, '#e0e0e8'); P(c, x, y + 4, 10, 2, '#e0e0e8'); P(c, x + 2, y + 12, 6, 1, '#2b4a9a'); });
  P(c, 436, 6, 18, 2, '#4a3220'); P(c, 439, 8, 1, 4, '#4a3220'); P(c, 451, 8, 1, 4, '#4a3220');
  P(c, 434, 12, 22, 14, '#c9a26a'); P(c, 434, 12, 22, 2, '#e0bf86'); P(c, 436, 14, 18, 10, '#6e4527'); P(c, 441, 16, 8, 7, '#f4ecd0'); P(c, 441, 16, 8, 2, '#ffffff'); P(c, 449, 18, 2, 4, '#f4ecd0');
  // sconces on the back wall
  [51, 85, 200, 280, 384, 426].forEach(x => csTorchHolder(c, x, 28));

  // courtyard
  csCobble(c, 0, 96, W, 128, r, '#8f8c99');
  // interior floors and the pillars between the rooms
  csPlanks(c, 16, 32, 112, 64, '#9a6e44', r);
  csMarble(c, 144, 32, 192, 64);
  csPlanks(c, 352, 32, 112, 64, '#82593a', r);
  [0, 128, 336, 464].forEach(x => { csBricks(c, x, 32, 16, 80, '#7e7b8a', r, 6, 8); P(c, x, 32, 16, 1, '#a29fac'); });
  c.globalAlpha = 0.28; [[16, 112], [144, 192], [352, 112]].forEach(([x, w]) => P(c, x, 32, w, 5, '#000')); c.globalAlpha = 0.12; [[16, 112], [144, 192], [352, 112]].forEach(([x, w]) => P(c, x, 37, w, 3, '#000')); c.globalAlpha = 1;
  // throne dais and carpet (the carpet runs out of the hall to the arena)
  P(c, 204, 42, 72, 18, '#6f6c7a'); P(c, 204, 42, 72, 2, '#a29fac'); P(c, 208, 46, 64, 14, '#85828f'); P(c, 208, 46, 64, 2, '#aaa7b6'); P(c, 204, 58, 72, 2, '#55525f');
  csCarpet(c, 224, 60, 32, 100);
  P(c, 224, 48, 32, 12, '#9b2d35'); P(c, 226, 48, 1, 12, CS_GOLD); P(c, 253, 48, 1, 12, CS_GOLD);
  // tavern rug
  P(c, 390, 56, 24, 20, '#5a3a22'); P(c, 392, 58, 20, 16, '#7a4f2c'); P(c, 394, 60, 16, 12, '#a8742c'); P(c, 398, 64, 8, 4, '#d9ae4a');

  // arena
  const AX = 240, AY = 190;
  ell(c, AX, AY, 84, 30, '#58556a'); ell(c, AX, AY, 81, 27, '#cdb27a'); ell(c, AX, AY, 73, 23, '#d8c086'); ell(c, AX, AY, 50, 15, '#e0cb94');
  for (let a = 0; a < 56; a++) {
    const t = a / 56 * Math.PI * 2, x = Math.round(AX + Math.cos(t) * 83), y = Math.round(AY + Math.sin(t) * 29);
    P(c, x - 2, y - 1, 5, 3, a % 2 ? '#8a8794' : '#9b98a6'); P(c, x - 2, y - 1, 5, 1, '#b2afbe');
  }
  c.save(); c.beginPath(); c.ellipse(AX, AY, 75, 24, 0, 0, 7); c.clip(); scatter(c, r, 180, AX - 80, AY - 30, 160, 60, ['#bfa56c', '#e8d6a2', '#c8ad74']); c.restore();
  ell(c, AX, AY, 9, 3, '#a8323e'); ell(c, AX, AY, 6, 2, '#d9ae4a'); line(c, AX - 4, AY + 2, AX + 4, AY - 2, '#58556a'); line(c, AX - 4, AY - 2, AX + 4, AY + 2, '#58556a');

  // west and east ramparts: walkway, outer parapet, inner face and the stairs (both at mid height)
  const flag = (x, y, w, h) => { csCobble(c, x, y, w, h, r, '#a9a6b4'); };
  flag(0, 112, 32, 112); P(c, 0, 112, 5, 112, '#5e5b6b');
  for (let y = 114; y < 222; y += 14) { P(c, 0, y, 8, 8, '#a29fac'); P(c, 0, y, 8, 1, '#c8c5d2'); P(c, 6, y, 2, 8, '#6f6c7a'); }
  csBricks(c, 32, 112, 16, 48, '#6f6c7b', r, 6, 8); csBricks(c, 32, 192, 16, 32, '#6f6c7b', r, 6, 8);
  P(c, 32, 112, 1, 112, '#c8c5d2'); P(c, 46, 112, 2, 48, '#4a4658'); P(c, 46, 192, 2, 32, '#4a4658');
  for (let i = 0; i < 5; i++) { const col = shade('#c0bdca', 1 - i * 0.07); P(c, 32 + i * 3, 160, 3, 32, col); P(c, 32 + i * 3, 160, 1, 32, lift(col, 18)); P(c, 34 + i * 3, 160, 1, 32, shade(col, 0.8)); }
  P(c, 32, 160, 16, 2, '#4a4658'); P(c, 32, 190, 16, 2, '#4a4658');
  flag(448, 112, 32, 112); P(c, 475, 112, 5, 112, '#5e5b6b');
  for (let y = 114; y < 222; y += 14) { P(c, 472, y, 8, 8, '#a29fac'); P(c, 472, y, 8, 1, '#c8c5d2'); P(c, 472, y, 2, 8, '#6f6c7a'); }
  csBricks(c, 432, 112, 16, 48, '#6f6c7b', r, 6, 8); csBricks(c, 432, 192, 16, 32, '#6f6c7b', r, 6, 8);
  P(c, 447, 112, 1, 112, '#c8c5d2'); P(c, 432, 112, 2, 48, '#4a4658'); P(c, 432, 192, 2, 32, '#4a4658');
  for (let i = 0; i < 5; i++) { const col = shade('#c0bdca', 1 - i * 0.07); P(c, 445 - i * 3, 160, 3, 32, col); P(c, 445 - i * 3, 160, 1, 32, lift(col, 18)); P(c, 447 - i * 3, 160, 1, 32, shade(col, 0.8)); }
  P(c, 432, 160, 16, 2, '#4a4658'); P(c, 432, 190, 16, 2, '#4a4658');

  // herb garden (west of the scribe desks): tilled rows
  P(c, 72, 112, 64, 22, '#5a3a22'); P(c, 72, 112, 64, 1, '#7a5230');
  for (let i = 0; i < 3; i++) for (let x = 76; x < 132; x += 6) {
    const kind = (i + (x / 6 | 0)) % 4, y = 115 + i * 6;
    P(c, x, y, 4, 4, kind === 0 ? '#e07a2f' : kind === 1 ? '#3f8a42' : kind === 2 ? '#74b861' : '#4e8742');
    if (kind === 3) P(c, x + 1, y, 2, 1, '#ff7a9a');
    if (kind === 0) P(c, x + 1, y - 1, 2, 1, '#3f8a42');
  }
  // straw in front of the stable, soot around the forge
  scatter(c, r, 70, 60, 192, 88, 32, ['#d9b95a', '#c9a14a', '#e8d6a2'], 3, 1);
  scatter(c, r, 40, 372, 196, 60, 24, ['#58556a', '#3f3c4a'], 2, 1);

  // courtyard dressing
  scatter(c, r, 50, 56, 112, 376, 112, ['#6a6776', '#a29fac'], 2, 1);
  for (let i = 0; i < 22; i++) { const x = 60 + Math.floor(r() * 360), y = 116 + Math.floor(r() * 104); P(c, x, y, 2, 2, '#5c9a4e'); P(c, x + 1, y - 1, 1, 1, '#74b861'); }
  // gate passage floor
  csCobble(c, 224, 224, 32, 16, r, '#a29fac');
  return cv;
}
// ---- moat water (3 frames), bridge and chains ----
function csMoat(k) {
  const cv = mk(W, 16), c = cv.getContext('2d');
  P(c, 0, 0, W, 16, '#3e86c4'); P(c, 0, 0, W, 3, '#2a5f94'); P(c, 0, 3, W, 1, '#3475b0');
  for (let i = 0; i < 40; i++) {
    const x = (i * 43 + k * 6) % W, y = 4 + (i * 5) % 9, l = 5 + (i % 4) * 2;
    P(c, x, y, l, 1, '#6ab4e8'); if (i % 3 === 0) P(c, x + 2, y + 1, l - 3, 1, '#2f6ba8');
  }
  for (let i = 0; i < 11; i++) P(c, (i * 71 + k * 13) % W, 5 + (i * 3) % 8, 1, 1, '#ffffff');
  P(c, 0, 13, W, 3, '#4a7a3a'); P(c, 0, 13, W, 1, '#6aae58');
  for (let x = 2; x < W; x += 7) P(c, x, 12 + (x % 3 ? 0 : 1), 2, 1, '#3f6e32');
  [[44, 8], [150, 6], [190, 9], [312, 7], [388, 9], [440, 6], [90, 7]].forEach(([x, y], i) => { ell(c, x, y, 4, 1, '#3f8a42'); P(c, x + 1 + k % 2 * (i % 3), y - 1, 1, 1, '#ff9ad0'); });
  return cv;
}
function csBridge() {
  const cv = mk(32, 16), c = cv.getContext('2d');
  P(c, 0, 0, 32, 16, '#8a5a3a');
  for (let y = 0; y < 16; y += 3) { P(c, 3, y, 26, 2, '#a97d4f'); P(c, 3, y + 2, 26, 1, '#573619'); P(c, 3, y, 26, 1, '#c29463'); }
  P(c, 0, 0, 3, 16, '#4a3220'); P(c, 29, 0, 3, 16, '#4a3220'); P(c, 0, 0, 1, 16, '#6e4527'); P(c, 29, 0, 1, 16, '#6e4527');
  return cv;
}
function csChains() {
  const cv = mk(32, 36), c = cv.getContext('2d');
  [2, 29].forEach(x => { for (let y = 0; y < 36; y += 2) { P(c, x, y, 1, 1, y % 4 ? '#6b7280' : '#c3c8d1'); if (y % 4 === 0) P(c, x + (x < 10 ? 1 : -1), y, 1, 1, '#4a505c'); } });
  return cv;
}

// ---- tall sprites ----
function csLowWalls() {
  const cv = mk(W, 16), c = cv.getContext('2d'), r = rng(41);
  [[16, 48], [96, 32], [144, 80], [256, 80], [352, 48], [432, 32]].forEach(([x, w]) => {
    csBricks(c, x, 5, w, 11, '#7e7b8a', r, 5, 10); P(c, x, 0, w, 6, '#9c99a8'); P(c, x, 0, w, 1, '#c8c5d2'); P(c, x, 5, w, 1, '#55525f');
    for (let xx = x + 4; xx < x + w - 3; xx += 12) P(c, xx, 1, 5, 2, '#aeabbb');
  });
  [[64, 96], [224, 256], [400, 432]].forEach(([a, b]) => { // door posts
    [a, b - 4].forEach(x => { P(c, x, 0, 4, 16, '#5a3a22'); P(c, x, 0, 4, 1, '#8a5a3a'); P(c, x + 3, 0, 1, 16, '#3a2616'); });
  });
  return csRound(cv);
}
function csTower(roof) {
  const cv = mk(28, 96), c = cv.getContext('2d'), r = rng(43);
  for (let y = 30; y < 96; y++) {
    P(c, 3, y, 22, 1, '#868394');
  }
  csBricks(c, 3, 30, 22, 66, '#8a8794', r, 6, 8);
  P(c, 3, 30, 4, 66, 'rgba(255,255,255,0.10)'); P(c, 19, 30, 6, 66, 'rgba(0,0,0,0.20)'); P(c, 23, 30, 2, 66, 'rgba(0,0,0,0.18)');
  [[12, 48], [12, 66]].forEach(([x, y]) => { P(c, x, y, 4, 10, '#1c1824'); P(c, x + 1, y + 3, 2, 4, '#f0c060'); });
  P(c, 9, 82, 10, 14, '#4a3220'); ell(c, 14, 82, 5, 3, '#4a3220'); P(c, 10, 84, 8, 12, '#6e4527'); P(c, 14, 84, 1, 12, '#3a2616');
  P(c, 1, 26, 26, 6, '#a29fac'); P(c, 1, 26, 26, 1, '#c8c5d2'); P(c, 1, 31, 26, 1, '#55525f');
  for (let x = 2; x < 26; x += 5) P(c, x, 29, 2, 2, '#6f6c7a');
  for (let i = 0; i < 20; i++) {
    const w = 2 + Math.round(i * 24 / 19), y = 8 + i; P(c, 14 - w / 2, y, w, 1, roof);
    P(c, 14 - w / 2, y, Math.max(1, Math.floor(w / 4)), 1, lift(roof, 28)); P(c, 14 + w / 2 - Math.max(1, Math.floor(w / 4)), y, Math.max(1, Math.floor(w / 4)), 1, shade(roof, 0.74));
  }
  P(c, 1, 27, 26, 1, shade(roof, 0.7)); P(c, 13, 0, 2, 10, '#4a3220'); P(c, 13, 0, 1, 10, '#6e4527');
  return csRound(cv);
}
// squat tower (gate and south corners): conical roof with a flag pole, 10px taller than the body
function csGateTower(roof) {
  const cv = mk(24, 50), c = cv.getContext('2d'), r = rng(44), o = 10;
  csBricks(c, 2, 12 + o, 20, 28, '#8a8794', r, 6, 8); P(c, 2, 12 + o, 4, 28, 'rgba(255,255,255,0.10)'); P(c, 16, 12 + o, 6, 28, 'rgba(0,0,0,0.2)');
  P(c, 0, 9 + o, 24, 5, '#a29fac'); P(c, 0, 9 + o, 24, 1, '#c8c5d2'); P(c, 0, 13 + o, 24, 1, '#55525f');
  P(c, 10, 18 + o, 4, 9, '#1c1824'); P(c, 11, 21 + o, 2, 3, '#f0c060');
  for (let i = 0; i < 9; i++) { const w = 2 + Math.round(i * 20 / 8); P(c, 12 - w / 2, i + o, w, 1, roof); P(c, 12 - w / 2, i + o, Math.max(1, Math.floor(w / 4)), 1, lift(roof, 28)); }
  P(c, 0, 8 + o, 24, 1, shade(roof, 0.7)); P(c, 11, 0, 2, 11, '#4a3220'); P(c, 11, 0, 1, 11, '#6e4527');
  return csRound(cv);
}
function csArch() {
  const cv = mk(32, 20), c = cv.getContext('2d'), r = rng(45);
  csBricks(c, 0, 0, 32, 14, '#7e7b8a', r, 5, 8); P(c, 0, 0, 32, 2, '#a29fac'); P(c, 0, 13, 32, 1, '#55525f');
  for (let x = 3; x < 30; x += 4) { P(c, x, 14, 2, 5, '#4a505c'); P(c, x, 14, 1, 5, '#8b93a1'); P(c, x, 18, 2, 1, '#2a2e36'); }
  P(c, 3, 14, 26, 1, '#4a505c');
  return csRound(cv);
}
function csSouthWall() {
  const cv = mk(W, 16), c = cv.getContext('2d'), r = rng(46);
  [[0, 224], [256, 224]].forEach(([x, w]) => {
    csBricks(c, x, 4, w, 12, '#7e7b8a', r, 6, 10); P(c, x, 0, w, 5, '#9c99a8'); P(c, x, 0, w, 1, '#c8c5d2'); P(c, x, 4, w, 1, '#55525f');
    for (let xx = x + 3; xx < x + w - 3; xx += 12) { P(c, xx, 1, 6, 3, '#aeabbb'); P(c, xx, 3, 6, 1, '#6f6c7a'); }
  });
  return csRound(cv);
}
function csThrone() {
  const cv = mk(34, 38), c = cv.getContext('2d');
  P(c, 7, 3, 20, 26, CS_GOLD); P(c, 9, 5, 16, 22, '#8f2330'); P(c, 9, 5, 16, 2, '#a8323e'); P(c, 15, 0, 4, 3, CS_GOLD); P(c, 7, 3, 20, 1, '#fff1b0');
  P(c, 16, 9, 2, 8, CS_GOLD); P(c, 13, 12, 8, 2, CS_GOLD);
  P(c, 3, 22, 5, 14, CS_GOLD); P(c, 26, 22, 5, 14, CS_GOLD); P(c, 3, 22, 5, 1, '#fff1b0'); P(c, 26, 22, 5, 1, '#fff1b0');
  P(c, 8, 26, 18, 7, '#b53a46'); P(c, 8, 26, 18, 1, '#d4606a'); P(c, 6, 33, 22, 5, '#6a4a1e'); P(c, 6, 33, 22, 1, '#a07a30');
  return csRound(cv);
}
function csArmor() {
  const cv = mk(16, 30), c = cv.getContext('2d');
  P(c, 5, 0, 6, 3, '#c0392b'); P(c, 4, 2, 8, 8, '#b4bcc8'); P(c, 4, 2, 2, 8, '#dde3ea'); P(c, 10, 2, 2, 8, '#8a93a1'); P(c, 5, 5, 6, 2, '#1b1f2a');
  P(c, 3, 10, 10, 10, '#aeb7c4'); P(c, 3, 10, 3, 10, '#d0d7e0'); P(c, 11, 10, 2, 10, '#7d8794'); P(c, 7, 12, 2, 6, '#d9ae4a');
  P(c, 2, 11, 2, 7, '#8a93a1'); P(c, 12, 11, 2, 7, '#8a93a1');
  P(c, 4, 20, 8, 3, '#7d8794'); P(c, 3, 23, 10, 6, '#6e6a78'); P(c, 3, 23, 10, 1, '#9c99a8');
  return csRound(cv);
}
function csCot(blanket) {
  const cv = mk(32, 38), c = cv.getContext('2d');
  P(c, 1, 0, 30, 7, '#6e4527'); P(c, 1, 0, 30, 1, '#8a5a3a'); P(c, 1, 5, 30, 2, '#573619');
  P(c, 3, 6, 26, 28, '#e8d9a8'); P(c, 3, 6, 26, 1, '#f6eaC0'.toLowerCase());
  P(c, 8, 9, 16, 9, '#f4f1ea'); P(c, 8, 16, 16, 2, '#d8d3c8');
  P(c, 3, 19, 26, 14, blanket); P(c, 3, 19, 26, 2, lift(blanket, 30)); P(c, 3, 27, 26, 1, shade(blanket, 0.8)); P(c, 3, 32, 26, 1, shade(blanket, 0.7));
  for (let x = 6; x < 28; x += 6) P(c, x, 22, 2, 2, lift(blanket, 40));
  P(c, 1, 33, 30, 5, '#6e4527'); P(c, 1, 33, 30, 1, '#8a5a3a');
  return csRound(cv);
}
// scribe desk: a bench with n open spellbooks (24px per seat)
function csBench(n) {
  const w = 24 * n, cv = mk(w, 34), c = cv.getContext('2d'), r = rng(47);
  P(c, 0, 2, w, 22, '#8a5a3a'); P(c, 0, 2, w, 1, '#b98a5a'); P(c, 0, 3, w, 2, '#7a4f2c');
  for (let i = 0; i < 4 + n * 2; i++) P(c, 2 + Math.floor(r() * (w - 12)), 7 + Math.floor(r() * 14), 5, 1, '#7a4f2c');
  P(c, 0, 24, w, 6, '#6e4527'); P(c, 0, 24, w, 1, '#8a5a3a'); P(c, 0, 29, w, 1, '#573619');
  P(c, 2, 30, 4, 4, '#573619'); P(c, w - 6, 30, 4, 4, '#573619');
  for (let k = 0; k < n; k++) { // open spellbooks with runes
    const cx = 12 + 24 * k, col = k % 2 ? '#2b4a9a' : '#5c3b8a';
    P(c, cx - 9, 8, 18, 12, col); P(c, cx - 8, 9, 8, 10, '#f4ecd0'); P(c, cx, 9, 8, 10, '#f4ecd0'); P(c, cx - 1, 9, 2, 10, '#d8c9a0');
    [11, 13, 15].forEach(y => { P(c, cx - 6, y, 4, 1, '#9a8a6a'); P(c, cx + 2, y, 4, 1, '#9a8a6a'); }); P(c, cx + 3, 17, 3, 1, '#c77dff'); P(c, cx - 6, 17, 3, 1, '#4ac8ff');
  }
  if (n > 1) { P(c, 22, 8, 4, 8, '#f4ecd0'); P(c, 22, 8, 4, 1, '#ffffff'); P(c, 23, 6, 2, 2, '#3a3744'); }
  return csRound(cv);
}
function csStool(c) {
  P(c, 8, 21, 2, 2, '#573619'); P(c, 14, 21, 2, 2, '#573619'); P(c, 6, 18, 12, 3, '#6e4527');
  ell(c, 12, 18, 6, 2, '#a97d4f'); ell(c, 12, 18, 3, 1, '#8a5a3a');
}
function csTable() {
  const cv = mk(24, 30), c = cv.getContext('2d');
  P(c, 10, 14, 4, 12, '#573619'); ell(c, 12, 26, 6, 2, '#573619');
  ell(c, 12, 10, 11, 6, '#6e4527'); ell(c, 12, 9, 11, 6, '#a97d4f'); ell(c, 12, 9, 8, 4, '#b98a5a');
  P(c, 6, 5, 4, 4, '#c9a26a'); P(c, 6, 4, 4, 2, '#ffffff'); P(c, 10, 6, 1, 2, '#c9a26a'); P(c, 15, 7, 4, 4, '#c9a26a'); P(c, 15, 6, 4, 2, '#ffffff');
  return csRound(cv);
}
function csStove() {
  const cv = mk(28, 34), c = cv.getContext('2d'), r = rng(48);
  P(c, 17, 0, 8, 12, '#6f6c7a'); P(c, 17, 0, 8, 2, '#a29fac');
  csBricks(c, 1, 10, 26, 24, '#8a8794', r, 5, 8); P(c, 1, 10, 26, 2, '#a29fac');
  P(c, 6, 17, 16, 17, '#1c1824'); ell(c, 14, 17, 8, 3, '#1c1824');
  P(c, 3, 8, 22, 2, '#4a4658');
  P(c, 11, 2, 1, 10, '#2f2c38'); ell(c, 11, 14, 4, 3, '#2f343f'); P(c, 8, 12, 7, 2, '#4a505c');
  return csRound(cv);
}
function csBar() {
  const cv = mk(22, 46), c = cv.getContext('2d');
  P(c, 1, 14, 20, 32, '#8a5a3a'); P(c, 1, 14, 20, 3, '#c29463'); P(c, 1, 17, 20, 1, '#6e4527'); P(c, 1, 45, 20, 1, '#573619');
  for (let y = 22; y < 44; y += 6) P(c, 1, y, 20, 1, '#6e4527'); P(c, 10, 18, 1, 27, '#573619');
  P(c, 2, 0, 18, 14, '#8a5a3a'); P(c, 2, 0, 18, 2, '#b98a5a'); [3, 12].forEach(y => P(c, 2, y, 18, 2, '#4a505c'));
  P(c, 4, 4, 14, 7, '#a97d4f'); P(c, 4, 4, 14, 1, '#c29463'); P(c, 9, 7, 4, 3, '#c9a14a');
  [[4, '#c9a26a'], [15, '#c9a26a']].forEach(([x, col]) => { P(c, x, 10, 4, 5, col); P(c, x, 9, 4, 2, '#ffffff'); });
  return csRound(cv);
}
function csForge() {
  const cv = mk(56, 38), c = cv.getContext('2d'), r = rng(49);
  P(c, 36, 0, 12, 16, '#6f6c7a'); P(c, 36, 0, 12, 2, '#a29fac'); P(c, 36, 0, 3, 16, '#8f8c99'); P(c, 45, 0, 3, 16, '#58556a');
  csBricks(c, 2, 12, 52, 26, '#7e7b8a', r, 6, 10); P(c, 2, 12, 52, 2, '#a29fac'); P(c, 2, 12, 52, 1, '#c8c5d2');
  P(c, 12, 20, 32, 18, '#1c1824'); ell(c, 28, 20, 16, 4, '#1c1824'); P(c, 12, 33, 32, 5, '#3a1a10');
  for (let x = 14; x < 42; x += 4) P(c, x, 34 + (x % 8 ? 0 : 1), 3, 2, x % 8 ? '#ff7a1a' : '#e0452a');
  P(c, 47, 24, 6, 12, '#8a5a3a'); P(c, 47, 24, 6, 2, '#b98a5a'); P(c, 48, 28, 4, 1, '#573619');
  return csRound(cv);
}
function csForgeFire(k) {
  const cv = mk(26, 12), c = cv.getContext('2d');
  [[3, 3], [8, 5], [13, 2], [18, 4], [21, 6]].forEach(([x, h], i) => {
    const hh = h + ((k + i) % 3), x0 = x + (k % 2);
    P(c, x0, 12 - hh, 4, hh, '#ff7a1a'); P(c, x0 + 1, 12 - hh + 2, 2, hh - 2, '#ffd23f'); P(c, x0 + 1, 12 - hh - 1, 2, 1, '#ff9f3a');
  });
  P(c, 0, 9, 26, 3, '#e0452a'); P(c, 2, 10, 22, 2, '#ff7a1a');
  return cv;
}
function csAnvil() {
  const cv = mk(18, 14), c = cv.getContext('2d');
  P(c, 5, 10, 8, 4, '#4a505c'); P(c, 3, 7, 12, 4, '#6b7280'); P(c, 3, 6, 12, 2, '#8b93a1'); P(c, 0, 6, 4, 2, '#8b93a1'); P(c, 1, 8, 3, 1, '#6b7280'); P(c, 13, 5, 3, 1, '#c3c8d1');
  return csRound(cv);
}
function csRack() {
  const cv = mk(44, 26), c = cv.getContext('2d');
  P(c, 1, 20, 42, 6, '#6e4527'); P(c, 1, 20, 42, 1, '#8a5a3a'); P(c, 2, 4, 2, 18, '#573619'); P(c, 40, 4, 2, 18, '#573619'); P(c, 2, 4, 40, 2, '#6e4527');
  [[7, '#c3c8d1'], [13, '#c3c8d1'], [19, '#8a5a3a']].forEach(([x, col], i) => { P(c, x, i === 2 ? 0 : 6, 2, i === 2 ? 20 : 14, col); P(c, x - 1, 13, 4, 1, '#d9ae4a'); });
  P(c, 19, 0, 2, 3, '#c3c8d1');
  [[30, '#a8323e'], [38, '#2b4a9a']].forEach(([x, col]) => { ell(c, x, 14, 5, 5, '#d9ae4a'); ell(c, x, 14, 4, 4, col); P(c, x - 1, 12, 2, 4, '#e8e8f0'); });
  return csRound(cv);
}
function csDummy() {
  const cv = mk(16, 34), c = cv.getContext('2d');
  P(c, 7, 12, 2, 20, '#6e4527'); P(c, 3, 30, 10, 3, '#573619'); P(c, 1, 14, 14, 3, '#8a5a3a');
  ell(c, 8, 6, 5, 5, '#d9b95a'); P(c, 5, 5, 2, 2, '#3a3744'); P(c, 9, 5, 2, 2, '#3a3744'); P(c, 6, 9, 4, 1, '#3a3744');
  P(c, 3, 17, 10, 10, '#d9b95a'); P(c, 3, 17, 10, 1, '#f0d680'); P(c, 5, 20, 6, 6, '#b8404a'); P(c, 7, 22, 2, 2, '#fff1b0'); P(c, 0, 14, 3, 5, '#d9b95a'); P(c, 13, 14, 3, 5, '#d9b95a');
  return csRound(cv);
}
function csTorchPost() {
  const cv = mk(10, 22), c = cv.getContext('2d');
  P(c, 4, 7, 2, 15, '#2f2c38'); P(c, 3, 20, 4, 2, '#4a4658'); P(c, 1, 5, 8, 3, '#4a4658'); P(c, 1, 5, 8, 1, '#8b93a1'); P(c, 2, 8, 6, 1, '#2f2c38');
  return csRound(cv);
}

// ---- courtyard and village dressing (stable, garden fence, barrels, cottages, trees) ----
function csHorse(c, x, y, coat, mane, blaze) {
  P(c, x + 2, y + 6, 12, 10, coat); P(c, x + 4, y + 2, 8, 6, coat); P(c, x + 3, y, 2, 3, coat); P(c, x + 11, y, 2, 3, coat);
  P(c, x + 5, y + 1, 6, 2, mane); P(c, x + 2, y + 5, 2, 8, mane); P(c, x + 13, y + 5, 1, 8, shade(coat, 0.8));
  P(c, x + 5, y + 8, 2, 2, '#1c1824'); P(c, x + 9, y + 8, 2, 2, '#1c1824'); P(c, x + 6, y + 12, 4, 4, shade(coat, 1.12)); P(c, x + 7, y + 13, 1, 1, '#1c1824'); P(c, x + 9, y + 13, 1, 1, '#1c1824');
  if (blaze) P(c, x + 7, y + 3, 2, 6, blaze);
}
function csStable() {
  const cv = mk(80, 40), c = cv.getContext('2d'), r = rng(51);
  P(c, 0, 12, 80, 28, '#8a5a3a');
  for (let y = 14; y < 40; y += 4) { P(c, 0, y, 80, 1, '#6e4527'); for (let x = (y % 8) * 2; x < 80; x += 14) P(c, x, y, 1, 4, '#6e4527'); }
  for (let y = 0; y < 12; y += 3) {
    for (let x = (y % 6 ? 0 : -4); x < 80; x += 8) { const col = (x / 8 + y) % 2 ? '#a8323e' : '#8f2330'; P(c, Math.max(0, x), y, Math.min(8, 80 - Math.max(0, x)), 3, col); P(c, Math.max(0, x), y, Math.min(8, 80 - Math.max(0, x)), 1, lift(col, 24)); }
  }
  P(c, 0, 10, 80, 3, '#4a3220'); P(c, 0, 10, 80, 1, '#6e4527');
  [[6, '#8a4a22', '#3a2616', '#f4f1ea'], [46, '#d8d4cc', '#8b93a1', null]].forEach(([x, coat, mane, blaze]) => {
    P(c, x, 16, 28, 24, '#2a1d16'); P(c, x + 2, 16, 24, 2, '#1c1824');
    csHorse(c, x + 6, 20, coat, mane, blaze);
    P(c, x, 30, 28, 10, '#6e4527'); P(c, x, 30, 28, 1, '#b98a5a'); P(c, x, 35, 28, 1, '#573619');
  });
  [0, 38, 76].forEach(x => { P(c, x, 12, 4, 28, '#4a3220'); P(c, x, 12, 1, 28, '#6e4527'); });
  for (let i = 0; i < 6; i++) P(c, 4 + Math.floor(r() * 70), 38, 3, 1, '#d9b95a');
  return csRound(cv);
}
function csGardenFence() {
  const cv = mk(68, 26), c = cv.getContext('2d');
  P(c, 0, 2, 68, 2, '#c29463'); P(c, 0, 2, 68, 1, '#e0bf86');
  P(c, 0, 0, 3, 25, '#a97d4f'); P(c, 65, 0, 3, 25, '#a97d4f'); P(c, 0, 0, 3, 1, '#e0bf86'); P(c, 65, 0, 3, 1, '#e0bf86');
  for (let x = 4; x < 64; x += 5) { P(c, x, 17, 3, 8, '#c29463'); P(c, x, 16, 3, 1, '#e0bf86'); P(c, x + 1, 15, 1, 1, '#e0bf86'); P(c, x + 2, 17, 1, 8, '#8a5a3a'); }
  P(c, 0, 20, 68, 1, '#8a5a3a');
  return csRound(cv);
}
function csBarrels() {
  const cv = mk(36, 24), c = cv.getContext('2d');
  const barrel = (x, y, w, h) => {
    P(c, x, y, w, h, '#8a5a3a'); P(c, x, y, w, 2, '#b98a5a'); P(c, x + 1, y + 2, 2, h - 3, '#a97d4f'); P(c, x + w - 3, y + 2, 2, h - 3, '#6e4527');
    P(c, x, y + 4, w, 1, '#4a505c'); P(c, x, y + h - 5, w, 1, '#4a505c'); P(c, x, y + h - 1, w, 1, '#573619');
  };
  barrel(2, 8, 14, 16); barrel(18, 10, 14, 14); barrel(10, 0, 14, 16);
  return csRound(cv);
}
function csCottage(roof) {
  const cv = mk(36, 30), c = cv.getContext('2d'), r = rng(52);
  P(c, 3, 14, 30, 16, '#e8dcc0'); P(c, 3, 14, 30, 2, '#d8c9a0'); P(c, 3, 28, 30, 2, '#b8946a'); P(c, 28, 14, 5, 16, '#cdbd96');
  P(c, 3, 14, 1, 16, '#6e4527'); P(c, 32, 14, 1, 16, '#6e4527'); P(c, 17, 14, 1, 16, '#6e4527'); P(c, 3, 22, 30, 1, '#6e4527');
  P(c, 7, 18, 8, 7, '#6e4527'); P(c, 8, 19, 6, 5, '#9fd3ee'); P(c, 10, 19, 1, 5, '#6e4527'); P(c, 8, 21, 6, 1, '#6e4527');
  P(c, 21, 18, 8, 12, '#573619'); P(c, 22, 19, 6, 11, '#8a5a3a'); P(c, 27, 24, 1, 2, '#d9ae4a');
  P(c, 25, 0, 5, 9, '#7e7b8a'); P(c, 25, 0, 5, 1, '#a29fac');
  for (let i = 0; i < 12; i++) {
    const w = 8 + Math.round(i * 28 / 11), y = 3 + i;
    P(c, 18 - w / 2, y, w, 1, i % 3 === 2 ? shade(roof, 0.8) : roof); if (r() < 0.5) P(c, 18 - w / 2 + Math.floor(r() * w), y, 2, 1, lift(roof, 22));
  }
  P(c, 2, 14, 32, 1, shade(roof, 0.65));
  return csRound(cv);
}
function csTree() {
  const cv = mk(26, 32), c = cv.getContext('2d'), r = rng(53);
  P(c, 11, 18, 4, 14, '#6e4527'); P(c, 11, 18, 1, 14, '#8a5a3a'); P(c, 9, 29, 8, 3, '#573619');
  blob(c, 13, 9, 9, '#3f8a42'); blob(c, 8, 12, 6, '#3f8a42'); blob(c, 18, 12, 6, '#3f8a42');
  blob(c, 11, 7, 5, '#4e9d4e'); blob(c, 17, 9, 3, '#4e9d4e');
  for (let i = 0; i < 18; i++) P(c, 4 + Math.floor(r() * 18), 3 + Math.floor(r() * 16), 2, 1, i % 3 ? '#6aae58' : '#2f6e35');
  P(c, 9, 5, 3, 1, '#9fd68a');
  return csRound(cv);
}
function csHay() {
  const cv = mk(20, 14), c = cv.getContext('2d');
  P(c, 1, 2, 18, 11, '#d9b95a'); P(c, 1, 2, 18, 2, '#ecd27e'); P(c, 1, 11, 18, 2, '#b8943a');
  for (let x = 3; x < 18; x += 4) P(c, x, 4, 1, 7, '#b8943a');
  P(c, 1, 6, 18, 1, '#8a5a3a'); P(c, 1, 9, 18, 1, '#8a5a3a');
  return csRound(cv);
}
function csWell() {
  const cv = mk(22, 28), c = cv.getContext('2d');
  P(c, 2, 0, 18, 3, '#6e4527'); P(c, 0, 3, 22, 3, '#a8323e'); P(c, 3, 6, 2, 10, '#573619'); P(c, 17, 6, 2, 10, '#573619');
  P(c, 10, 6, 2, 6, '#8a5a3a'); P(c, 9, 12, 4, 3, '#4a505c');
  ell(c, 11, 20, 9, 5, '#7e7b8a'); ell(c, 11, 20, 7, 3, '#2a5f94'); P(c, 2, 20, 18, 6, '#8a8794'); P(c, 2, 20, 18, 1, '#a29fac'); P(c, 5, 22, 12, 1, '#6f6c7a');
  ell(c, 11, 19, 6, 2, '#3e86c4');
  return csRound(cv);
}

// ---- small animated bits ----
function csFlameFrames(scene) {
  [['.y.', 'yoy', 'yoy', '.o.'], ['y..', 'yoy', 'yoy', '.o.'], ['..y', 'yoy', 'yoy', '.o.']]
    .forEach((rows, k) => scene.textures.addCanvas('flame' + k, glyph(rows, { y: '#ffe27a', o: '#ff7a1a' })));
}
function csFlag(k, col) {
  const cv = mk(14, 9), c = cv.getContext('2d');
  for (let x = 0; x < 13; x++) {
    const dy = Math.round(Math.sin((x * 0.55) - k * 1.57) * 1.5 * (x / 12));
    P(c, x, 1 + dy, 1, 6, x % 6 < 2 ? shade(col, 0.82) : col); P(c, x, 1 + dy, 1, 1, lift(col, 30));
    if (x > 4 && x < 9) P(c, x, 3 + dy, 1, 2, CS_GOLD);
  }
  return csRound(cv);
}
function csBird(k) {
  const cv = mk(9, 5), c = cv.getContext('2d');
  const w = k ? [[0, 1], [1, 0], [2, 1], [3, 2], [4, 2], [5, 2], [6, 1], [7, 0], [8, 1]] : [[0, 3], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 3]];
  w.forEach(([x, y]) => P(c, x, y, 1, 1, '#2f2c38')); P(c, 4, 3, 1, 1, '#2f2c38');
  return cv;
}
function csGlow() {
  const cv = mk(48, 48), c = cv.getContext('2d');
  for (let r = 22; r > 0; r -= 2) { c.globalAlpha = 0.07; blob(c, 24, 24, r, '#ffb44a'); }
  c.globalAlpha = 1; return cv;
}
const csPuff = () => { const cv = mk(7, 6), c = cv.getContext('2d'); ell(c, 3, 3, 3, 2, '#d8d4e0'); P(c, 1, 2, 2, 1, '#f4f1ea'); return cv; };
const csBurst = (k) => glyph(k === 0
  ? ['..w..', '.wyw.', 'wyyyw', '.wyw.', '..w..']
  : k === 1
    ? ['y...w...y', '.y..w..y.', '..y.w.y..', '...ywy...', 'wwwwyywww'.slice(0, 9), '...ywy...', '..y.w.y..', '.y..w..y.', 'y...w...y']
    : ['w.......w', '.........', '...y.y...', '.........', '.y.....y.', '.........', '...y.y...', '.........', 'w.......w'], { w: '#ffffff', y: '#ffd23f' });
const csDizzy = () => glyph(['.y.', 'yyy', '.y.'], { y: '#ffd23f' });
const csSpear = () => { const cv = mk(5, 34), c = cv.getContext('2d'); P(c, 2, 5, 1, 29, '#6e4527'); P(c, 1, 0, 3, 3, '#dde3ea'); P(c, 2, 0, 1, 6, '#c3c8d1'); P(c, 1, 5, 3, 1, '#a8323e'); return csRound(cv); };

// ======================= Castle ambient life: torches, flags, moat, birds, day/night, guard, bursts =======================
const CS_T0 = 0;
const CS_DAY = [[0, [255, 255, 255]], [40, [255, 255, 255]], [50, [255, 196, 160]], [62, [88, 100, 170]], [88, [88, 100, 170]], [98, [255, 214, 190]], [104, [255, 255, 255]]];
function csTint(t) {
  const u = t % 104;
  for (let i = 1; i < CS_DAY.length; i++) {
    if (u <= CS_DAY[i][0]) {
      const [t0, a] = CS_DAY[i - 1], [t1, b] = CS_DAY[i], k = (u - t0) / (t1 - t0);
      const rgb3 = a.map((v, j) => Math.round(v + (b[j] - v) * k));
      return { color: (rgb3[0] << 16) | (rgb3[1] << 8) | rgb3[2], night: Math.max(0, Math.min(1, (255 - (rgb3[0] + rgb3[1] + rgb3[2]) / 3) / 136)) };
    }
  }
  return { color: 0xffffff, night: 0 };
}

// torches: [x, flame base y, painted holder?, scale]
const CS_TORCHES = [[51, 27], [85, 27], [200, 27], [280, 27], [384, 27], [426, 27], [212, 60, 'post'], [268, 60, 'post'], [212, 284, 'post'], [268, 284, 'post'],
  [10, 128, 'post'], [470, 128, 'post'], [10, 194, 'post'], [470, 194, 'post']];
const CS_FORGE = [372, 170];
const CS_CANDLES = [[172, 122], [308, 122], [360, 122]];
const CS_GLOWS = [[8, 69, 0.5], [8, 87, 0.5], [136, 69, 0.5], [136, 87, 0.5], [344, 69, 0.5], [344, 87, 0.5], [472, 69, 0.5], [472, 87, 0.5],
  [CS_FORGE[0] + 28, CS_FORGE[1] + 28, 1], [406, 40, 0.8]];
// tower and gate flags: [x, y, colour, mirrored]
const CS_FLAGS = [[8, 17, 'B', 0], [136, 17, 'R', 0], [344, 17, 'R', 0], [471, 17, 'B', 1], [216, 191, 'R', 0], [264, 191, 'R', 0], [12, 191, 'B', 0], [468, 191, 'B', 1]];
const CS_BIRD_ROUTES = [[22, 15, 0], [96, 20, 40], [150, 12, 90], [268, 17, 60]];
const CS_PATROL = [[200, 216], [16, 130], [16, 186], [170, 216], [240, 216], [312, 216], [464, 186], [464, 130], [464, 186], [270, 216]];

function csAmbient(scene, ctx) {
  const th = CASTLE, tex = (k, cv) => scene.textures.addCanvas(k, cv);
  csFlameFrames(scene);
  tex('glow', csGlow()); tex('puff', csPuff()); tex('dizzy', csDizzy()); tex('spear', csSpear());
  [0, 1, 2].forEach(k => { tex('burst' + k, csBurst(k)); tex('moat' + k, csMoat(k)); tex('ffire' + k, csForgeFire(k)); });
  [0, 1].forEach(k => tex('bird' + k, csBird(k)));
  [0, 1, 2, 3].forEach(k => { tex('flagR' + k, csFlag(k, '#b53a46')); tex('flagB' + k, csFlag(k, '#3b5ba8')); });
  tex('ember', glyph(['x'], { x: '#ffb040' }));

  const [FX0, FY0] = CS_FORGE;
  const moat = scene.add.image(0, 240, 'moat0').setOrigin(0, 0).setDepth(-9.5);
  const fire = scene.add.image(FX0 + 15, FY0 + 26, 'ffire0').setOrigin(0, 0).setDepth(FY0 + 39);
  const flags = CS_FLAGS.map(([x, y, c, flip]) => { const f = scene.add.image(x, y, 'flag' + c + '0').setOrigin(flip ? 1 : 0, 0).setFlipX(!!flip).setDepth(y > 100 ? 241 : 113); f.col = c; return f; });
  const flames = CS_TORCHES.map(([x, y, post], i) => {
    return scene.add.image(x, y - (post ? 21 : 7), 'flame0').setOrigin(0.5, 1).setDepth(post ? y + 1 : 41);
  });
  const candles = CS_CANDLES.map(([x, y]) => scene.add.image(x, y, 'flame0').setOrigin(0.5, 1).setScale(0.5).setDepth(110.6));
  const stoveFlame = scene.add.image(406, 46, 'flame0').setOrigin(0.5, 1).setScale(2).setDepth(49);
  const glows = CS_TORCHES.map(([x, y, post]) => [x, y - (post ? 24 : 9), 1]).concat(CS_GLOWS)
    .map(([x, y, s]) => scene.add.image(x, y, 'glow').setScale(s).setDepth(901).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
  const tint = scene.add.rectangle(0, 0, W, H, 0xffffff).setOrigin(0, 0).setDepth(900).setBlendMode(Phaser.BlendModes.MULTIPLY);
  const birds = CS_BIRD_ROUTES.map(([y, sp, off]) => ({ y, sp, off, img: scene.add.image(0, y, 'bird0').setDepth(950) }));
  const puffs = [[FX0 + 42, FY0 + 2], [413, 10]].flatMap(([x, y], g) => [0, 1, 2, 3].map(k => ({ x, y, k, img: scene.add.image(x, y, 'puff').setDepth(960).setAlpha(0) })));
  const embers = [0, 1, 2, 3].map(k => ({ k, img: scene.add.image(0, 0, 'ember').setScale(2).setDepth(FY0 + 40).setAlpha(0) }));
  const bursts = [0, 1, 2, 3, 4].map(() => ({ t: 9, kind: 0, img: scene.add.image(0, 0, 'burst0').setDepth(1001).setVisible(false) }));
  scene.events.on('burst', (x, y, kind) => {
    if (reduceMotion) return;
    const b = bursts.find(o => o.t >= 0.34) || bursts[0]; b.t = 0; b.kind = kind; b.x = x; b.y = y;
  });

  // guard patrol: a scripted walker on the shared navigation, climbing the rampart stairs
  [['walk-down', 4], ['walk-up', 4], ['walk-side', 4], ['idle-down', 4]].forEach(([a, n]) => { for (let f = 0; f < n; f++) tex(`gd-${a}-${f}`, charFrame(th, CS_GUARD, a, f)); });
  const gd = { x: 240, y: 216, dir: 'down', path: [], wait: 1.5, i: 0, t: 0, moving: false };
  const gSprite = scene.add.sprite(gd.x, gd.y, 'gd-idle-down-0').setOrigin(...th.origin);
  const gSpear = scene.add.image(0, 0, 'spear').setOrigin(0.5, 1);
  const gShadow = scene.add.image(0, 0, 'fx-shadow').setOrigin(0.5, 0.7);
  let prev = 0;

  return (t) => {
    const dt = Math.min(0.1, Math.max(0, t - prev)); prev = t;
    const still = reduceMotion, tt = still ? 0 : t + CS_T0;
    // day/night
    const tn = still ? { color: 0xffffff, night: 0 } : csTint(tt);
    tint.setFillStyle(tn.color);
    // torches
    flames.forEach((f, i) => f.setTexture('flame' + (still ? 0 : Math.floor(tt * 7 + i * 2) % 3)));
    candles.forEach((f, i) => f.setTexture('flame' + (still ? 0 : Math.floor(tt * 6 + i) % 3)).setAlpha(0.95));
    stoveFlame.setTexture('flame' + (still ? 0 : Math.floor(tt * 6) % 3));
    glows.forEach((g, i) => g.setAlpha(still ? 0 : tn.night * (0.45 + 0.1 * Math.sin(tt * 9 + i * 1.7) + 0.05 * Math.sin(tt * 23 + i))));
    // moat, forge, flags
    moat.setTexture('moat' + (still ? 0 : Math.floor(tt * 2.2) % 3));
    fire.setTexture('ffire' + (still ? 0 : Math.floor(tt * 6) % 3));
    flags.forEach((f, i) => f.setTexture('flag' + f.col + (still ? 0 : Math.floor(tt * 5 + i) % 4)));
    // birds fly across the sky
    birds.forEach((b, i) => {
      const x = still ? 60 + i * 90 : ((tt * b.sp + b.off * 6) % (W + 60)) - 20;
      b.img.setPosition(Math.round(x), Math.round(b.y + (still ? 0 : Math.sin(tt * 1.3 + i * 2) * 5))).setTexture('bird' + (still ? 0 : Math.floor(tt * 5 + i) % 2)).setAlpha(1 - tn.night * 0.8);
    });
    // chimney smoke and forge embers
    puffs.forEach((p) => {
      const ph = still ? 0.3 + p.k * 0.15 : (tt * 0.35 + p.k / 4) % 1;
      p.img.setPosition(Math.round(p.x + Math.sin(ph * 6 + p.k) * 2 + ph * 4), Math.round(p.y - ph * 14)).setAlpha(still ? 0.5 : Math.sin(Math.PI * ph) * 0.8).setScale(0.6 + ph * 0.6);
    });
    embers.forEach((e) => {
      const ph = still ? 0 : (tt * 0.8 + e.k / 4) % 1;
      e.img.setPosition(Math.round(FX0 + 18 + e.k * 7 + Math.sin(ph * 8 + e.k) * 3), Math.round(FY0 + 24 - ph * 18)).setAlpha(still ? 0 : 1 - ph);
    });
    // bursts (sword clashes)
    bursts.forEach(b => {
      if (b.t >= 0.34) { b.img.setVisible(false); return; }
      b.t += dt; const k = Math.min(2, Math.floor(b.t / 0.11));
      b.img.setVisible(true).setTexture('burst' + k).setPosition(Math.round(b.x), Math.round(b.y)).setScale(b.kind === 'bonk' ? 2 : 1).setAlpha(1 - b.t / 0.4);
    });
    // guard
        if (still) { gd.x = 240; gd.y = 216; gd.dir = 'down'; gd.moving = false; }
    else if (gd.moving) {
      let budget = 30 * dt;
      while (budget > 0 && gd.path.length) {
        const p = gd.path[0], dx = p.x - gd.x, dy = p.y - gd.y, d = Math.hypot(dx, dy);
        if (d < 0.01) { gd.path.shift(); continue; }
        gd.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        const m = Math.min(budget, d); gd.x += dx / d * m; gd.y += dy / d * m; budget -= m; if (m === d) gd.path.shift();
      }
      if (!gd.path.length) { gd.moving = false; gd.wait = 2.2; gd.dir = 'down'; }
    } else {
      gd.wait -= dt;
      if (gd.wait <= 0) {
        gd.i = (gd.i + 1) % CS_PATROL.length; const [gx, gy] = CS_PATROL[gd.i];
        gd.path = ctx.route({ x: gd.x, y: gd.y, at: null }, { x: gx, y: gy }); gd.moving = gd.path.length > 0; gd.wait = 1;
      }
    }
    gd.t += dt;
    const side = gd.dir === 'left' || gd.dir === 'right', gy2 = Math.round(gd.y), gl = csLift(gd.x, gd.y);
    const anim = gd.moving ? 'walk-' + (side ? 'side' : gd.dir) : 'idle-down', n = 4, rate = gd.moving ? 8 : 2;
    const f = still ? 0 : Math.floor(gd.t * rate) % n, gx2 = Math.round(gd.x);
    gSprite.setTexture(`gd-${anim}-${f}`).setPosition(gx2, gy2 + gl).setDepth(gy2).setFlipX(gd.dir === 'left');
    gSpear.setPosition(gx2 + (gd.dir === 'left' ? -8 : 8), gy2 + gl - 1 + (gd.moving ? Math.round(Math.sin(gd.t * 16)) : 0)).setDepth(gy2 + (gd.dir === 'up' ? -0.2 : 0.2));
    gShadow.setPosition(gx2, gy2 + gl).setDepth(gy2 - 0.5);
  };
}

// ======================= Theme: Castle (top-down castle with a courtyard arena) =======================
// ---- duel animations: poses share the side view; the sword is drawn through the `item` hook ----
const csBlade = (dx, dy) => (c, cx, cy) => {
  const flat = Math.abs(dx) > Math.abs(dy);
  line(c, cx, cy, cx + dx, cy + dy, '#eef3f8'); line(c, cx + (flat ? 0 : 1), cy + (flat ? 1 : 0), cx + dx + (flat ? 0 : 1), cy + dy + (flat ? 1 : 0), '#aab4c2');
  if (flat) P(c, cx, cy - 1, 1, 4, CS_GOLD); else P(c, cx - 1, cy, 4, 1, CS_GOLD);
};
const csNoItem = () => {};
const csPose = (o) => Object.assign({ view: 'side', far: [9, 0], near: [13, 0] }, o);
const CS_DUEL_ANIMS = {
  'duel-guard':  { n: 2, rate: 3 }, 'duel-wind': { n: 1, rate: 1 }, 'duel-slash': { n: 1, rate: 1 }, 'duel-lock': { n: 1, rate: 1 },
  'duel-parry':  { n: 1, rate: 1 }, 'duel-dodge': { n: 1, rate: 1, yOff: [-4] }, 'duel-whiff': { n: 1, rate: 1 },
  'duel-hit':    { n: 2, rate: 3 }, 'duel-win': { n: 2, rate: 4, yOff: [0, -2] }, 'duel-salute': { n: 2, rate: 2 },
  'duel-shake':  { n: 2, rate: 3 }, 'duel-bow': { n: 2, rate: 1.2 },
};
const CS_SPECS = {
  'duel-guard': f => csPose({ hy: f, ty: f, armPx: [[11, 14 + f], [12, 14 + f], [13, 14 + f]], hand: [14, 13 + f], cup: [15, 13 + f], item: csBlade(6, -5) }),
  'duel-wind':  () => csPose({ far: [8, 0], armPx: [[10, 14], [9, 13], [8, 12], [7, 11]], hand: [6, 9], cup: [6, 8], item: csBlade(-3, -7) }),
  'duel-slash': () => csPose({ hy: 1, ty: 1, near: [14, 0], armPx: [[11, 15], [12, 14], [13, 13], [14, 12]], hand: [15, 10], cup: [16, 11], item: csBlade(5, 6) }),
  'duel-lock':  () => csPose({ hy: 1, ty: 1, near: [14, 0], armPx: [[11, 15], [12, 15], [13, 15], [14, 14]], hand: [15, 13], cup: [16, 13], item: csBlade(7, 0) }),
  'duel-parry': () => csPose({ armPx: [[11, 14], [12, 13], [13, 12]], hand: [14, 10], cup: [15, 10], item: csBlade(4, -8) }),
  'duel-dodge': () => csPose({ hy: -1, ty: -1, far: [9, 2], near: [13, 2], armPx: [[10, 13], [9, 12], [8, 11]], hand: [7, 9], cup: [7, 8], item: csBlade(-3, -6) }),
  'duel-whiff': () => csPose({ hy: 2, ty: 1, near: [15, 0], armPx: [[11, 15], [12, 16], [13, 17], [14, 18]], hand: [15, 18], cup: [16, 19], item: csBlade(5, 3) }),
  'duel-hit':   f => csPose({ eyes: 'closed', hy: 1 + f, far: [f ? 9 : 10, 0], near: [f ? 13 : 12, 0] }),
  'duel-win':   () => csPose({ armPx: [[11, 14], [12, 13], [13, 12], [14, 11], [15, 10]], hand: [16, 8], cup: [17, 8], item: csBlade(3, -7) }),
  'duel-salute': f => csPose({ hy: f, far: [10, 0], near: [12, 0], armPx: [[11, 14], [12, 14], [13, 13], [14, 12]], hand: [15, 10], cup: [16, 10], item: csBlade(0, -9) }),
  'duel-shake': f => csPose({ far: [10, 0], near: [12, 0], armPx: Array.from({ length: 10 }, (_, i) => [11 + i, 14 - f]), hand: [21, 13 - f], cup: [0, 0], item: csNoItem }),
  'duel-bow':   f => csPose({ eyes: 'closed', hy: 3 - f, ty: 1, far: [10, 0], near: [12, 0], armPx: [[11, 15], [12, 15]], hand: [13, 15], cup: [0, 0], item: csNoItem }),
};

// ---- the playful duel: two idle bots pair up in the arena, trade blows, one wins, both make up ----
const CS_BEATS = [  // [seconds, winner [anim, dx], loser [anim, dx], burst]; dx is toward the opponent
  [0.9, ['duel-salute', 0], ['duel-salute', 0]],
  [0.7, ['duel-guard', 9], ['duel-guard', 9]],
  [0.35, ['duel-wind', -1], ['duel-guard', 0]],
  [0.16, ['duel-slash', 8], ['duel-parry', 0]],
  [0.45, ['duel-lock', 0], ['duel-lock', 0], 'clash'],
  [0.3, ['duel-guard', -4], ['duel-guard', -4]],
  [0.35, ['duel-guard', 0], ['duel-wind', -1]],
  [0.16, ['duel-dodge', -6], ['duel-slash', 8]],
  [0.5, ['duel-guard', 0], ['duel-whiff', 3]],
  [0.35, ['duel-wind', -2], ['duel-wind', -2]],
  [0.16, ['duel-slash', 4], ['duel-slash', 4]],
  [0.5, ['duel-lock', 0], ['duel-lock', 0], 'clash'],
  [0.35, ['duel-guard', -7], ['duel-guard', -7]],
  [0.35, ['duel-guard', 9], ['duel-guard', 0]],
  [0.16, ['duel-slash', 5], ['duel-guard', 0]],
  [0.35, ['duel-lock', 0], ['duel-hit', -8], 'bonk'],
  [1.5, ['duel-win', 0], ['duel-hit', 0]],
];
function* csSync(D, me, k) { D.flag[me] = k; while (!D.over && D.flag[1 - me] < k) yield { do: 'idle', t: 0.1 }; }
function* csDuelRun(bot, D, me) {
  bot.dueling = true;
  try {
    const sgn = me === 0 ? 1 : -1, win = D.win === me, face = me === 0 ? 'right' : 'left';
    yield { walk: { x: me === 0 ? 216 : 264, y: 190, face } };
    yield* csSync(D, me, 1);
    for (const [t, w, l, burst] of CS_BEATS) {
      if (D.over) break;
      const [anim, dx] = win ? w : l;
      const on = burst && win ? (b) => {
        const [A, B] = D.bots, hit = burst === 'bonk' ? (D.win === 0 ? B : A) : null;
        b.scene.events.emit('burst', hit ? hit.x : (A.x + B.x) / 2, A.y - (hit ? 20 : 13), burst);
      } : undefined;
      yield { do: anim, t, dx: dx * sgn, on };
    }
    if (!D.over) yield { walk: { x: me === 0 ? 230 : 250, y: 190, face } };
    yield* csSync(D, me, 2);
    if (!D.over) yield { do: D.bow ? 'duel-bow' : 'duel-shake', t: 1.8 };
    yield { do: 'idle', t: 0.4 };
  } finally {
    D.over = true; bot.dueling = false;
    if (--D.left === 0 && bot.ctx.world.arena === D) bot.ctx.world.arena = null;
  }
}
function* csDuelMate(bot, D, me) { yield* csDuelRun(bot, D, me); yield* scriptIdle(bot); }
function csIdleExtra(bot) {
  const ctx = bot.ctx, world = ctx.world;
  if (world.arena || Math.random() > 0.22) return null;
  const mates = ctx.bots.filter(b => b !== bot && b.state === 'idle' && !b.dueling && /^(walk|idle|fidget)/.test(b.anim));
  if (!mates.length) return null;
  const mate = mates[Math.floor(Math.random() * mates.length)], D = { bots: Math.random() < 0.5 ? [bot, mate] : [mate, bot], over: false, flag: [0, 0], left: 2, win: Math.random() < 0.5 ? 0 : 1, bow: Math.random() < 0.4 };
  world.arena = D; bot.dueling = mate.dueling = true;
  mate.divert(csDuelMate(mate, D, D.bots.indexOf(mate)));
  return csDuelRun(bot, D, D.bots.indexOf(bot));
}

// ---- cast ----
const CS_LOOKS = [
  { name: 'Merl', skin: '#f1c27d', hair: '#3b4fb8', shirt: '#3b4fb8', head: csWizard, deco: csRobeDeco,
    p: { a: '#ffd23f', b: '#f4f1ea', pants: '#2f3f96', pantsS: '#26337a', shoe: '#4a2e1c', eye: '#1d1b2a', mouth: '#8a3b3b' } },
  { name: 'Vex', skin: '#8d5524', hair: '#b06bd1', shirt: '#2f8f83', head: csAlchemist, deco: csApronDeco,
    p: { a: '#c9a14a', b: '#9fe8ff', apron: '#7a4f2c', hand: '#d9c24a', pants: '#4a3a2a', pantsS: '#3a2c20', shoe: '#2a1d16', eye: '#1d1b2a', mouth: '#4a1a1a' } },
  { name: 'Bram', skin: '#aeb7c4', hair: '#d9363e', shirt: '#aeb7c4', head: csKnight, deco: csKnightDeco,
    p: { a: '#1b1f2a', eye: '#9ad7ff', hand: '#8a93a1', pants: '#7d8794', pantsS: '#646d79', shoe: '#4a505c' } },
  { name: 'Lyra', skin: '#ffdbac', hair: '#2a9d8f', shirt: '#2a9d8f', head: csMage, deco: csMageDeco,
    p: { braid: '#e07a2f', trim: '#c77dff', eye: '#c77dff', mouth: '#a85a5a', hand: '#ffdbac', pants: '#1f6f66', pantsS: '#195c55', shoe: '#2a1d16' } },
  { name: 'Wren', skin: '#d9a066', hair: '#7a8b2e', shirt: '#56662a', head: csRanger, deco: csRangerDeco,
    p: { trim: '#d9ae4a', eye: '#2f5f2a', mouth: '#8a4a3a', hand: '#d9a066', pants: '#5a4630', pantsS: '#463724', shoe: '#2a1d16' } },
];
const CS_GUARD = { name: 'Guard', skin: '#9aa6b8', hair: '#e0b84a', shirt: '#3a5ca8', head: csKnight, deco: csKnightDeco,
  p: { a: '#1b1f2a', eye: '#9ad7ff', hand: '#8a93a1', pants: '#6c7480', pantsS: '#555c68', shoe: '#3a3f4a' } };

// walkable-area blocks: pixel rectangles (x, y, w, h) rounded out to nav tiles
const csR = (x, y, w, h) => [Math.floor(x / T), Math.floor(y / T), Math.floor((x + w - 1) / T), Math.floor((y + h - 1) / T)];
const CS_BLOCKS = [
  csR(0, 0, W, 32),                                                     // back wall
  csR(0, 32, 16, 80), csR(128, 32, 16, 80), csR(336, 32, 16, 80), csR(464, 32, 16, 80),   // pillars under the towers
  csR(22, 32, 100, 32),                                                 // cots
  csR(16, 96, 48, 16), csR(96, 96, 32, 16), csR(144, 96, 80, 16), csR(256, 96, 80, 16), csR(352, 96, 48, 16), csR(432, 96, 32, 16),   // room fronts (doors stay open)
  csR(223, 32, 34, 16), csR(156, 32, 36, 16), csR(288, 32, 36, 16),     // throne, armour
  csR(356, 44, 24, 24), csR(392, 14, 28, 40), csR(450, 32, 14, 46),     // tavern table, stove, bar
  csR(148, 112, 48, 31), csR(284, 112, 48, 31), csR(348, 112, 24, 31),  // scribe desks (seats are the row below)
  csR(72, 112, 64, 21), csR(72, 140, 44, 20), csR(124, 146, 16, 14),    // garden, weapon rack, dummy
  csR(396, 118, 32, 20),                                                // barrels
  csR(64, 184, 80, 40), csR(372, 176, 56, 32), csR(348, 206, 18, 12),   // stable, forge, anvil
  csR(32, 112, 16, 48), csR(32, 192, 16, 32), csR(432, 112, 16, 48), csR(432, 192, 16, 32),   // rampart faces (the stairs stay open)
  csR(0, 200, 32, 40), csR(448, 200, 32, 40),                           // south corner towers
  csR(0, 224, 224, 16), csR(256, 224, 224, 16), csR(208, 200, 16, 40), csR(256, 200, 16, 40),   // south wall, gate towers
  csR(0, 240, 224, 16), csR(256, 240, 224, 16),                         // moat (the drawbridge stays open)
  csR(40, 258, 40, 30), csR(388, 258, 40, 30),                          // cottages
  csR(17, 278, 8, 10), csR(113, 278, 8, 10), csR(357, 278, 8, 10), csR(455, 278, 8, 10),   // tree trunks
  csR(150, 274, 20, 6), csR(322, 274, 18, 12),                          // hay, well
];
const CS_WANDER = [[200, 86], [280, 86], [240, 78], [70, 84], [404, 84], [372, 84], [96, 168], [140, 168], [340, 168], [400, 168], [200, 196], [280, 200], [240, 214], [170, 216], [312, 216],
  [16, 130], [16, 186], [464, 130], [464, 186], [190, 272], [290, 272], [240, 266], [130, 264], [360, 264]];
// the rampart stairs: ground y offset by x
const csLift = (x, y) => (y < 112 ? 0 : x < 48 ? -8 * Math.min(1, (48 - x) / 16) : x > 432 ? -8 * Math.min(1, (x - 432) / 16) : 0);

const CS_SEATS = [160, 184, 296, 320, 360];

const CASTLE = {
  id: 'castle', w: W, h: H, bg: '#5c9a4e', origin: [11.5 / 24, 1], out: CS_OUT,
  anims: CS_DUEL_ANIMS, specs: CS_SPECS,
  looks: CS_LOOKS,
  spots: () => ({
    desk: Array.from({ length: 10 }, (_, i) => ({ x: CS_SEATS[i % CS_SEATS.length], y: 146, face: 'up', kind: 'desk', i })),
    bed: { x: 38, y: 76, approach: { x: 38, y: 80 }, exit: { x: 38, y: 80 }, face: 'down', kind: 'bed' },
    coffee: { x: 436, y: 66, face: 'right', kind: 'coffee' },
    pose: [184, 212, 240, 268, 296].map(x => ({ x, y: 88, face: 'down', kind: 'rug' })),
    wander: CS_WANDER.map(([x, y]) => ({ x, y, face: 'down', kind: 'wander' })),
  }),
  route: makeNav(W, H, CS_BLOCKS),
  start: (i) => { const [x, y] = [[200, 196], [280, 196], [220, 212], [262, 212], [240, 176]][i % 5]; return { x: x + 16 * Math.floor(i / 5), y }; },
  offsetOf: (bot) => [0, csLift(bot.x, bot.y)],
  // the throne room: the master's seat in front of the throne, and where visiting agents stand facing him
  court: { seat: { x: 240, y: 52, face: 'down' }, guests: [240, 208, 272, 176, 304].map(x => ({ x, y: 92, face: 'up' })) },
  idleExtra: csIdleExtra,
  botFx(bot, time) {
    const on = bot.anim === 'duel-hit' && !reduceMotion;
    if (!bot.dz) bot.dz = [0, 1, 2].map(() => bot.scene.add.image(0, 0, 'dizzy').setDepth(1000).setVisible(false));
    bot.dz.forEach((o, k) => {
      const a = time * 6 + k * 2.1, lf = csLift(bot.x, bot.y);
      o.setVisible(on).setPosition(Math.round(bot.x + Math.cos(a) * 7), Math.round(bot.y + lf - 27 + Math.sin(a) * 2));
    });
  },
  chair: csStool,
  sleepCover(c, p, top) {
    P(c, 2, top, 20, 24 - top, '#2b4a9a'); c.clearRect(2, top, 1, 1); c.clearRect(21, top, 1, 1);
    for (let i = 0; i < 5; i++) P(c, 3 + i * 4, top + 1, 4, 5, i % 2 ? '#e0e0e8' : '#3b5ba8');
    P(c, 3, top, 18, 1, CS_GOLD); P(c, 2, 23, 20, 1, '#1f357a'); P(c, 21, top + 1, 1, 23 - top, '#1f357a');
  },
  cup(c, cx, cy) { P(c, cx, cy, 3, 1, '#ffffff'); P(c, cx, cy + 1, 3, 1, '#c9a26a'); P(c, cx, cy + 2, 3, 1, '#8a5a3a'); P(c, cx + 3, cy + 1, 1, 1, '#c9a26a'); },
  fx: Object.assign(baseFx({ bangFill: '#f4ecd0', bangMark: '#c0392b', out: CS_OUT, z: '#fff1b0', steam: '#f4f1ea' }), {
    spark: () => fxPad(glyph(['..y..', '..y..', 'yywyy', '..y..', '..y..'], { y: '#ffd23f', w: '#fff6c9' }), '#8a5a0a'),
    cloud: () => fxPad(glyph(['....cccc....', '..cccccccc..', '.cccccccccc.', 'cccccccccccc', 'sssssssssss.'.slice(0, 12)], { c: '#6e6a6a', s: '#4a4646' }), CS_OUT),
    rain: () => glyph(['b', 'b'], { b: '#5aa9f2' }),
  }),
  props(put) {
    put('ground', csGround(), 0, 0, -10);
    put('bridge', csBridge(), 224, 240, -9);
    put('chains', csChains(), 224, 220, 240.2);
    put('lowwalls', csLowWalls(), 0, 96, 112);
    [[-6, '#a8323e'], [122, '#3d5aa8'], [330, '#3d5aa8'], [458, '#a8323e']].forEach(([x, roof], i) => put('tower' + i, csTower(roof), x, 16, 112));
    put('swall', csSouthWall(), 0, 224, 239.5);
    [[204, '#3d5aa8'], [252, '#3d5aa8'], [0, '#a8323e'], [456, '#a8323e']].forEach(([x, roof], i) => put('gate' + i, csGateTower(roof), x, 190, 240));
    put('arch', csArch(), 224, 206, 224);
    put('throne', csThrone(), 223, 10, 48);
    [156, 176, 288, 308].forEach((x, i) => put('armor' + i, csArmor(), x, 18, 48));
    ['#2b4a9a', '#9b2d35', '#3f7f4a'].forEach((col, i) => put('cot' + i, csCot(col), 22 + 34 * i, 40, 60));
    put('benchA', csBench(2), 148, 116, 110); put('benchB', csBench(2), 284, 116, 110); put('benchC', csBench(1), 348, 116, 110);
    put('table', csTable(), 356, 40, 64);
    put('stove', csStove(), 392, 14, 48);
    put('bar', csBar(), 442, 32, 80);
    put('fence', csGardenFence(), 70, 110, 134);
    put('rack', csRack(), 72, 134, 160);
    put('dummy', csDummy(), 124, 126, 160);
    put('stable', csStable(), 64, 184, 224);
    put('forge', csForge(), CS_FORGE[0], CS_FORGE[1], CS_FORGE[1] + 38);
    put('anvil', csAnvil(), 348, 206, 222);
    put('barrels', csBarrels(), 394, 114, 140);
    put('cottageA', csCottage('#c9a14a'), 44, 258, 288); put('cottageB', csCottage('#a8523a'), 392, 258, 288);
    [8, 104, 348, 446].forEach((x, i) => put('tree' + i, csTree(), x, 256, 288));
    put('hay', csHay(), 150, 266, 280); put('well', csWell(), 322, 258, 286);
    CS_TORCHES.forEach(([x, y, post], i) => { if (post) put('post' + i, csTorchPost(), x - 5, y - 22, y); });
  },
  deskFx: { depth: 110.2, frames: [csDeskGlow(0), csDeskGlow(1), csDeskGlow(2)], at: (i) => [CS_SEATS[i % CS_SEATS.length] - 16, 108] },
  ambient: csAmbient,
};
function csDeskGlow(k) {
  return () => {
    const cv = mk(32, 26), c = cv.getContext('2d');
    c.globalAlpha = 0.25; ell(c, 16, 11, 14, 9, '#c77dff'); c.globalAlpha = 0.16; ell(c, 16, 11, 9, 6, '#ffffff'); c.globalAlpha = 1;
    [[8, 6], [22, 4], [14, 2], [25, 11], [6, 12]].forEach(([x, y], i) => { const d = k * 2; P(c, x, y - d + (i % 2), 1, 1, i % 2 ? '#fff1b0' : '#d9b3ff'); });
    return cv;
  };
}

return CASTLE;
})();


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

})();
