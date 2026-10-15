// Seed -> hidden 3D gold deposit. Deterministic: same (seed, region) => same world.
import { Rng, mixSeed } from '../rng';
import { fbm, makeNoise3, type Noise3 } from '../noise';
import { REGIONS } from '../regions';
import {
  type Archetype,
  CELL_M,
  Clue,
  GRID_D,
  GRID_H,
  GRID_W,
  LAYER_M,
  type RegionId,
  Rock,
  type WorldTruth,
  ci,
  cx,
  cy,
  inBounds,
  vi,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Ctx {
  rng: Rng;
  noise: Noise3;
  t: WorldTruth;
}

export function generateWorld(seed: number, regionId: RegionId): WorldTruth {
  const region = REGIONS[regionId];
  const rng = Rng.fromSeed(mixSeed(seed, 0xa11));
  const noise = makeNoise3(mixSeed(seed, 0xb22));
  const nCols = GRID_W * GRID_H;
  const t: WorldTruth = {
    grade: new Float32Array(nCols * GRID_D),
    rock: new Uint8Array(nCols * GRID_D),
    overburden: new Uint8Array(nCols),
    waterTable: new Uint8Array(nCols),
    stream: new Uint8Array(nCols),
    streamPath: [],
    clue: new Uint8Array(nCols),
    chargeability: new Float32Array(nCols),
    terrain: new Float32Array(nCols),
    deposits: [],
  };
  const ctx: Ctx = { rng, noise, t };

  // --- Surface & overburden -------------------------------------------------
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = ci(x, y);
      t.terrain[c] = clamp(0.5 + 0.9 * fbm(noise, x / 14, y / 14, 0.3), 0, 1);
      t.overburden[c] = clamp(Math.round(1.4 + 3 * fbm(noise, x / 9, y / 9, 5.7)), 0, 5);
      t.waterTable[c] = clamp(Math.round(5 + 6 * fbm(noise, x / 12, y / 12, 9.1)), 2, 9);
    }
  }

  const hasStream = rng.chance(region.streamChance);
  if (hasStream) {
    t.streamPath = meanderPath(ctx, 0);
    for (const c of t.streamPath) {
      t.stream[c] = 1;
      t.waterTable[c] = 1;
      carveGravel(ctx, c, 2 + rng.int(0, 2));
    }
  }

  const archetypes = pickDeposits(rng, region.archetypeWeights);
  const dud = rng.chance(0.15);
  const strength = dud ? 0.25 : 1;

  let paleo: number[] = [];
  if (archetypes.includes('placer') && (!hasStream || rng.chance(0.4))) {
    paleo = meanderPath(ctx, 77);
    for (const c of paleo) carveGravel(ctx, c, 3 + rng.int(0, 1));
  }

  // --- Base rock and background grade ---------------------------------------
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const ob = t.overburden[ci(x, y)];
      for (let z = 0; z < GRID_D; z++) {
        const i = vi(x, y, z);
        if (z < ob) {
          t.rock[i] = Rock.Overburden;
          t.grade[i] = 0.004 * rng.lognormal(0, 0.5);
        } else {
          t.rock[i] = Rock.Bedrock;
          t.grade[i] = 0.015 * rng.lognormal(0, 0.6);
        }
      }
    }
  }

  // --- Deposits -------------------------------------------------------------
  for (const a of archetypes) {
    let label = '';
    switch (a) {
      case 'placer':
        label = addPlacer(ctx, hasStream ? [t.streamPath, paleo] : [paleo], strength);
        break;
      case 'vein':
        label = addVeins(ctx, strength);
        break;
      case 'porphyry':
        label = addPorphyry(ctx, strength);
        break;
      case 'pocket':
        label = addPockets(ctx, strength);
        break;
    }
    t.deposits.push({ archetype: a, label: dud ? `${label} (weak)` : label });
  }

  addOldWorkings(ctx);
  computeClues(ctx);
  computeChargeability(ctx);
  return t;
}

