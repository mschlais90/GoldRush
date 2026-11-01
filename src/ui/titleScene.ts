// Title-screen art: a placer camp at dusk. The static scene (sky, hills, creek, sluice box, pans,
// camp) is painted once per size into an offscreen canvas; creek ripples, sluice water, the
// campfire, smoke and drifting gold dust animate on top of it each frame.
import { next, type RngState } from '../sim/rng';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

export interface Scene {
  w: number;
  h: number;
  /** size unit: 1 for a 900px-tall window */
  u: number;
  sun: Pt;
  creekTop: number;
  /** origin is the upstream top corner of the near wall; the box runs along +x, tilted down by `a` */
  sluice: { x: number; y: number; a: number; len: number; side: number; depth: number; hopper: number };
  flume: { from: Pt; to: Pt };
  fire: Pt;
  tent: Pt;
}

interface Ridge {
  base: number;
  amp: number;
  freq: number;
  seed: number;
}
const FAR: Ridge = { base: 0.665, amp: 0.06, freq: 5, seed: 1.2 };
const MID: Ridge = { base: 0.725, amp: 0.04, freq: 3.3, seed: 2.6 };
const NEAR: Ridge = { base: 0.79, amp: 0.026, freq: 2.2, seed: 4.1 };
const RIM = '255,190,120';

function ridgeY(r: Ridge, x: number, w: number, h: number) {
  const t = x / w;
  const { freq: f, seed: sd } = r;
  const n = 0.55 * Math.sin(t * f + sd) + 0.3 * Math.sin(t * f * 2.3 + sd * 1.7) + 0.15 * Math.sin(t * f * 5.1 + sd * 0.3) + 0.06 * Math.sin(t * f * 13 + sd * 2.1);
  return h * r.base - h * r.amp * n;
}

/** Creek centre and half-width at screen row y; it widens toward the viewer. t is 0 at its source, 1 at the bottom. */
function creekAt(s: Pick<Scene, 'w' | 'h' | 'u' | 'creekTop'>, y: number) {
  const t = Math.min(1, Math.max(0, (y - s.creekTop) / (s.h - s.creekTop)));
  // meanders swing wider as they come closer
  return { x: s.w * (0.58 - 0.06 * t) + 75 * s.u * t ** 0.8 * Math.sin(t * 7 + 0.5), hw: 2 * s.u + 140 * s.u * t ** 1.6, t };
}

/** Stable pseudo-random in [0,1) per index, for animated particles that need no stored state. */
function rnd(i: number) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function layoutScene(w: number, h: number): Scene {
  const u = Math.min(h / 900, w / 1400);
  const base = { w, h, u, creekTop: ridgeY(NEAR, w * 0.585, w, h) + 1 };
  const len = 330 * u;
  const a = 0.16;
  const oy = h * 0.905;
  const c = creekAt(base, oy);
  // downstream end overhangs the near bank so the tailings spill into the creek
  const ox = c.x - c.hw + 6 * u;
  const x = ox - len * Math.cos(a);
  const y = oy - len * Math.sin(a);
  const fire: Pt = [w * 0.79, h * 0.9];
  return {
    ...base,
    sun: [w * 0.66, h * 0.665],
    sluice: { x, y, a, len, side: 32 * u, depth: 13 * u, hopper: 70 * u },
    flume: { from: [-20, y - 92 * u], to: [x + 16 * u, y - 60 * u] },
    fire,
    tent: [fire[0] + 72 * u, fire[1] - 14 * u],
  };
}

