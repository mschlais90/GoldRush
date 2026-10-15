// Plays the tutorial through the coach's own step checks, the way a player would.
import { describe, expect, it } from 'vitest';
import { applyCommand, newTutorialGame } from '../src/sim/game';
import { pitForecast } from '../src/sim/forecast';
import { cx, cy } from '../src/sim/geology/types';
import type { GameState } from '../src/sim/state';
import { suggestedPitCells, tutorialPlan } from '../src/sim/tutorial';
import { TUTORIAL_STEP_COUNT, tutorialStepDone, type TutorialUi } from '../src/ui/Tutorial';

describe('tutorial coach', () => {
  it('every step can be completed in order and the player ends up in profit', () => {
    const s: GameState = newTutorialGame();
    const ui: TutorialUi = { tab: 'explore', overlay: 'none', view: 'map', office: false };
    const step = () => s.tutorial!.step;
    const pass = () => {
      const d = tutorialStepDone(step(), s, ui);
      expect(d === null || d, `step ${step()} should be complete`).toBe(true);
      s.tutorial!.step++;
    };
    const advanceUntil = (cond: () => boolean, max = 120) => {
      for (let i = 0; i < max && !cond(); i++) {
        applyCommand(s, { type: 'advance', days: 1 });
        for (const n of s.notices) n.popup = false;
      }
    };
    const done = () => tutorialStepDone(step(), s, ui) === true;

    pass(); // 0 welcome
    expect(tutorialStepDone(1, s, ui)).toBe(false);
    ui.office = true;
    applyCommand(s, { type: 'buyListing', listingId: s.listings[0].id });
    ui.office = false;
    pass(); // 1 buy
    const p = s.properties[0];
    applyCommand(s, { type: 'walkoverAll', propId: p.id });
    pass(); // 2 walk-over ordered
    advanceUntil(done);
    pass(); // 3 time passes
    pass(); // 4 read the ground (manual)
    const plan = tutorialPlan(p);
    applyCommand(s, { type: 'pan', propId: p.id, x: cx(plan.panUp), y: cy(plan.panUp) });
    applyCommand(s, { type: 'pan', propId: p.id, x: cx(plan.panDown), y: cy(plan.panDown) });
    advanceUntil(done);
    pass(); // 5 pan
    pass(); // 6 colours (manual)
    applyCommand(s, { type: 'drill', propId: p.id, x: cx(plan.best), y: cy(plan.best), depth: 12, rush: false });
    pass(); // 7 drill
    advanceUntil(done);
    pass(); // 8 assay back
    for (const c of plan.stepOuts) applyCommand(s, { type: 'drill', propId: p.id, x: cx(c), y: cy(c), depth: 12, rush: false });
    advanceUntil(done);
    pass(); // 9 step-outs assayed
    ui.overlay = 'estimate';
    pass(); // 10 estimate overlay
    ui.view = '3d';
    pass(); // 11 3D
    ui.view = 'map';
    applyCommand(s, { type: 'applyPermit', propId: p.id });
    pass(); // 12 permit applied
    const pit = suggestedPitCells(p);
    applyCommand(s, { type: 'setPit', propId: p.id, cells: pit.cells, depth: pit.floor });
    pass(); // 13 pit designed
    pass(); // 14 forecast (manual)
    advanceUntil(done);
    pass(); // 15 permit granted
    for (const e of pitForecast(p, s.goldPrice)!.suggested) applyCommand(s, { type: 'buyEquipment', propId: p.id, equip: e, lease: true });
    pass(); // 16 equipment
    advanceUntil(done);
    pass(); // 17 production
    applyCommand(s, { type: 'sellGold', oz: s.goldOz });
    pass(); // 18 sold
    expect(step()).toBe(TUTORIAL_STEP_COUNT - 1); // final, manual "finish" step

    // the operation keeps paying after the tutorial
    const cash0 = s.cash - s.loan;
    for (let i = 0; i < 60; i++) {
      applyCommand(s, { type: 'advance', days: 1 });
      for (const n of s.notices) n.popup = false;
    }
    applyCommand(s, { type: 'sellGold', oz: s.goldOz });
    expect(s.cash - s.loan).toBeGreaterThan(cash0);
    expect(s.cash - s.loan).toBeGreaterThan(s.startCash);
  });
});
