// Headless balance harness: bot strategies play real games through the reducer.
// Good strategy (reading clues before drilling) should beat random drilling.
//   npx tsx tools/balance.ts [games]
import { applyCommand, newGame } from '../src/sim/game';
import type { Command } from '../src/sim/commands';
import { netWorth, modelKey } from '../src/sim/economy';
import { getModel } from '../src/sim/estimate';
import { GRID_D, GRID_H, GRID_W, Clue, ci, cx, cy, vi } from '../src/sim/geology/types';
import { Rng } from '../src/sim/rng';
import type { GameState, Property } from '../src/sim/state';

type Strategy = 'idle' | 'random' | 'guided';

function run(s: GameState, cmd: Command) {
  return applyCommand(s, cmd);
}

function advance(s: GameState, days: number) {
  const target = Math.min(s.endDay, s.day + days);
  while (s.day < target && !s.gameOver) {
    run(s, { type: 'advance', days: target - s.day });
    for (const n of s.notices) n.popup = false;
  }
}

function pickHoles(p: Property, strat: Strategy, n: number, rng: Rng): number[] {
  if (strat === 'random') return Array.from({ length: n }, () => rng.int(0, GRID_W * GRID_H - 1));
  // guided: score columns by clues, pans and soil
  const k = p.knowledge;
  const score = new Float32Array(GRID_W * GRID_H);
  for (let c = 0; c < score.length; c++) {
    const clue = k.clues[c];
    const w = clue === Clue.VisibleGold ? 8 : clue === Clue.QuartzOutcrop ? 3 : clue === Clue.OldWorkings ? 3 : clue === Clue.Gossan ? 2 : clue === Clue.VegStress ? 1.5 : 0;
    if (!w) continue;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = cx(c) + dx;
        const y = cy(c) + dy;
        if (x >= 0 && y >= 0 && x < GRID_W && y < GRID_H) score[ci(x, y)] += w / (1 + Math.abs(dx) + Math.abs(dy));
      }
  }
  for (const [key, v] of Object.entries(k.soil)) score[Number(key)] += Math.log(1 + v);
  for (const [key, v] of Object.entries(k.pans)) score[Number(key)] += v * 0.5;
  const out: number[] = [];
  const taken = new Set<number>();
  for (let i = 0; i < n; i++) {
    let best = -1;
    let bs = -1;
    for (let c = 0; c < score.length; c++) {
      if (taken.has(c)) continue;
      let near = false;
      for (const t of taken) if (Math.abs(cx(t) - cx(c)) + Math.abs(cy(t) - cy(c)) < 3) near = true;
      const sc = score[c] + rng.float() * 0.2 - (near ? 100 : 0);
      if (sc > bs) {
        bs = sc;
        best = c;
      }
    }
    taken.add(best);
    out.push(best);
  }
  return out;
}