function pickDeposits(rng: Rng, weights: Record<Archetype, number>): Archetype[] {
  const pick = (exclude: Archetype[]): Archetype | null => {
    const entries = (Object.entries(weights) as [Archetype, number][]).filter(
      ([k, w]) => w > 0 && !exclude.includes(k),
    );
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return null;
    let r = rng.float() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return entries[entries.length - 1][0];
  };
  const first = pick([])!;
  const out: Archetype[] = [first];
  if (rng.chance(0.45)) {
    const second = pick(out);
    if (second) out.push(second);
  }
  return out;
}

/** Meandering channel crossing the property edge to edge. */
function meanderPath(ctx: Ctx, salt: number): number[] {
  const { rng, noise } = ctx;
  const vertical = rng.chance(0.5);
  let x = rng.range(8, GRID_W - 8);
  let y = 0;
  if (!vertical) [x, y] = [0, x];
  const base = vertical ? Math.PI / 2 : 0;
  const path: number[] = [];
  const seen = new Set<number>();
  const push = (px: number, py: number) => {
    const ix = Math.round(px);
    const iy = Math.round(py);
    if (!inBounds(ix, iy)) return;
    const c = ci(ix, iy);
    if (!seen.has(c)) {
      seen.add(c);
      path.push(c);
    }
  };
  for (let step = 0; step < 400; step++) {
    push(x, y);
    const a = base + 1.1 * noise(step * 0.07, salt + 3.3, 1.7);
    const nx = x + Math.cos(a) * 0.5;
    const ny = y + Math.sin(a) * 0.5;
    x = nx;
    y = ny;
    if (!inBounds(Math.round(x), Math.round(y))) break;
  }
  return path;
}

function carveGravel(ctx: Ctx, c: number, depth: number) {
  const { t } = ctx;
  const x0 = cx(c);
  const y0 = cy(c);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!inBounds(x0 + dx, y0 + dy)) continue;
      const cc = ci(x0 + dx, y0 + dy);
      const d = dx === 0 && dy === 0 ? depth : depth - 1;
      t.overburden[cc] = Math.max(t.overburden[cc], d);
    }
  }
}

function addPlacer(ctx: Ctx, channels: number[][], strength: number): string {
  const { rng, noise, t } = ctx;
  const P = rng.range(0.8, 3.0) * strength;
  for (const path of channels) {
    path.forEach((c, idx) => {
      const shoot = clamp(fbm(noise, idx / 9, 4.2, 0.5) * 2 + 0.45, 0, 1.6);
      const x0 = cx(c);
      const y0 = cy(c);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (!inBounds(x, y)) continue;
          const fall = dx === 0 && dy === 0 ? 1 : 0.45;
          const ob = t.overburden[ci(x, y)];
          if (ob === 0) continue;
          const zPay = ob - 1; // pay gravel sits right on bedrock
          const g = P * shoot * fall * rng.lognormal(0, 0.45);
          const i = vi(x, y, zPay);
          if (g > t.grade[i]) {
            t.grade[i] = g;
            if (g > 0.15) t.rock[i] = Rock.Paystreak;
          }
          if (ob >= 2) {
            const j = vi(x, y, ob - 2);
            t.grade[j] = Math.max(t.grade[j], g * 0.2);
          }
          if (ob < GRID_D) {
            const k = vi(x, y, ob); // fractured bedrock surface
            t.grade[k] = Math.max(t.grade[k], g * 0.3);
          }
        }
      }
    });
  }
  return 'Placer pay gravels';
}

