import { describe, expect, it } from 'vitest';
import { applyCommand, newGame } from '../src/sim/game';
import { generateWorld } from '../src/sim/geology/generate';
import { GRID_D, GRID_W, GRAMS_PER_OZ, ci, vi } from '../src/sim/geology/types';
import { buildBlockModel } from '../src/sim/estimate';
import { getTruth } from '../src/sim/truth';
import { expandPitSlopes } from '../src/sim/mining';
import type { Command } from '../src/sim/commands';
import type { GameState } from '../src/sim/state';

function play(seed: number): GameState {
  const s = newGame(seed);
  applyCommand(s, { type: 'buyListing', listingId: s.listings[0].id });
  const propId = s.properties[0].id;
  const cmds: Command[] = [
    { type: 'walkoverAll', propId },
    { type: 'drill', propId, x: 20, y: 20, depth: 12, rush: false },
    { type: 'drill', propId, x: 10, y: 25, depth: 8, rush: true },
    { type: 'advance', days: 40 },
  ];
  for (const c of cmds) expect(applyCommand(s, c).ok).toBe(true);
  return s;
}
describe('world generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld(12345, 'motherlode');
    const b = generateWorld(12345, 'motherlode');
    expect(a.grade).toEqual(b.grade);
    expect(a.clue).toEqual(b.clue);
  });
  it('differs between seeds', () => {
    const a = generateWorld(1, 'motherlode');
    const b = generateWorld(2, 'motherlode');
    expect(a.grade).not.toEqual(b.grade);
  });
});

describe('reducer', () => {
  it('replays a command log to an identical state', () => {
    const a = play(99);
    const b = play(99);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    expect(a.day).toBeGreaterThan(0);
  });

  it('drill holes reveal exactly the true grades', () => {
    const s = newGame(7);
    const l = s.listings[0];
    applyCommand(s, { type: 'buyListing', listingId: l.id });
    const p = s.properties[0];
    applyCommand(s, { type: 'drill', propId: p.id, x: 5, y: 6, depth: GRID_D, rush: false });
    while (s.day < 30) applyCommand(s, { type: 'advance', days: 30 - s.day });
    const t = getTruth(p.seed, p.region);
    for (let z = 0; z < GRID_D; z++) {
      const i = vi(5, 6, z);
      expect(p.knowledge.assays[i]).toBeCloseTo(t.grade[i], 2);
    }
  });

  it('rejects spending money you do not have', () => {
    const s = newGame(3);
    s.cash = 10;
    const r = applyCommand(s, { type: 'buyListing', listingId: s.listings[0].id });
    expect(r.ok).toBe(false);
  });
});

describe('estimate', () => {
  it('converges toward the truth as more holes are drilled', () => {
    const t = generateWorld(4242, 'motherlode');
    const err = (spacing: number) => {
      const k = { clues: [], pans: {}, soil: {}, geophys: null, assays: {} as Record<number, number>, reported: {}, ob: {}, holes: [], trenches: [] };
      for (let y = 1; y < 40; y += spacing)
        for (let x = 1; x < 40; x += spacing) for (let z = 0; z < GRID_D; z++) k.assays[vi(x, y, z)] = t.grade[vi(x, y, z)];
      const m = buildBlockModel(k);
      let e = 0;
      for (let i = 0; i < m.est.length; i++) e += Math.abs(m.est[i] - t.grade[i]);
      return e;
    };
    expect(err(4)).toBeLessThan(err(10));
  });
});