function playGame(seed: number, strat: Strategy): { w: number; oz: number; bankrupt: boolean } {
  const s = newGame(seed);
  const rng = new Rng({ s: seed ^ 0x5eed });
  const l = [...s.listings].sort((a, b) => a.ask - b.ask)[0];
  run(s, { type: 'buyListing', listingId: l.id });
  const p = s.properties[0];
  if (strat === 'idle') {
    advance(s, s.endDay);
    return { w: netWorth(s), oz: s.stats.ozProduced, bankrupt: !!s.gameOver?.reason.startsWith('Bankrupt') };
  }
  if (strat === 'guided') {
    run(s, { type: 'walkoverAll', propId: p.id });
    advance(s, 10);
    const t = p.knowledge;
    const best = pickHoles(p, 'guided', 2, rng);
    for (const c of best) run(s, { type: 'soil', propId: p.id, x: cx(c), y: cy(c) });
    void t;
    advance(s, 20);
  }
  // first round of drilling
  for (const c of pickHoles(p, strat, 5, rng)) run(s, { type: 'drill', propId: p.id, x: cx(c), y: cy(c), depth: 12, rush: false });
  advance(s, 40);
  // follow up around the best hole
  const model = getModel(modelKey(p), p.knowledge);
  let bestC = -1;
  let bestG = 0;
  for (let c = 0; c < GRID_W * GRID_H; c++)
    for (let z = 0; z < GRID_D; z++) {
      const i = vi(cx(c), cy(c), z);
      if (model.conf[i] >= 1 && model.est[i] > bestG) {
        bestG = model.est[i];
        bestC = c;
      }
    }
  if (bestG < 0.8) {
    advance(s, s.endDay);
    return { w: netWorth(s), oz: s.stats.ozProduced, bankrupt: !!s.gameOver?.reason.startsWith('Bankrupt') };
  }
  for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
    const x = Math.max(0, Math.min(GRID_W - 1, cx(bestC) + dx));
    const y = Math.max(0, Math.min(GRID_H - 1, cy(bestC) + dy));
    run(s, { type: 'drill', propId: p.id, x, y, depth: 14, rush: false });
  }
  advance(s, 30);
  // mine: pit over columns whose estimate beats 1 g/t, using leased gear
  const m2 = getModel(modelKey(p), p.knowledge);
  const cells: number[] = [];
  let deepest = 0;
  for (let c = 0; c < GRID_W * GRID_H; c++) {
    for (let z = 0; z < 12; z++) {
      const i = vi(cx(c), cy(c), z);
      if (m2.conf[i] >= 0.4 && m2.est[i] >= 1) {
        cells.push(c);
        deepest = Math.max(deepest, z + 1);
      }
    }
  }
  if (cells.length === 0) {
    advance(s, s.endDay);
    return { w: netWorth(s), oz: s.stats.ozProduced, bankrupt: !!s.gameOver?.reason.startsWith('Bankrupt') };
  }
  if (s.cash < 45_000) run(s, { type: 'borrow', amount: 45_000 - s.cash });
  run(s, { type: 'applyPermit', propId: p.id });
  while (p.permit !== 'granted' && !s.gameOver) advance(s, 5);
  for (const e of ['backhoe', 'pump', 'gravity'] as const) run(s, { type: 'buyEquipment', propId: p.id, equip: e, lease: true });
  run(s, { type: 'setPit', propId: p.id, cells: [...new Set(cells)], depth: Math.min(10, deepest) });
  while (s.day < s.endDay && !s.gameOver) {
    advance(s, 30);
    if (s.goldOz > 0) run(s, { type: 'sellGold', oz: s.goldOz });
    if (p.mine.status.startsWith('Pit plan complete') && p.mine.rock.t + p.mine.gravel.t < 1) {
      for (const u of [...p.equipment]) run(s, { type: 'sellEquipment', propId: p.id, unitId: u.id });
    }
  }
  if (process.env.DEBUG) console.log(seed, strat, 'day', s.day, 'cells', cells.length, 'permit', p.permit, p.mine.status, 'ore', Math.round(p.mine.oreT), 'waste', Math.round(p.mine.wasteT), 'oz', s.stats.ozProduced.toFixed(0), s.gameOver?.reason);
  return { w: netWorth(s), oz: s.stats.ozProduced, bankrupt: !!s.gameOver?.reason.startsWith('Bankrupt') };
}

const N = Number(process.argv[2] ?? 30);
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const strat of ['idle', 'random', 'guided'] as Strategy[]) {
  const ws: number[] = [];
  let bankrupt = 0;
  let oz = 0;
  const t0 = Date.now();
  for (let g = 0; g < N; g++) {
    const r = playGame(1000 + g * 7, strat);
    ws.push(r.w);
    oz += r.oz;
    if (r.bankrupt) bankrupt++;
  }
  ws.sort((a, b) => a - b);
  console.log(
    `${strat.padEnd(7)} median $${Math.round(median(ws)).toLocaleString().padStart(12)}  p10 $${Math.round(ws[Math.floor(N * 0.1)]).toLocaleString().padStart(12)}  p90 $${Math.round(ws[Math.floor(N * 0.9)]).toLocaleString().padStart(12)}  avg oz ${Math.round(oz / N).toLocaleString().padStart(8)}  bankrupt ${bankrupt}/${N}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}