export function paintScene(cv: HTMLCanvasElement, s: Scene, dpr: number) {
  const { w, h, u } = s;
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const ctx = cv.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const st: RngState = { s: 1849 };
  const rand = () => next(st);

  paintSky(ctx, s, rand);
  paintRidge(ctx, s, FAR, ['#7a4228', '#4a2a1c'], 0.55);
  haze(ctx, s, 0.3);
  paintRidge(ctx, s, MID, ['#3e2519', '#26170f'], 0.4);
  for (let i = 0; i < 90; i++) {
    const x = rand() * w;
    pine(ctx, x, ridgeY(MID, x, w, h) + 5 * u, (9 + rand() * 18) * u, '#2a1910', rand);
  }
  haze(ctx, s, 0.12);
  paintRidge(ctx, s, NEAR, ['#5e3c24', '#140d08'], 0.35);
  groundMottle(ctx, s, rand);
  paintCreek(ctx, s, rand);
  pebbles(ctx, s, rand);

  const x0 = s.sluice.x;
  paintCamp(ctx, s, rand);
  paintFlume(ctx, s, rand);
  gravelPile(ctx, s, x0 - 62 * u, h * 0.955, rand);
  bucket(ctx, x0 - 150 * u, h * 0.968, u);
  paintSluice(ctx, s, rand);

  // right bank: a rock with a pan and pick leaned against it, and a working pan full of concentrate
  const cr = creekAt(s, h * 0.93);
  const bank = cr.x + cr.hw;
  const rx = Math.max(bank + 70 * u, w * 0.66);
  rock(ctx, rx + 30 * u, h * 0.925, 64 * u, 46 * u, rand);
  pick(ctx, rx + 70 * u, h * 0.93, u);
  pan(ctx, rx - 4 * u, h * 0.93 - 24 * u, 30 * u, 0.8, -0.18, false, u, rand);
  rock(ctx, bank + 18 * u, h * 0.975, 22 * u, 13 * u, rand);
  pan(ctx, rx - 76 * u, h * 0.965, 46 * u, 0.32, 0, true, u, rand);

  // framing pines
  pine(ctx, w * 0.035, h * 1.03, h * 0.52, '#0d0805', rand, 0.3);
  pine(ctx, w * 0.09, h * 1.0, h * 0.3, '#100a06', rand, 0.3);
  pine(ctx, w * 0.968, h * 1.03, h * 0.48, '#0d0805', rand, 0.3);
  pine(ctx, w * 0.925, h * 0.985, h * 0.26, '#100a06', rand, 0.3);

  // grass along the banks and the foreground
  for (let i = 0; i < 70; i++) {
    const y = s.creekTop + (h - s.creekTop) * Math.sqrt(rand());
    const c = creekAt(s, y);
    const side = rand() < 0.5 ? -1 : 1;
    tuft(ctx, c.x + side * (c.hw + (2 + rand() * 10) * u * (0.3 + c.t)), y, (4 + 14 * c.t) * u, rand);
  }
  for (let i = 0; i < 60; i++) tuft(ctx, rand() * w, h * (0.975 + rand() * 0.03), (12 + rand() * 16) * u, rand);

  // vignette keeps the eye on the title
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.max(w, h) * 0.3, w / 2, h * 0.45, Math.max(w, h) * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// ---------- landscape ----------

function paintSky(ctx: Ctx, s: Scene, rand: () => number) {
  const { w, h, u } = s;
  const g = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  g.addColorStop(0, '#070a14');
  g.addColorStop(0.3, '#161626');
  g.addColorStop(0.55, '#3d2630');
  g.addColorStop(0.72, '#8a4424');
  g.addColorStop(0.86, '#d9772e');
  g.addColorStop(1, '#f0a050');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 90; i++) {
    const y = rand() ** 2 * h * 0.42;
    ctx.fillStyle = `rgba(255,240,220,${(1 - y / (h * 0.42)) * 0.7 * rand()})`;
    ctx.beginPath();
    ctx.arc(rand() * w, y, 0.4 + rand() * 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const [sx, sy] = s.sun;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.6);
  glow.addColorStop(0, 'rgba(255,225,150,0.95)');
  glow.addColorStop(0.06, 'rgba(255,180,80,0.7)');
  glow.addColorStop(0.25, 'rgba(230,110,40,0.28)');
  glow.addColorStop(0.6, 'rgba(150,60,30,0.08)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  const disc = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30 * u);
  disc.addColorStop(0, '#fff7dc');
  disc.addColorStop(0.7, '#ffd98a');
  disc.addColorStop(1, 'rgba(255,200,110,0)');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sx, sy, 30 * u, 0, Math.PI * 2);
  ctx.fill();

  // long, low streaks of cloud lit from beneath
  ctx.save();
  ctx.filter = `blur(${Math.max(1, Math.round(4 * u))}px)`;
  for (let i = 0; i < 8; i++) {
    const cy = h * (0.3 + rand() * 0.3);
    const cw = (180 + rand() * 340) * u;
    const ch = (4 + rand() * 9) * u;
    const cx = rand() * w;
    const near = Math.max(0, 1 - Math.abs(cx - sx) / (w * 0.5));
    const cg = ctx.createLinearGradient(0, cy - ch, 0, cy + ch);
    cg.addColorStop(0, 'rgba(60,40,60,0.35)');
    cg.addColorStop(1, `rgba(255,${Math.round(150 + 50 * near)},90,${0.2 + 0.5 * near * (cy / (h * 0.6))})`);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw / 2, ch, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function ridgePath(ctx: Ctx, s: Scene, r: Ridge) {
  ctx.beginPath();
  for (let x = 0; x <= s.w + 6; x += 6) ctx.lineTo(x, ridgeY(r, x, s.w, s.h));
}

function paintRidge(ctx: Ctx, s: Scene, r: Ridge, colors: [string, string], rim: number) {
  const { w, h, u } = s;
  ridgePath(ctx, s, r);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, h * (r.base - r.amp), 0, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fill();
  // sunlit rim along the crest, strongest nearest the sun
  ridgePath(ctx, s, r);
  const sx = s.sun[0] / w;
  const rg = ctx.createLinearGradient(0, 0, w, 0);
  rg.addColorStop(0, `rgba(${RIM},0)`);
  rg.addColorStop(Math.max(0, sx - 0.32), `rgba(${RIM},0)`);
  rg.addColorStop(sx, `rgba(${RIM},${rim})`);
  rg.addColorStop(Math.min(1, sx + 0.32), `rgba(${RIM},0)`);
  ctx.strokeStyle = rg;
  ctx.lineWidth = 1.5 * u + 0.5;
  ctx.stroke();
}

/** Aerial perspective: wash the distance with sunset light. */
function haze(ctx: Ctx, s: Scene, a: number) {
  const [sx, sy] = s.sun;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.w * 0.6);
  g.addColorStop(0, `rgba(255,160,80,${a})`);
  g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.w, s.h);
  ctx.restore();
}

function groundMottle(ctx: Ctx, s: Scene, rand: () => number) {
  const { w, h, u } = s;
  ctx.save();
  ctx.filter = `blur(${Math.max(1, Math.round(10 * u))}px)`;
  for (let i = 0; i < 70; i++) {
    const y = h * (0.82 + rand() * 0.2);
    const r = (30 + rand() * 90) * u;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(110,75,45,0.18)' : 'rgba(8,5,3,0.25)';
    ctx.beginPath();
    ctx.ellipse(rand() * w, y, r, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A spruce: ragged, drooping branch tips down each side of a narrow crown. */
function pine(ctx: Ctx, x: number, base: number, ht: number, color: string, rand: () => number, rim = 0) {
  const n = Math.max(7, Math.round(ht / 9));
  const top = base - ht;
  const trunkTop = base - ht * 0.1;
  const side = (dir: number) => {
    const pts: Pt[] = [[x, top]];
    for (let i = 1; i <= n; i++) {
      const f = i / n;
      const y = top + (trunkTop - top) * f;
      const reach = ht * 0.21 * f ** 0.9 * (0.75 + rand() * 0.45);
      const droop = (ht / n) * (0.5 + rand() * 0.6);
      // tuck in toward the trunk, then out to a drooping branch tip
      pts.push([x + dir * reach * (0.3 + rand() * 0.15), y - (ht / n) * 0.2]);
      pts.push([x + dir * reach, y + droop]);
    }
    pts.push([x + dir * ht * 0.02, trunkTop]);
    return pts;
  };
  const right = side(1);
  const left = side(-1);
  ctx.fillStyle = color;
  ctx.fillRect(x - ht * 0.014, trunkTop - ht * 0.05, ht * 0.028, base - trunkTop + ht * 0.05);
  ctx.beginPath();
  for (const p of right) ctx.lineTo(p[0], p[1]);
  for (let i = left.length - 1; i >= 0; i--) ctx.lineTo(left[i][0], left[i][1]);
  ctx.closePath();
  ctx.fill();
  if (rim) {
    // needles on the sun side pick up light
    ctx.beginPath();
    for (let i = 1; i + 1 < right.length; i += 2) {
      ctx.moveTo(...right[i]);
      ctx.lineTo(...right[i + 1]);
    }
    ctx.strokeStyle = `rgba(${RIM},${rim})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function creekBanks(s: Scene, widen: number) {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let y = s.creekTop; y <= s.h + 4; y += 3) {
    const c = creekAt(s, y);
    const hw = c.hw * widen + (widen > 1 ? 6 * s.u * c.t : 0);
    const wob = Math.sin(y * 0.07) * 3 * s.u * c.t;
    left.push([c.x - hw + wob, y]);
    right.push([c.x + hw + Math.sin(y * 0.05 + 2) * 3 * s.u * c.t, y]);
  }
  return { left, right };
}

function polyFill(ctx: Ctx, left: Pt[], right: Pt[]) {
  ctx.beginPath();
  for (const p of left) ctx.lineTo(p[0], p[1]);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
}

function paintCreek(ctx: Ctx, s: Scene, rand: () => number) {
  const { h, u } = s;
  // soft gravel bars, then the wet margin, then water
  ctx.save();
  ctx.filter = `blur(${Math.max(1, Math.round(5 * u))}px)`;
  const bars = creekBanks(s, 1.3);
  polyFill(ctx, bars.left, bars.right);
  const bg = ctx.createLinearGradient(0, s.creekTop, 0, h);
  bg.addColorStop(0, 'rgba(150,100,60,0.35)');
  bg.addColorStop(1, 'rgba(70,50,36,0.55)');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.restore();
  const wet = creekBanks(s, 1.08);
  polyFill(ctx, wet.left, wet.right);
  ctx.fillStyle = 'rgba(24,16,11,0.85)';
  ctx.fill();

  const water = creekBanks(s, 1);
  polyFill(ctx, water.left, water.right);
  const wg = ctx.createLinearGradient(0, s.creekTop, 0, h);
  wg.addColorStop(0, '#ffd488');
  wg.addColorStop(0.15, '#e48a3c');
  wg.addColorStop(0.5, '#7a4030');
  wg.addColorStop(1, '#262030');
  ctx.fillStyle = wg;
  ctx.fill();
  // soft reflection of the bright sky down the middle of the channel
  ctx.save();
  ctx.clip();
  ctx.filter = `blur(${Math.max(1, Math.round(8 * u))}px)`;
  for (let y = s.creekTop; y < h; y += 6) {
    const c = creekAt(s, y);
    ctx.fillStyle = `rgba(255,190,120,${0.18 * (1 - c.t)})`;
    ctx.fillRect(c.x - c.hw * 0.4, y, c.hw * 0.8, 6);
  }
  ctx.restore();
  // foam lines where water meets the bank
  for (const side of [water.left, water.right]) {
    ctx.beginPath();
    for (const p of side) ctx.lineTo(p[0] + (rand() - 0.5) * 0.6, p[1]);
    ctx.strokeStyle = 'rgba(255,225,180,0.3)';
    ctx.lineWidth = 1 * u;
    ctx.stroke();
  }
}

function pebbles(ctx: Ctx, s: Scene, rand: () => number) {
  const { w, h, u } = s;
  for (let i = 0; i < 1500; i++) {
    const x = rand() * w;
    const top = ridgeY(NEAR, x, w, h) + 3;
    const p = Math.sqrt(rand());
    const y = top + (h - top) * p;
    const c = creekAt(s, y);
    if (Math.abs(x - c.x) < c.hw * 1.02) continue;
    const r = (0.4 + rand() * 1.6) * u * (0.4 + 2.4 * p);
    ctx.fillStyle = rand() < 0.5 ? '#1a110b' : '#2e2016';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,150,80,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.2, y - r * 0.3, r * 0.5, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tuft(ctx: Ctx, x: number, y: number, ht: number, rand: () => number) {
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const lean = (rand() - 0.5) * ht * 0.9;
    const hh = ht * (0.5 + rand() * 0.5);
    ctx.strokeStyle = rand() < 0.3 ? 'rgba(220,150,80,0.5)' : '#1a1209';
    ctx.lineWidth = Math.max(0.6, ht * 0.045);
    ctx.beginPath();
    const bx = x + (rand() - 0.5) * ht * 0.3;
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx + lean * 0.2, y - hh * 0.6, bx + lean, y - hh);
    ctx.stroke();
  }
}

function rock(ctx: Ctx, x: number, y: number, rx: number, ry: number, rand: () => number) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx * 1.15, ry * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const k = 0.88 + rand() * 0.12;
    ctx.lineTo(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k);
  }
  ctx.quadraticCurveTo(x, y + ry * 0.12, x - rx * 0.85, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - rx, y - ry, x + rx * 0.3, y);
  g.addColorStop(0, '#8a6a52');
  g.addColorStop(0.45, '#4a3628');
  g.addColorStop(1, '#140e09');
  ctx.fillStyle = g;
  ctx.fill();
  const rg = ctx.createLinearGradient(0, y - ry, 0, y);
  rg.addColorStop(0, `rgba(${RIM},0.6)`);
  rg.addColorStop(0.5, `rgba(${RIM},0)`);
  ctx.strokeStyle = rg;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // a few cracks
  ctx.strokeStyle = 'rgba(10,6,4,0.5)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 2; i++) {
    const cx = x + (rand() - 0.5) * rx;
    ctx.beginPath();
    ctx.moveTo(cx, y - ry * (0.5 + rand() * 0.3));
    ctx.lineTo(cx + (rand() - 0.5) * rx * 0.3, y - ry * 0.2);
    ctx.stroke();
  }
}

// ---------- the claim ----------

/** Horizontal boards filling a rectangle, with grain, a knot or two, seams and nail heads. */
function boards(ctx: Ctx, x: number, y: number, bw: number, bh: number, n: number, rand: () => number) {
  const b = bh / n;
  for (let i = 0; i < n; i++) {
    const by = y + i * b;
    const g = ctx.createLinearGradient(0, by, 0, by + b);
    g.addColorStop(0, '#6a472b');
    g.addColorStop(1, '#36231a');
    ctx.fillStyle = g;
    ctx.fillRect(x, by, bw, b);
    ctx.fillStyle = `rgba(0,0,0,${rand() * 0.22})`;
    ctx.fillRect(x, by, bw, b);
    ctx.strokeStyle = 'rgba(20,12,6,0.35)';
    ctx.lineWidth = 0.6;
    for (let k = 0; k < 4; k++) {
      const gy = by + b * (0.2 + rand() * 0.6);
      const ph = rand() * 6;
      ctx.beginPath();
      for (let gx = x; gx <= x + bw; gx += 8) ctx.lineTo(gx, gy + Math.sin(gx * 0.04 + ph) * b * 0.07);
      ctx.stroke();
    }
    if (bw > 60 && rand() < 0.7) {
      ctx.fillStyle = 'rgba(25,15,8,0.65)';
      ctx.beginPath();
      ctx.ellipse(x + bw * (0.1 + rand() * 0.8), by + b * 0.5, b * 0.2, b * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#140c07';
    ctx.fillRect(x, by + b - 0.8, bw, 0.8);
    ctx.fillStyle = '#0d0805';
    for (const nx of [x + 3, x + bw - 3]) {
      ctx.beginPath();
      ctx.arc(nx, by + b * 0.5, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function paintSluice(ctx: Ctx, s: Scene, rand: () => number) {
  const { u, h } = s;
  const { x, y, a, len, side, depth, hopper } = s.sluice;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const W = (lx: number, ly: number): Pt => [x + lx * cos - ly * sin, y + lx * sin + ly * cos];
  const groundAt = (px: number) => h * (0.95 + (0.018 * (px - x)) / (len * cos));

  // trestle legs: far ones first, set higher because they stand farther back
  const legX = [hopper * 0.3, len * 0.45, len * 0.8];
  ctx.lineCap = 'butt';
  for (const far of [true, false]) {
    const off = far ? depth * 0.9 : 0;
    const feet: Pt[] = [];
    const tops: Pt[] = [];
    for (const lx of legX) {
      const [tx, ty] = W(lx, side * 0.6);
      const top: Pt = [tx + off * 0.3, ty - off];
      const foot: Pt = [top[0] - (far ? 1 : 3) * u, groundAt(tx) - off];
      tops.push(top);
      feet.push(foot);
      ctx.strokeStyle = far ? '#1c120b' : '#2f2014';
      ctx.lineWidth = (far ? 4 : 5.5) * u;
      ctx.beginPath();
      ctx.moveTo(...top);
      ctx.lineTo(...foot);
      ctx.stroke();
      if (!far) {
        ctx.strokeStyle = `rgba(${RIM},0.35)`;
        ctx.lineWidth = 1 * u;
        ctx.beginPath();
        ctx.moveTo(top[0] + 2.4 * u, top[1]);
        ctx.lineTo(foot[0] + 2.4 * u, foot[1]);
        ctx.stroke();
      }
    }
    // diagonal braces between legs
    ctx.strokeStyle = far ? '#1a110a' : '#2a1c12';
    ctx.lineWidth = (far ? 2.5 : 3.2) * u;
    for (let i = 0; i < legX.length - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(...tops[i]);
      ctx.lineTo(...feet[i + 1]);
      ctx.stroke();
    }
    // feet sit on flat stones
    for (const [fx, fy] of feet) {
      ctx.fillStyle = far ? '#1e150e' : '#2c2018';
      ctx.beginPath();
      ctx.ellipse(fx, fy, 6 * u, 2.2 * u, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // shadow on the ground beneath the box
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + len * cos * 0.55, groundAt(x + len * 0.55) - 2 * u, len * 0.5, 6 * u, a * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  // interior seen from slightly above: far wall's inner face, then the floor
  ctx.fillStyle = '#3b2819';
  ctx.fillRect(0, -depth, len, depth * 0.45);
  ctx.fillStyle = '#21160e';
  ctx.fillRect(0, -depth * 0.55, len, depth * 0.55);
  // riffle bars, with black sand and the odd flake of gold trapped behind each
  for (let rx = hopper; rx < len - 10 * u; rx += 19 * u) {
    const sk = depth * 0.22;
    ctx.fillStyle = '#0a0706';
    ctx.beginPath();
    ctx.ellipse(rx - 4 * u, -depth * 0.2, 4 * u, depth * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    if (rand() < 0.6) {
      ctx.fillStyle = '#ffd25a';
      ctx.beginPath();
      ctx.arc(rx - 2 * u - rand() * 5 * u, -depth * (0.1 + rand() * 0.25), 0.9 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#120b07';
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx + 3 * u, 0);
    ctx.lineTo(rx + 3 * u + sk, -depth * 0.55);
    ctx.lineTo(rx + sk, -depth * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${RIM},0.35)`;
    ctx.lineWidth = 0.8 * u;
    ctx.beginPath();
    ctx.moveTo(rx + 3 * u, 0);
    ctx.lineTo(rx + 3 * u + sk, -depth * 0.55);
    ctx.stroke();
  }
  // a sheet of water reflecting the sky
  ctx.fillStyle = 'rgba(255,170,90,0.16)';
  ctx.fillRect(hopper * 0.85, -depth * 0.6, len - hopper * 0.85, depth * 0.6);
  // far wall's top edge
  ctx.fillStyle = '#4e3522';
  ctx.fillRect(0, -depth - 2.5 * u, len, 2.5 * u);
  ctx.fillStyle = `rgba(${RIM},0.55)`;
  ctx.fillRect(0, -depth - 2.5 * u, len, 0.8 * u);

  // near wall, cleats, and the sunlit top edge
  boards(ctx, 0, 0, len, side, 2, rand);
  for (const cx of [len * 0.3, len * 0.62]) {
    ctx.fillStyle = '#26180e';
    ctx.fillRect(cx, -2 * u, 6 * u, side + 3 * u);
    ctx.fillStyle = `rgba(${RIM},0.35)`;
    ctx.fillRect(cx + 5 * u, -2 * u, 1 * u, side + 3 * u);
  }
  ctx.fillStyle = `rgba(${RIM},0.75)`;
  ctx.fillRect(0, 0, len, 1.3 * u);
  // end board at the outlet
  ctx.fillStyle = '#2a1b10';
  ctx.fillRect(len - 2 * u, -depth, 3 * u, side + depth);

  // head box at the upstream end, with a grizzly screen across the top to reject cobbles
  const hx0 = -hopper * 0.12;
  const hx1 = hopper * 0.85;
  const ht = hopper * 0.55;
  const back = depth * 1.15;
  ctx.fillStyle = '#1a110b';
  ctx.beginPath();
  ctx.moveTo(hx0, -ht);
  ctx.lineTo(hx1, -ht);
  ctx.lineTo(hx1 + back * 0.3, -ht - back);
  ctx.lineTo(hx0 + back * 0.3, -ht - back);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#7a5536';
  ctx.lineWidth = 1.4 * u;
  for (let i = 1; i < 8; i++) {
    const bx = hx0 + ((hx1 - hx0) * i) / 8;
    ctx.beginPath();
    ctx.moveTo(bx, -ht);
    ctx.lineTo(bx + back * 0.3, -ht - back);
    ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const cx = hx0 + (hx1 - hx0) * (0.15 + rand() * 0.7);
    const cy = -ht - back * (0.3 + rand() * 0.4);
    const r = (2.5 + rand() * 3) * u;
    ctx.fillStyle = '#4a3a30';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${RIM},0.4)`;
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.2, cy - r * 0.3, r * 0.5, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  boards(ctx, hx0, -ht, hx1 - hx0, ht + side, 3, rand);
  ctx.fillStyle = `rgba(${RIM},0.75)`;
  ctx.fillRect(hx0, -ht, hx1 - hx0, 1.3 * u);
  ctx.fillStyle = '#1e140c';
  ctx.fillRect(hx1 - 4 * u, -ht, 4 * u, ht + side);
  ctx.restore();
}

function paintFlume(ctx: Ctx, s: Scene, rand: () => number) {
  const { u, h } = s;
  const [fx0, fy0] = s.flume.from;
  const [fx1, fy1] = s.flume.to;
  const th = 11 * u;
  ctx.lineCap = 'butt';
  for (const f of [0.22, 0.52, 0.82]) {
    const px = fx0 + (fx1 - fx0) * f;
    const py = fy0 + (fy1 - fy0) * f + th;
    const gy = h * (0.935 + f * 0.012);
    ctx.strokeStyle = '#22170e';
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, gy);
    ctx.moveTo(px - 12 * u, gy);
    ctx.lineTo(px, py + (gy - py) * 0.35);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${RIM},0.3)`;
    ctx.lineWidth = 1 * u;
    ctx.beginPath();
    ctx.moveTo(px + 1.8 * u, py);
    ctx.lineTo(px + 1.8 * u, gy);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(fx0, fy0);
  ctx.rotate(Math.atan2(fy1 - fy0, fx1 - fx0));
  const L = Math.hypot(fx1 - fx0, fy1 - fy0);
  ctx.fillStyle = '#1c130c';
  ctx.fillRect(0, -th * 0.5, L, th * 0.5);
  ctx.fillStyle = 'rgba(255,170,90,0.22)';
  ctx.fillRect(0, -th * 0.35, L, th * 0.3);
  boards(ctx, 0, 0, L, th, 1, rand);
  ctx.fillStyle = `rgba(${RIM},0.7)`;
  ctx.fillRect(0, 0, L, 1.1 * u);
  ctx.restore();
}

function gravelPile(ctx: Ctx, s: Scene, x: number, y: number, rand: () => number) {
  const { u } = s;
  const pw = 120 * u;
  const ph = 42 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(x, y, pw * 0.58, ph * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - pw / 2, y);
  ctx.bezierCurveTo(x - pw * 0.3, y - ph * 0.6, x - pw * 0.15, y - ph, x, y - ph);
  ctx.bezierCurveTo(x + pw * 0.2, y - ph, x + pw * 0.3, y - ph * 0.5, x + pw / 2, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - pw * 0.3, y - ph, x + pw * 0.2, y);
  g.addColorStop(0, '#6e5038');
  g.addColorStop(1, '#1e150e');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 160; i++) {
    const px = x + (rand() - 0.5) * pw;
    const py = y - rand() * ph;
    const r = (0.8 + rand() * 2.4) * u;
    ctx.fillStyle = rand() < 0.5 ? '#2a1d14' : '#55402e';
    ctx.beginPath();
    ctx.ellipse(px, py, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(${RIM},0.25)`;
    ctx.beginPath();
    ctx.ellipse(px + r * 0.2, py - r * 0.3, r * 0.5, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // shovel driven into the pile
  const bx = x + 16 * u;
  const by = y - ph * 0.62;
  const tx = bx - 20 * u;
  const ty = by - 62 * u;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4a3020';
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${RIM},0.55)`;
  ctx.lineWidth = 0.9 * u;
  ctx.beginPath();
  ctx.moveTo(bx + 1.2 * u, by);
  ctx.lineTo(tx + 1.2 * u, ty);
  ctx.stroke();
  ctx.strokeStyle = '#3a2618';
  ctx.lineWidth = 2 * u;
  ctx.beginPath();
  ctx.ellipse(tx - 1.2 * u, ty - 4 * u, 5 * u, 4 * u, -0.33, 0, Math.PI * 2);
  ctx.stroke();
  const sg = ctx.createLinearGradient(bx - 8 * u, 0, bx + 8 * u, 0);
  sg.addColorStop(0, '#24211f');
  sg.addColorStop(0.7, '#6a625a');
  sg.addColorStop(1, '#2a2624');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.moveTo(bx - 8 * u, by + 6 * u);
  ctx.lineTo(bx + 8 * u, by + 6 * u);
  ctx.lineTo(bx + 5 * u, by - 6 * u);
  ctx.lineTo(bx - 3 * u, by - 6 * u);
  ctx.closePath();
  ctx.fill();
}

function bucket(ctx: Ctx, x: number, y: number, u: number) {
  const bw = 24 * u;
  const tw = 30 * u;
  const bh = 28 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x + 4 * u, y, tw * 0.6, 4 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - bw / 2, y);
  ctx.lineTo(x + bw / 2, y);
  ctx.lineTo(x + tw / 2, y - bh);
  ctx.lineTo(x - tw / 2, y - bh);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
  g.addColorStop(0, '#221c18');
  g.addColorStop(0.7, '#6a5c50');
  g.addColorStop(1, '#3a302a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#1c1612';
  ctx.lineWidth = 1.2 * u;
  for (const f of [0.25, 0.75]) {
    const half = (bw + (tw - bw) * f) / 2;
    ctx.beginPath();
    ctx.moveTo(x - half, y - bh * f);
    ctx.lineTo(x + half, y - bh * f);
    ctx.stroke();
  }
  ctx.fillStyle = '#14100c';
  ctx.beginPath();
  ctx.ellipse(x, y - bh, tw / 2, 4 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${RIM},0.7)`;
  ctx.lineWidth = 1 * u;
  ctx.stroke();
  ctx.strokeStyle = '#2a2420';
  ctx.beginPath();
  ctx.ellipse(x, y - bh, tw / 2, tw * 0.55, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
}

/**
 * A steel gold pan. `tilt` is how much of the inside faces us (low = lying flat, high = propped
 * up); `concentrate` adds a little water, a crescent of black sand and gold at its tail.
 */
function pan(ctx: Ctx, x: number, y: number, r: number, tilt: number, rot: number, concentrate: boolean, u: number, rand: () => number) {
  const ry = r * tilt;
  const depth = r * 0.27 * Math.sqrt(1 - tilt * tilt);
  const br = 0.62;
  const by = depth * 0.8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.1, y + depth + ry * 0.6 + 2 * u, r * 1.05, Math.max(ry * 0.4, r * 0.2), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  // outside of the near wall
  ctx.beginPath();
  ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI);
  ctx.ellipse(0, depth, r * br, ry * br, 0, Math.PI, 0, true);
  ctx.closePath();
  const og = ctx.createLinearGradient(-r, 0, r, 0);
  og.addColorStop(0, '#1a1816');
  og.addColorStop(0.6, '#4a4440');
  og.addColorStop(1, '#24201e');
  ctx.fillStyle = og;
  ctx.fill();
  // inside: lying flat, the far wall catches the sky; propped up, the upper wall is shaded by the
  // rim and light pools on the lower wall, which is what reads as a hollow rather than a dome
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  const ig = ctx.createLinearGradient(0, -ry, 0, ry);
  const inside = tilt > 0.5 ? ['#1e1a18', '#4e4640', '#b0927a'] : ['#a08670', '#4e4640', '#2a2522'];
  ig.addColorStop(0, inside[0]);
  ig.addColorStop(0.5, inside[1]);
  ig.addColorStop(1, inside[2]);
  ctx.fillStyle = ig;
  ctx.fillRect(-r, -ry, r * 2, ry * 2);
  // riffle rings pressed into the wall
  for (const k of [0.74, 0.82, 0.9]) {
    const cy = (by * (1 - k)) / (1 - br);
    ctx.strokeStyle = 'rgba(20,16,14,0.5)';
    ctx.lineWidth = 0.8 * u;
    ctx.beginPath();
    ctx.ellipse(0, cy, r * k, ry * k, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,205,150,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, cy + 1 * u, r * k, ry * k, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, by, r * br, ry * br, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4a423c';
  ctx.fill();
  if (concentrate) {
    ctx.clip();
    ctx.fillStyle = 'rgba(240,150,80,0.22)';
    ctx.fillRect(-r, by - ry, r * 2, ry * 2);
    ctx.fillStyle = '#141110';
    ctx.beginPath();
    ctx.ellipse(-r * 0.12, by + ry * br * 0.35, r * br * 0.62, ry * br * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 16; i++) {
      const t = rand();
      const gx = -r * 0.12 + (t - 0.5) * r * br;
      const gy = by + ry * br * (0.1 + 0.4 * (1 - Math.abs(t - 0.5) * 2) * rand());
      const gr = (0.5 + rand() * 1.2) * u;
      ctx.fillStyle = '#ffd04a';
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
      if (gr > 1.1 * u) {
        ctx.fillStyle = '#fff6c8';
        ctx.beginPath();
        ctx.arc(gx - gr * 0.3, gy - gr * 0.3, gr * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // dull sheen where the sunset reflects off the bottom
    const sg = ctx.createRadialGradient(-r * 0.2, by - ry * 0.3, 0, -r * 0.2, by - ry * 0.3, r * 0.5);
    sg.addColorStop(0, 'rgba(255,190,130,0.35)');
    sg.addColorStop(1, 'rgba(255,190,130,0)');
    ctx.fillStyle = sg;
    ctx.fill();
  }
  ctx.restore();
  // rolled rim
  const rg = ctx.createLinearGradient(0, -ry, 0, ry);
  rg.addColorStop(0, '#ffd2a0');
  rg.addColorStop(0.5, '#6a5e56');
  rg.addColorStop(1, '#1e1a18');
  ctx.strokeStyle = rg;
  ctx.lineWidth = 2.2 * u;
  ctx.beginPath();
  ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function pick(ctx: Ctx, x: number, y: number, u: number) {
  const hx = x + 24 * u;
  const hy = y - 64 * u;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3e2818';
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${RIM},0.5)`;
  ctx.lineWidth = 0.9 * u;
  ctx.beginPath();
  ctx.moveTo(x + 1.2 * u, y);
  ctx.lineTo(hx + 1.2 * u, hy);
  ctx.stroke();
  ctx.strokeStyle = '#2c2826';
  ctx.lineWidth = 3.2 * u;
  ctx.beginPath();
  ctx.moveTo(hx - 20 * u, hy + 4 * u);
  ctx.quadraticCurveTo(hx, hy - 7 * u, hx + 22 * u, hy + 8 * u);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${RIM},0.55)`;
  ctx.lineWidth = 0.9 * u;
  ctx.beginPath();
  ctx.moveTo(hx - 18 * u, hy + 2 * u);
  ctx.quadraticCurveTo(hx, hy - 8.5 * u, hx + 20 * u, hy + 5.5 * u);
  ctx.stroke();
}

function paintCamp(ctx: Ctx, s: Scene, rand: () => number) {
  const { u } = s;
  const [tx, ty] = s.tent;
  const tw = 104 * u;
  const th = 76 * u;
  const dx = 46 * u;
  const dy = -24 * u;
  // side of the tent, receding to the right
  ctx.beginPath();
  ctx.moveTo(tx, ty - th);
  ctx.lineTo(tx + dx, ty - th + dy);
  ctx.lineTo(tx + tw / 2 + dx, ty + dy);
  ctx.lineTo(tx + tw / 2, ty);
  ctx.closePath();
  ctx.fillStyle = '#2e241a';
  ctx.fill();
  // front, lit warm from within
  ctx.beginPath();
  ctx.moveTo(tx - tw / 2, ty);
  ctx.lineTo(tx, ty - th);
  ctx.lineTo(tx + tw / 2, ty);
  ctx.closePath();
  const fg = ctx.createLinearGradient(0, ty - th, 0, ty);
  fg.addColorStop(0, '#76604a');
  fg.addColorStop(1, '#3e3024');
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(20,14,8,0.35)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(tx, ty - th);
    ctx.lineTo(tx + (rand() - 0.5) * tw, ty);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(tx - tw * 0.17, ty);
  ctx.lineTo(tx, ty - th * 0.62);
  ctx.lineTo(tx + tw * 0.17, ty);
  ctx.closePath();
  const dg = ctx.createRadialGradient(tx, ty - th * 0.15, 0, tx, ty - th * 0.15, th * 0.55);
  dg.addColorStop(0, '#ffc070');
  dg.addColorStop(0.5, '#c0601c');
  dg.addColorStop(1, '#3a1c0c');
  ctx.fillStyle = dg;
  ctx.fill();
  // tied-back flap
  ctx.beginPath();
  ctx.moveTo(tx - tw * 0.17, ty);
  ctx.lineTo(tx, ty - th * 0.62);
  ctx.lineTo(tx - tw * 0.26, ty);
  ctx.closePath();
  ctx.fillStyle = '#8a7258';
  ctx.fill();
  ctx.strokeStyle = `rgba(${RIM},0.6)`;
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath();
  ctx.moveTo(tx - tw / 2, ty);
  ctx.lineTo(tx, ty - th);
  ctx.stroke();
  // ridge pole and guy lines
  ctx.strokeStyle = '#1c130b';
  ctx.lineWidth = 2.2 * u;
  ctx.beginPath();
  ctx.moveTo(tx - 3 * u, ty - th - 2 * u);
  ctx.lineTo(tx + dx + 3 * u, ty - th + dy - 1 * u);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(210,170,120,0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(tx, ty - th);
  ctx.lineTo(tx - tw * 0.85, ty + 3 * u);
  ctx.moveTo(tx + dx, ty - th + dy);
  ctx.lineTo(tx + tw * 0.75 + dx, ty + dy + 4 * u);
  ctx.stroke();
  // lamplight spilling onto the ground
  const gl = ctx.createRadialGradient(tx, ty + 4 * u, 0, tx, ty + 4 * u, 40 * u);
  gl.addColorStop(0, 'rgba(255,150,60,0.25)');
  gl.addColorStop(1, 'rgba(255,150,60,0)');
  ctx.fillStyle = gl;
  ctx.beginPath();
  ctx.ellipse(tx, ty + 4 * u, 40 * u, 10 * u, 0, 0, Math.PI * 2);
  ctx.fill();

  // fire ring, logs and a log to sit on
  const [fx, fy] = s.fire;
  ctx.fillStyle = '#2a1c12';
  ctx.fillRect(fx - 62 * u, fy + 2 * u, 40 * u, 9 * u);
  ctx.fillStyle = '#5a3e26';
  ctx.beginPath();
  ctx.ellipse(fx - 22 * u, fy + 6.5 * u, 2.5 * u, 4.5 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(${RIM},0.4)`;
  ctx.fillRect(fx - 62 * u, fy + 2 * u, 40 * u, 1 * u);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a0f08';
  ctx.lineWidth = 4 * u;
  ctx.beginPath();
  ctx.moveTo(fx - 14 * u, fy + 3 * u);
  ctx.lineTo(fx + 12 * u, fy - 3 * u);
  ctx.moveTo(fx - 12 * u, fy - 3 * u);
  ctx.lineTo(fx + 14 * u, fy + 3 * u);
  ctx.stroke();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = (3 + rand() * 2) * u;
    const sx = fx + Math.cos(a) * 20 * u;
    const sy = fy + Math.sin(a) * 6 * u;
    ctx.fillStyle = Math.sin(a) > 0 ? '#3a2a20' : '#2a1e16';
    ctx.beginPath();
    ctx.ellipse(sx, sy, r, r * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,140,60,0.4)';
    ctx.beginPath();
    ctx.ellipse(sx - Math.cos(a) * r * 0.3, sy - r * 0.3, r * 0.5, r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- animation ----------

export function animateScene(ctx: Ctx, s: Scene, t: number) {
  const { w, h, u } = s;
  ctx.lineCap = 'round';

  // ripples drifting down the creek
  for (let i = 0; i < 90; i++) {
    const p = (rnd(i) + t * (0.015 + 0.02 * rnd(i + 100))) % 1;
    const y = s.creekTop + (h - s.creekTop) * p ** 1.3;
    const c = creekAt(s, y);
    const x = c.x + (rnd(i + 200) * 2 - 1) * c.hw * 0.8;
    const len = (3 + 26 * c.t) * u;
    const a = Math.sin(p * Math.PI) * (0.15 + 0.3 * Math.abs(Math.sin(t * 2 + i)));
    ctx.strokeStyle = `rgba(255,${Math.round(220 - 40 * c.t)},${Math.round(170 - 30 * c.t)},${a})`;
    ctx.lineWidth = (0.6 + 1.4 * c.t) * u;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.quadraticCurveTo(x, y - 1.5 * u * c.t, x + len / 2, y);
    ctx.stroke();
  }

  // water racing down the sluice over the riffles
  const sl = s.sluice;
  ctx.save();
  ctx.translate(sl.x, sl.y);
  ctx.rotate(sl.a);
  const x0 = sl.hopper * 0.85;
  const run = sl.len - x0;
  ctx.lineWidth = 0.9 * u;
  for (let i = 0; i < 28; i++) {
    const fx = x0 + ((rnd(i + 300) * run + t * 70 * u) % run);
    const fy = -sl.depth * (0.08 + 0.45 * rnd(i + 400));
    ctx.strokeStyle = `rgba(255,220,170,${0.2 + 0.35 * Math.abs(Math.sin(t * 3 + i))})`;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(Math.min(sl.len - 2 * u, fx + (6 + 8 * rnd(i + 450)) * u), fy);
    ctx.stroke();
  }
  ctx.restore();

  // tailings pouring off the end of the sluice into the creek
  const cos = Math.cos(sl.a);
  const sin = Math.sin(sl.a);
  const ox = sl.x + sl.len * cos + sl.depth * 0.3 * sin;
  const oy = sl.y + sl.len * sin - sl.depth * 0.3 * cos;
  pour(ctx, [ox, oy], [ox + 16 * u, oy + sl.side + 16 * u], t, u, 1);
  // and the flume spilling into the head box
  const [ex, ey] = s.flume.to;
  pour(ctx, [ex, ey - 4 * u], [ex + 8 * u, ey + 20 * u], t, u, 0.7);

  // campfire
  const [fx, fy] = s.fire;
  const fl = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3 + 1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(fx, fy - 8 * u, 0, fx, fy - 8 * u, 140 * u * fl);
  glow.addColorStop(0, 'rgba(255,150,60,0.32)');
  glow.addColorStop(0.4, 'rgba(200,80,20,0.1)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(fx - 150 * u, fy - 150 * u, 300 * u, 300 * u);
  const [tx, ty] = s.tent;
  const door = ctx.createRadialGradient(tx, ty - 14 * u, 0, tx, ty - 14 * u, 30 * u);
  door.addColorStop(0, `rgba(255,170,80,${0.12 + 0.08 * fl})`);
  door.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = door;
  ctx.fillRect(tx - 30 * u, ty - 44 * u, 60 * u, 60 * u);
  ctx.restore();
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 4.5 * u;
    const fh = (18 + 12 * Math.sin(t * (7 + i) + i * 2) ** 2 + 6 * rnd(i + 50)) * u * (1 - Math.abs(i - 2) * 0.18);
    const sway = Math.sin(t * 6 + i) * 3 * u;
    const fw = 6 * u;
    const bx = fx + off;
    const g = ctx.createLinearGradient(0, fy, 0, fy - fh);
    g.addColorStop(0, '#fff2b0');
    g.addColorStop(0.35, '#ffb040');
    g.addColorStop(0.75, 'rgba(230,80,20,0.85)');
    g.addColorStop(1, 'rgba(160,40,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx - fw, fy);
    ctx.quadraticCurveTo(bx - fw * 0.8, fy - fh * 0.5, bx + sway, fy - fh);
    ctx.quadraticCurveTo(bx + fw * 0.8, fy - fh * 0.5, bx + fw, fy);
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < 14; i++) {
    const p = (rnd(i + 500) + t * 0.35) % 1;
    const ex2 = fx + (rnd(i + 600) - 0.5) * 20 * u + Math.sin(t * 2 + i) * 8 * u * p;
    const ey2 = fy - 12 * u - p * 120 * u;
    ctx.fillStyle = `rgba(255,${Math.round(180 - 80 * p)},80,${1 - p})`;
    ctx.beginPath();
    ctx.arc(ex2, ey2, (0.6 + rnd(i + 650)) * u, 0, Math.PI * 2);
    ctx.fill();
  }
  // smoke curling up and drifting downwind
  for (let i = 0; i < 16; i++) {
    const p = (rnd(i + 700) + t * 0.05) % 1;
    const sx = fx + Math.sin(p * 5 + t * 0.6 + i) * 10 * u * p + p * 70 * u;
    const sy = fy - 26 * u - p * 230 * u;
    const r = (6 + 30 * p) * u;
    ctx.fillStyle = `rgba(80,68,66,${0.12 * (1 - p) * Math.min(1, p * 6)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // gold dust drifting up through the scene
  for (let i = 0; i < 70; i++) {
    const v = 0.008 + 0.02 * rnd(i + 1000);
    const y = ((((rnd(i + 900) - t * v) % 1) + 1) % 1) * h;
    const x = (rnd(i + 800) + 0.02 * Math.sin(t * 0.5 + i)) * w;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
    ctx.fillStyle = `rgba(255,${200 + Math.round(40 * tw)},120,${0.5 * tw})`;
    ctx.beginPath();
    ctx.arc(x, y, (0.4 + 1.4 * rnd(i + 1100)) * u + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A falling stream of water from `a` to `b`, with dashes scrolling to suggest flow and a splash where it lands. */
function pour(ctx: Ctx, a: Pt, b: Pt, t: number, u: number, k: number) {
  const cx = a[0] + (b[0] - a[0]) * 0.85;
  const cy = a[1];
  ctx.strokeStyle = 'rgba(255,190,130,0.18)';
  ctx.lineWidth = 7 * u * k;
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.quadraticCurveTo(cx, cy, b[0], b[1]);
  ctx.stroke();
  ctx.save();
  ctx.setLineDash([3 * u, 7 * u]);
  ctx.lineDashOffset = -t * 80 * u;
  for (const [dx, lw, al] of [
    [0, 1.4, 0.4],
    [-2, 1, 0.3],
    [2, 0.8, 0.3],
  ]) {
    ctx.strokeStyle = `rgba(255,215,165,${al})`;
    ctx.lineWidth = lw * u * k;
    ctx.beginPath();
    ctx.moveTo(a[0] + dx * u * k, a[1]);
    ctx.quadraticCurveTo(cx + dx * u * k, cy, b[0] + dx * u * k, b[1]);
    ctx.stroke();
  }
  ctx.restore();
  // churned water where it lands
  ctx.strokeStyle = 'rgba(255,225,185,0.3)';
  ctx.lineWidth = 0.8 * u;
  for (let i = 0; i < 3; i++) {
    const p = (t * 1.2 + i / 3) % 1;
    ctx.globalAlpha = 1 - p;
    ctx.beginPath();
    ctx.ellipse(b[0], b[1], (3 + 12 * p) * u * k, (1 + 3 * p) * u * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 5; i++) {
    const ph = t * 9 + i * 1.7;
    ctx.fillStyle = `rgba(255,230,190,${0.15 + 0.2 * Math.abs(Math.sin(ph * 0.7))})`;
    ctx.beginPath();
    ctx.arc(b[0] + Math.sin(i * 2.3) * 6 * u * k, b[1] - Math.abs(Math.sin(ph)) * 3 * u * k, 0.9 * u * k, 0, Math.PI * 2);
    ctx.fill();
  }
}
