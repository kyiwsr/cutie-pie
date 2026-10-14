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