describe('underground', () => {
  function setup() {
    const s = newGame(21);
    applyCommand(s, { type: 'buyListing', listingId: s.listings[0].id });
    const p = s.properties[0];
    s.cash = 20_000_000;
    applyCommand(s, { type: 'applyPermit', propId: p.id });
    const run = (days: number) => {
      const end = s.day + days;
      while (s.day < end && !s.gameOver) {
        applyCommand(s, { type: 'advance', days: end - s.day });
        for (const n of s.notices) n.popup = false;
      }
    };
    run(40);
    return { s, p, run };
  }

  it('sinks a shaft, revealing the shaft column, and charges per level', () => {
    const { s, p, run } = setup();
    const before = p.ledger.capex;
    expect(applyCommand(s, { type: 'placeShaft', propId: p.id, x: 5, y: 5 }).ok).toBe(true);
    applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: 'pump', lease: false });
    applyCommand(s, { type: 'setShaftDepth', propId: p.id, depth: 6 });
    run(30);
    expect(p.mine.shaft!.depth).toBe(6);
    expect(p.knowledge.assays[vi(5, 5, 5)]).toBeDefined();
    expect(p.ledger.capex - before).toBeGreaterThan(350_000 + 6 * 21_000);
  });

  it('stopes only estimated ore, reveals it, and the pit later skips the void', () => {
    const { s, p, run } = setup();
    const t = getTruth(p.seed, p.region);
    // fake perfect knowledge of a column so the stope planner has an estimate
    for (let z = 0; z < GRID_D; z++) p.knowledge.assays[vi(20, 20, z)] = Math.max(1, t.grade[vi(20, 20, z)]);
    applyCommand(s, { type: 'setCutoff', propId: p.id, cutoff: 0.5 });
    applyCommand(s, { type: 'setFollowVein', propId: p.id, on: false });
    applyCommand(s, { type: 'placeShaft', propId: p.id, x: 22, y: 20 });
    for (const e of ['pump', 'ugcrew', 'cil'] as const) applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: e, lease: false });
    applyCommand(s, { type: 'setShaftDepth', propId: p.id, depth: 12 });
    applyCommand(s, { type: 'setStopes', propId: p.id, cells: [ci(20, 20)], zFrom: 0, zTo: 11 });
    // crown pillar: nothing above layer 2
    expect(p.mine.stopes.every((i) => Math.floor(i / (GRID_W * 40)) >= 2)).toBe(true);
    expect(p.mine.stopes.length).toBe(10);
    run(120);
    expect(p.mine.stopes.length).toBe(0);
    expect(p.mine.ugOreT + p.mine.ugWasteT).toBeGreaterThan(0);
    expect(p.knowledge.assays[vi(20, 20, 6)]).toBeCloseTo(t.grade[vi(20, 20, 6)], 2);
    // open pit down through the stoped column: voids cost nothing
    const waste = p.mine.wasteT + p.mine.oreT;
    applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: 'fleet', lease: false });
    applyCommand(s, { type: 'setPit', propId: p.id, cells: [ci(20, 20)], depth: 8 });
    run(60);
    expect(p.mine.mined[ci(20, 20)]).toBe(8);
    const dug = p.mine.wasteT + p.mine.oreT - waste;
    expect(dug).toBeGreaterThan(0); // the slope pushback is real rock
  });
});

describe('mining', () => {
  it('pit slopes deepen neighbours', () => {
    const target = new Array(GRID_W * 40).fill(0);
    target[ci(20, 20)] = 10;
    expandPitSlopes(target);
    expect(target[ci(21, 20)]).toBe(8);
    expect(target[ci(25, 20)]).toBe(0);
  });

  it('accounts for gold: produced oz match recovered grams', () => {
    const s = newGame(11);
    const l = s.listings[0];
    applyCommand(s, { type: 'buyListing', listingId: l.id });
    const p = s.properties[0];
    s.cash = 10_000_000;
    applyCommand(s, { type: 'applyPermit', propId: p.id });
    applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: 'fleet', lease: false });
    applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: 'pump', lease: false });
    applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: 'cil', lease: false });
    applyCommand(s, { type: 'setPit', propId: p.id, cells: [ci(20, 20), ci(21, 20), ci(20, 21)], depth: 6 });
    while (s.day < 120 && !s.gameOver) applyCommand(s, { type: 'advance', days: 120 - s.day });
    expect(p.permit).toBe('granted');
    expect(p.mine.oreT + p.mine.wasteT).toBeGreaterThan(0);
    expect(s.stats.ozProduced).toBeCloseTo(p.mine.goldG / GRAMS_PER_OZ, 3);
  });
});