function addVeins(ctx: Ctx, strength: number): string {
  const { rng, noise, t } = ctx;
  const count = rng.chance(0.35) ? 2 : 1;
  const theta = rng.range(0, Math.PI);
  const cx0 = rng.range(10, 30) * CELL_M;
  const cy0 = rng.range(10, 30) * CELL_M;
  for (let v = 0; v < count; v++) {
    const dip = (rng.range(55, 88) * Math.PI) / 180;
    const dipSign = rng.chance(0.5) ? 1 : -1;
    const T = rng.range(2, 9); // true thickness, m
    const B = rng.range(6, 16) * strength; // in-vein grade, g/t
    const L = rng.range(90, 220); // half strike length, m
    const offset = v * rng.range(40, 90);
    const sx = Math.cos(theta);
    const sy = Math.sin(theta);
    // horizontal dip direction (perpendicular to strike)
    const ddx = -sy * dipSign;
    const ddy = sx * dipSign;
    // down-dip vector (z positive downward)
    const ux = ddx * Math.cos(dip);
    const uy = ddy * Math.cos(dip);
    const uz = Math.sin(dip);
    // normal = s x u
    let nx = sy * uz - 0 * uy;
    let ny = 0 * ux - sx * uz;
    let nz = sx * uy - sy * ux;
    const nl = Math.hypot(nx, ny, nz);
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const ox = cx0 + ddx * offset;
    const oy = cy0 + ddy * offset;
    const bottom = rng.range(70, GRID_D * LAYER_M);
    const dilution = Math.min(1, T / CELL_M);
    const salt = v * 13.7;

    for (let z = 0; z < GRID_D; z++) {
      const pz = (z + 0.5) * LAYER_M;
      if (pz > bottom) break;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const px = (x + 0.5) * CELL_M - ox;
          const py = (y + 0.5) * CELL_M - oy;
          const d = Math.abs(px * nx + py * ny + pz * nz);
          if (d > CELL_M * 1.6) continue;
          const s = px * sx + py * sy;
          if (Math.abs(s) > L) continue;
          const i = vi(x, y, z);
          if (t.rock[i] === Rock.Overburden || t.rock[i] === Rock.Paystreak) continue;
          const taper = 1 - Math.pow(Math.abs(s) / L, 4);
          const shoot = clamp(fbm(noise, s / 70 + salt, pz / 45, 2.2) * 2.4 + 0.35, 0.03, 1.8);
          if (d <= Math.max(T / 2, CELL_M * 0.55)) {
            const g = B * dilution * shoot * taper * rng.lognormal(-0.3, 0.85);
            t.grade[i] = Math.max(t.grade[i], g);
            t.rock[i] = Rock.Quartz;
          } else {
            const g = 0.06 * B * shoot * taper * rng.lognormal(0, 0.5);
            t.grade[i] = Math.max(t.grade[i], g);
          }
        }
      }
    }
  }
  const deg = Math.round(((theta * 180) / Math.PI + 90) % 180);
  return count > 1 ? `Twin quartz veins (strike ${deg}°)` : `Quartz vein (strike ${deg}°)`;
}

function addPorphyry(ctx: Ctx, strength: number): string {
  const { rng, noise, t } = ctx;
  const ox = rng.range(12, 28) * CELL_M;
  const oy = rng.range(12, 28) * CELL_M;
  const oz = rng.range(35, 85);
  const rx = rng.range(70, 150);
  const ry = rng.range(60, 130);
  const rz = rng.range(30, 55);
  const rot = rng.range(0, Math.PI);
  const G = rng.range(0.9, 2.0) * strength;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let z = 0; z < GRID_D; z++) {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const px = (x + 0.5) * CELL_M - ox;
        const py = (y + 0.5) * CELL_M - oy;
        const pz = (z + 0.5) * LAYER_M - oz;
        const a = px * cr + py * sr;
        const b = -px * sr + py * cr;
        const r2 = (a / rx) ** 2 + (b / ry) ** 2 + (pz / rz) ** 2;
        if (r2 > 1.4) continue;
        const i = vi(x, y, z);
        if (t.rock[i] === Rock.Overburden || t.rock[i] === Rock.Paystreak) continue;
        if (r2 < 1) {
          const n = 0.65 + 0.9 * fbm(noise, x / 6, y / 6, z / 4 + 31);
          const g = G * Math.pow(1 - r2, 0.6) * Math.max(0.1, n) * rng.lognormal(0, 0.25);
          t.grade[i] = Math.max(t.grade[i], g);
        }
        if (t.rock[i] === Rock.Bedrock) t.rock[i] = Rock.Altered;
      }
    }
  }
  return 'Disseminated porphyry gold';
}

