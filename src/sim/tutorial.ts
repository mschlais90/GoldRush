// Map hints for the tutorial coach. Unlike normal play, the coach is allowed to
// peek at the hidden deposit so its suggestions are guaranteed to pay off.
import { modelKey } from './economy';
import { getModel } from './estimate';
import { GRAMS_PER_OZ, GRID_H, GRID_W, blockTonnes, ci, cx, cy, inBounds, vi } from './geology/types';
import type { Property } from './state';
import { getTruth } from './truth';

const SHALLOW = 5; // layers considered for the starter pit

export interface TutorialPlan {
  best: number; // richest shallow column: first drill hole
  stepOuts: number[]; // follow-up holes around it
  panUp: number; // creek cell well upstream of the gold
  panDown: number; // creek cell just below the gold
}

export function tutorialPlan(p: Property): TutorialPlan {
  const t = getTruth(p.seed, p.region);
  // per column: shallow ore blocks (capped oz so a lone bonanza pocket doesn't dominate)
  const colScore = new Float32Array(GRID_W * GRID_H);
  for (let c = 0; c < colScore.length; c++) {
    for (let z = 0; z < SHALLOW; z++) {
      const g = t.grade[vi(cx(c), cy(c), z)];
      if (g >= 0.8) colScore[c] += (blockTonnes(t.rock[vi(cx(c), cy(c), z)]) * Math.min(g, 5)) / GRAMS_PER_OZ;
    }
  }
  // the first hole goes in the heart of laterally continuous ore
  const around = (c: number, r: number) => {
    let s = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBounds(cx(c) + dx, cy(c) + dy)) s += colScore[ci(cx(c) + dx, cy(c) + dy)];
    return s;
  };
  let best = 0;
  let bestScore = -1;
  for (let c = 0; c < colScore.length; c++) {
    const s = colScore[c] > 0 ? around(c, 2) : 0;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  // step-out holes: the richest nearby columns, spread out so each one teaches something
  const candidates: number[] = [];
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      if (d < 2 || !inBounds(cx(best) + dx, cy(best) + dy)) continue;
      candidates.push(ci(cx(best) + dx, cy(best) + dy));
    }
  }
  candidates.sort((a, b) => colScore[b] - colScore[a]);
  const stepOuts: number[] = [];
  for (const c of candidates) {
    if (stepOuts.length >= 4) break;
    if (stepOuts.every((o) => Math.max(Math.abs(cx(o) - cx(c)), Math.abs(cy(o) - cy(c))) >= 2)) stepOuts.push(c);
  }

  // creek cells: the one closest to the gold, and one well upstream of it
  const path = t.streamPath;
  let near = 0;
  let nd = Infinity;
  path.forEach((c, i) => {
    const d = (cx(c) - cx(best)) ** 2 + (cy(c) - cy(best)) ** 2;
    if (d < nd) {
      nd = d;
      near = i;
    }
  });
  return {
    best,
    stepOuts,
    panDown: path[Math.min(path.length - 1, near + 2)] ?? best,
    panUp: path[Math.max(0, near - 14)] ?? best,
  };
}

/** Columns where the player's own estimate shows shallow ore: where the coach suggests the pit. */
export function suggestedPitCells(p: Property): { cells: number[]; floor: number } {
  const model = getModel(modelKey(p), p.knowledge);
  const cells: number[] = [];
  let floor = 0;
  for (let c = 0; c < GRID_W * GRID_H; c++) {
    let ore = false;
    for (let z = 0; z < SHALLOW; z++) {
      const i = vi(cx(c), cy(c), z);
      if (model.conf[i] >= 0.35 && model.est[i] >= Math.max(0.8, p.mine.cutoff)) {
        ore = true;
        floor = Math.max(floor, z + 1);
      }
    }
    if (ore) cells.push(c);
  }
  return { cells, floor: Math.max(2, floor) };
}
