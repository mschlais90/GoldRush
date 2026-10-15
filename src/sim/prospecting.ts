// Prospecting tools: what each one costs, how long it takes, and what slice of
// the hidden truth it reveals (with noise) when it completes.
import { GRID_D, GRID_H, GRID_W, LAYER_M, ci, cx, cy, inBounds, vi, type WorldTruth } from './geology/types';
import type { Rng } from './rng';
import type { Knowledge } from './state';

export const COSTS = {
  walkover: { cost: 400, days: 1, radius: 6 },
  walkoverAll: { cost: 3_800, days: 8 },
  pan: { cost: 120, days: 1 },
  soil: { cost: 3_200, days: 3, labDays: 10, half: 6, spacing: 2 },
  geophys: { cost: 38_000, days: 12 },
  trench: { costPerCell: 1_400, cellsPerDay: 2, maxLen: 8, layers: 3, labDays: 10 },
  drill: { mobilize: 1_500, perLayer: 650, depthPremium: 0.07, layersPerDay: 4, labDays: 10, rushLabDays: 3, rushMult: 1.6 },
  permit: { cost: 12_000, bond: 25_000 },
  dueDiligence: { cost: 9_000, days: 7 },
};

export function drillCost(depth: number, rush: boolean): number {
  const d = COSTS.drill;
  let c = d.mobilize;
  for (let z = 0; z < depth; z++) c += d.perLayer * (1 + d.depthPremium * z);
  return Math.round(rush ? c * d.rushMult : c);
}

export function drillDays(depth: number): number {
  return Math.max(1, Math.ceil(depth / COSTS.drill.layersPerDay));
}

export function trenchCells(x0: number, y0: number, x1: number, y1: number): number[] {
  const cells: number[] = [];
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / Math.max(1, n));
    const y = Math.round(y0 + ((y1 - y0) * i) / Math.max(1, n));
    if (!inBounds(x, y)) continue;
    const c = ci(x, y);
    if (!cells.includes(c)) cells.push(c);
  }
  return cells.slice(0, COSTS.trench.maxLen);
}

export function revealWalkover(k: Knowledge, t: WorldTruth, x0: number, y0: number, r: number) {
  for (let y = y0 - r; y <= y0 + r; y++) {
    for (let x = x0 - r; x <= x0 + r; x++) {
      if (!inBounds(x, y)) continue;
      if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r + 1) k.clues[ci(x, y)] = t.clue[ci(x, y)];
    }
  }
}

/** Gold load carried by the stream at each path position (accumulates downstream). */
export function streamLoads(t: WorldTruth): Map<number, number> {
  const loads = new Map<number, number>();
  let load = 0;
  for (const c of t.streamPath) {
    let input = 0;
    const x0 = cx(c);
    const y0 = cy(c);
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (!inBounds(x, y)) continue;
        const ob = t.overburden[ci(x, y)];
        // erosion samples the shallowest bedrock + gravel
        for (let z = 0; z < Math.min(GRID_D, ob + 2); z++) input += t.grade[vi(x, y, z)] * (z < ob ? 0.6 : 0.25);
      }
    }
    load = load * 0.92 + input;
    loads.set(c, load);
  }
  return loads;
}

export function panColors(t: WorldTruth, c: number, rng: Rng): number {
  const loads = streamLoads(t);
  const load = loads.get(c) ?? 0;
  return rng.poisson(load * 0.9);
}

/** Soil geochemistry in ppb: near-surface gold, smeared and noisy. */
export function soilSample(t: WorldTruth, x0: number, y0: number, rng: Rng): number {
  let s = 0;
  let w = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (!inBounds(x, y)) continue;
      const ww = Math.exp(-(dx * dx + dy * dy) / 3);
      const ob = t.overburden[ci(x, y)];
      // thick cover masks the bedrock signal
      const top = Math.min(GRID_D - 1, ob);
      let g = t.grade[vi(x, y, top)] + 0.5 * t.grade[vi(x, y, Math.min(GRID_D - 1, top + 1))];
      g *= Math.pow(0.55, ob);
      if (ob > 0) g += t.grade[vi(x, y, 0)] * 0.5;
      s += ww * g;
      w += ww;
    }
  }
  const ppb = (s / w) * 1000 * rng.lognormal(0, 0.45) + rng.range(1, 6);
  return Math.round(ppb);
}

export function soilGridCells(x0: number, y0: number): number[] {
  const { half, spacing } = COSTS.soil;
  const out: number[] = [];
  for (let y = y0 - half; y <= y0 + half; y += spacing) {
    for (let x = x0 - half; x <= x0 + half; x += spacing) {
      if (inBounds(x, y)) out.push(ci(x, y));
    }
  }
  return out;
}

export function geophysSurvey(t: WorldTruth, rng: Rng): number[] {
  const out: number[] = new Array(GRID_W * GRID_H);
  for (let c = 0; c < GRID_W * GRID_H; c++) {
    out[c] = Math.max(0, t.chargeability[c] + rng.normal(0, 0.35));
  }
  return out;
}

export function revealColumn(k: Knowledge, t: WorldTruth, c: number, depth: number) {
  const x = cx(c);
  const y = cy(c);
  for (let z = 0; z < Math.min(depth, GRID_D); z++) {
    const i = vi(x, y, z);
    k.assays[i] = Math.round(t.grade[i] * 100) / 100;
  }
  // the core shows where loose gravel gives way to bedrock
  if (depth > t.overburden[c]) (k.ob ??= {})[c] = t.overburden[c];
}

/** Best composite intercept in a list of per-layer grades (min 1 layer, >= 0.5 g/t). */
export function bestIntercept(grades: number[]): { from: number; metres: number; grade: number } | null {
  let best: { from: number; metres: number; grade: number; gm: number } | null = null;
  for (let a = 0; a < grades.length; a++) {
    let sum = 0;
    for (let b = a; b < grades.length; b++) {
      sum += grades[b];
      const n = b - a + 1;
      const avg = sum / n;
      if (avg < 0.5) continue;
      const gm = avg * n;
      if (!best || gm > best.gm) best = { from: a * LAYER_M, metres: n * LAYER_M, grade: avg, gm };
    }
  }
  return best && { from: best.from, metres: best.metres, grade: best.grade };
}

export function columnGrades(k: Knowledge, c: number): (number | undefined)[] {
  const x = cx(c);
  const y = cy(c);
  const out: (number | undefined)[] = [];
  for (let z = 0; z < GRID_D; z++) out.push(k.assays[vi(x, y, z)]);
  return out;
}

/** Best available sample: verified assay, else the seller's reported value. */
export function sampleAt(k: Knowledge, i: number): number | undefined {
  return k.assays[i] ?? k.reported?.[i];
}
