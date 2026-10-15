import { describe, expect, it } from 'vitest';
import { applyCommand, newTutorialGame } from '../src/sim/game';
import { pitForecast } from '../src/sim/forecast';
import { cx, cy } from '../src/sim/geology/types';
import type { GameState } from '../src/sim/state';
import { suggestedPitCells, tutorialPlan } from '../src/sim/tutorial';

function run(s: GameState, days: number) {
  const end = s.day + days;
  while (s.day < end && !s.gameOver) {
    applyCommand(s, { type: 'advance', days: end - s.day });
    for (const n of s.notices) n.popup = false;
  }
}

/** Plays the tutorial exactly as the coach instructs. */
function playTutorial() {
  const s = newTutorialGame();
  const ok = (r: { ok: boolean; error?: string }) => expect(r.error ?? 'ok').toBe('ok');
  ok(applyCommand(s, { type: 'buyListing', listingId: s.listings[0].id }));
  const p = s.properties[0];
  ok(applyCommand(s, { type: 'walkoverAll', propId: p.id }));
  run(s, 9);
  const plan = tutorialPlan(p);
  ok(applyCommand(s, { type: 'pan', propId: p.id, x: cx(plan.panUp), y: cy(plan.panUp) }));
  ok(applyCommand(s, { type: 'pan', propId: p.id, x: cx(plan.panDown), y: cy(plan.panDown) }));
  run(s, 3);
  ok(applyCommand(s, { type: 'drill', propId: p.id, x: cx(plan.best), y: cy(plan.best), depth: 12, rush: false }));
  run(s, 14);
  for (const c of plan.stepOuts) ok(applyCommand(s, { type: 'drill', propId: p.id, x: cx(c), y: cy(c), depth: 12, rush: false }));
  run(s, 25);
  ok(applyCommand(s, { type: 'applyPermit', propId: p.id }));
  const pit = suggestedPitCells(p);
  ok(applyCommand(s, { type: 'setPit', propId: p.id, cells: pit.cells, depth: pit.floor }));
  const before = pitForecast(p, s.goldPrice)!;
  run(s, 31);
  for (const e of before.suggested) ok(applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: e, lease: true }));
  const after = pitForecast(p, s.goldPrice)!;
  return { s, p, plan, pit, before, after };
}

describe('tutorial', () => {
  it('the guided path produces gold and a profit within a few months', () => {
    const { s, p, plan, pit, before, after } = playTutorial();
    const pans = p.knowledge.pans;
    expect(pans[plan.panDown]).toBeGreaterThan(pans[plan.panUp]); // gold trail points toward the source
    expect(pit.cells.length).toBeGreaterThan(5);
    expect(before.oreT).toBeGreaterThan(0);
    expect(before.suggested.length).toBeGreaterThan(0);
    expect(after.warnings.filter((w) => /mill|digging|hard rock|pumps/i.test(w))).toEqual([]);
    expect(after.profit).toBeGreaterThan(0);
    const startWorth = s.cash + s.goldOz * s.goldPrice;
    run(s, 90);
    applyCommand(s, { type: 'sellGold', oz: s.goldOz });
    expect(s.stats.ozProduced).toBeGreaterThan(50);
    expect(s.cash).toBeGreaterThan(startWorth);
    expect(s.gameOver).toBeNull();
  });

  it('keeps the market and random events quiet until the tutorial ends', () => {
    const s = newTutorialGame();
    run(s, 60);
    expect(s.listings.length).toBe(1);
    expect(s.notices.filter((n) => n.kind === 'warn' || n.kind === 'good').length).toBe(0);
  });
});