function addPockets(ctx: Ctx, strength: number): string {
  const { rng, t } = ctx;
  const count = rng.int(1, 3);
  for (let p = 0; p < count; p++) {
    const px = rng.range(3, GRID_W - 3);
    const py = rng.range(3, GRID_H - 3);
    const pz = rng.range(1, 16);
    const r = rng.range(0.7, 1.5);
    const G = rng.range(12, 50) * strength;
    for (let z = Math.max(0, Math.floor(pz - r * 2)); z <= Math.min(GRID_D - 1, Math.ceil(pz + r * 2)); z++) {
      for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
        for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
          if (!inBounds(x, y)) continue;
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py, (z + 0.5 - pz) * 0.5);
          if (d > r) continue;
          const i = vi(x, y, z);
          if (t.rock[i] === Rock.Overburden) continue;
          const g = G * (1 - d / (r + 0.3)) * rng.lognormal(0, 0.4);
          t.grade[i] = Math.max(t.grade[i], g);
          t.rock[i] = Rock.Quartz;
        }
      }
    }
    // thin stringer halo leading toward the pocket
    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    for (let z = 0; z < pz; z++) {
      const i = vi(x0, y0, z);
      if (t.rock[i] !== Rock.Overburden) t.grade[i] = Math.max(t.grade[i], 0.25 * rng.lognormal(0, 0.6));
    }
  }
  return count > 1 ? `Bonanza pockets (${count})` : 'Bonanza pocket';
}

function nearSurfaceGrade(t: WorldTruth, x: number, y: number, layers: number): number {
  let m = 0;
  for (let z = 0; z < layers; z++) m = Math.max(m, t.grade[vi(x, y, z)]);
  return m;
}

function addOldWorkings(ctx: Ctx) {
  const { rng, t } = ctx;
  const n = rng.int(0, 3);
  const rich: number[] = [];
  for (let c = 0; c < GRID_W * GRID_H; c++) {
    if (nearSurfaceGrade(t, cx(c), cy(c), 4) > 1.0) rich.push(c);
  }
  for (let k = 0; k < n; k++) {
    const c = rich.length && rng.chance(0.7) ? rng.pick(rich) : rng.int(0, GRID_W * GRID_H - 1);
    t.clue[c] = Clue.OldWorkings;
    // old-timers high-graded the top couple of layers
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx(c) + dx;
        const y = cy(c) + dy;
        if (!inBounds(x, y)) continue;
        for (let z = 0; z < 2; z++) t.grade[vi(x, y, z)] *= 0.15;
      }
    }
  }
}

function computeClues(ctx: Ctx) {
  const { rng, t } = ctx;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = ci(x, y);
      if (t.clue[c] === Clue.OldWorkings) continue;
      const ob = t.overburden[c];
      let clue = Clue.None;
      if (ob === 0) {
        clue = Clue.Outcrop;
        const top = vi(x, y, 0);
        if (t.rock[top] === Rock.Quartz) {
          clue = t.grade[top] > 4 && rng.chance(0.6) ? Clue.VisibleGold : Clue.QuartzOutcrop;
        } else if (rng.chance(0.05)) {
          clue = Clue.QuartzOutcrop; // barren quartz: a red herring
        }
      }
      if (clue <= Clue.Outcrop) {
        let altered = false;
        for (let z = ob; z < Math.min(GRID_D, ob + 5); z++) if (t.rock[vi(x, y, z)] === Rock.Altered) altered = true;
        if ((altered && rng.chance(0.45)) || rng.chance(0.003)) clue = Clue.Gossan;
        else if ((nearSurfaceGrade(t, x, y, 6) > 0.8 && rng.chance(0.22)) || rng.chance(0.006))
          clue = Clue.VegStress;
      }
      t.clue[c] = clue;
    }
  }
}

function computeChargeability(ctx: Ctx) {
  const { rng, t } = ctx;
  const blobs = Array.from({ length: rng.int(0, 2) }, () => ({
    x: rng.range(0, GRID_W),
    y: rng.range(0, GRID_H),
    r: rng.range(3, 6),
    a: rng.range(0.5, 1.2),
  }));
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      let s = 0;
      for (let z = 0; z < GRID_D; z++) {
        const r = t.rock[vi(x, y, z)];
        const f = r === Rock.Altered ? 1 : r === Rock.Quartz ? 0.6 : 0;
        s += f * Math.exp(-z / 9);
      }
      for (const b of blobs) {
        // graphitic schist: conductive but barren
        s += b.a * 3 * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r));
      }
      t.chargeability[ci(x, y)] = s;
    }
  }
}
