// Tutorial coach: a step list with highlight targets, map beacons and completion checks.
import { useEffect, useMemo, useState } from 'react';
import { endTutorial } from '../sim/game';
import { pitForecast } from '../sim/forecast';
import { Clue, LAYER_M } from '../sim/geology/types';
import { pitBlocksRemaining } from '../sim/mining';
import type { GameState, Property } from '../sim/state';
import { suggestedPitCells, tutorialPlan, type TutorialPlan } from '../sim/tutorial';
import type { Overlay } from './map/MapCanvas';
import { store } from './store';

export type RightTab = 'explore' | 'mine' | 'report' | 'bank' | 'awards';

export interface TutorialUi {
  tab: RightTab;
  overlay: Overlay;
  view: 'map' | '3d';
  office: boolean;
}

interface Ctx {
  s: GameState;
  p: Property | undefined;
  plan: TutorialPlan | null;
  ui: TutorialUi;
}

interface Step {
  title: string;
  body: (c: Ctx) => string;
  target?: (c: Ctx) => string | undefined;
  tab?: RightTab;
  overlay?: Overlay;
  marks?: (c: Ctx) => number[];
  /** Completion check; steps without one show a Next button. */
  done?: (c: Ctx) => boolean;
}

const playerHoles = (p?: Property) => p?.knowledge.holes.filter((h) => !h.name.startsWith('Hist')) ?? [];
const has = (p: Property | undefined, kind: (id: string) => boolean) => !!p?.equipment.some((u) => kind(u.type));

const STEPS: Step[] = [
  {
    title: 'Welcome, prospector',
    body: () =>
      "This tutorial walks you through a whole mine: buying a claim, finding the gold, choosing the **right equipment**, and pouring your first ounces. Follow the **glowing** buttons and the **gold beacons** on the map. You can't lose real progress: it's a normal game you keep playing afterwards.",
  },
  {
    title: 'Buy a claim',
    body: (c) =>
      c.ui.office
        ? "This is **Prospector's Creek**. Real listings vary: some sellers exaggerate, and due diligence checks their claims. Click **Buy claim**."
        : 'Everything starts with land. Open the **Land Office**.',
    target: (c) => (c.ui.office ? 'buy-claim' : 'land-office'),
    done: (c) => !!c.p,
  },
  {
    title: 'Map the surface',
    body: () =>
      "Your claim is the map in the middle. The darker ground is still unexplored. Send your geologist to map every outcrop and clue: click **Full walk-over** (about $3.8k, 8 days).",
    tab: 'explore',
    target: () => 'walk-all',
    done: (c) => !!c.p && (c.p.jobs.some((j) => j.kind === 'walkoverAll') || c.p.knowledge.clues.some((v) => v >= 0)),
  },
  {
    title: 'Let time pass',
    body: () => 'Time only moves when you say so. Press **+1 week** (or the **W** key) until the walk-over is complete.',
    target: () => 'advance-week',
    done: (c) => !!c.p && c.p.knowledge.clues.filter((v) => v >= 0).length > 100,
  },
  {
    title: 'Read the ground',
    body: () =>
      "The map is now full of clues. **White crystals** are quartz outcrops, and gold often rides in quartz veins. **Gold sparkles** mean visible gold. **Rust-red patches** (gossan) and **dead shrubs** hint at mineralisation below. **Mine-adit icons** are old-timers' diggings: they found something. The beacons mark the most interesting clues. The legend under the map lists them all.",
    marks: (c) => {
      if (!c.p) return [];
      const out: number[] = [];
      c.p.knowledge.clues.forEach((v, i) => {
        if (v === Clue.QuartzOutcrop || v === Clue.VisibleGold || v === Clue.OldWorkings) out.push(i);
      });
      return out.slice(0, 12);
    },
  },
  {
    title: 'Pan the creek',
    body: () =>
      "Gold washes downhill into creeks, so the **gold trail gets stronger as you get closer to the source**. Pick **Pan creek**, then click the **two beacons** on the creek: one far upstream, one close to the hills. Then advance a day to see the results.",
    tab: 'explore',
    target: () => 'tool-pan',
    marks: (c) => (c.plan ? [c.plan.panUp, c.plan.panDown] : []),
    done: (c) => !!c.p && c.plan !== null && c.p.knowledge.pans[c.plan.panUp] !== undefined && c.p.knowledge.pans[c.plan.panDown] !== undefined,
  },
  {
    title: 'Follow the colours',
    body: (c) => {
      const up = c.plan && c.p ? c.p.knowledge.pans[c.plan.panUp] : 0;
      const down = c.plan && c.p ? c.p.knowledge.pans[c.plan.panDown] : 0;
      return `Upstream you counted **${up} colours**; near the hills, **${down}**. Gold is shedding into the creek from somewhere close to the second spot. With the quartz and old workings nearby, that's where to drill.`;
    },
  },
  {
    title: 'Drill your first hole',
    body: () =>
      'Only a drill hole tells you what is really down there. Choose **Core drill** (60 m is plenty here), then click the **beacon**. Holes cost money and take days, so place them where the evidence points.',
    tab: 'explore',
    target: () => 'tool-drill',
    marks: (c) => (c.plan ? [c.plan.best] : []),
    done: (c) => playerHoles(c.p).length >= 1,
  },
  {
    title: 'Wait for the assay lab',
    body: () => 'The core goes to a lab, and results take about **10 days** (rush costs extra). Advance time until the results pop up.',
    target: () => 'advance-week',
    done: (c) => playerHoles(c.p).some((h) => h.status === 'done'),
  },
  {
    title: 'Step out',
    body: () =>
      'One hole is a lucky guess; a mine needs a **shape**. Drill the **4 beacons** around your first hole to see how far the ore goes, then advance time until all the assays are back.',
    tab: 'explore',
    target: () => 'tool-drill',
    marks: (c) => (c.plan ? c.plan.stepOuts.filter((m) => !c.p?.knowledge.holes.some((h) => h.c === m)) : []),
    done: (c) => playerHoles(c.p).filter((h) => h.status === 'done').length >= 5,
  },
  {
    title: 'See your ore body',
    body: () =>
      'Switch the map to **Grade estimate**. Warm colours show your best guess of grade between the holes, and it fades out where you have no data. The estimate is only as good as your drilling.',
    target: () => 'overlay-estimate',
    done: (c) => c.ui.overlay === 'estimate',
  },
  {
    title: 'Look underground',
    body: () =>
      'Now try the **3D** view and drag to orbit. Glowing gold boxes are assays above cutoff; the translucent shell is your estimated ore. When you are done, switch back to **Map**.',
    target: (c) => (c.ui.view === '3d' ? 'view-map' : 'view-3d'),
    done: (c) => c.ui.view === '3d',
  },
  {
    title: 'Apply for a mining permit',
    body: (c) =>
      `${c.ui.view === '3d' ? 'Switch back to **Map**. ' : ''}You can't dig without a permit: **$12k fee + a $25k bond** you get back when you sell the claim. Approval takes **30 days**, so apply now and plan while you wait.`,
    tab: 'mine',
    target: () => 'apply-permit',
    done: (c) => !!c.p && c.p.permit !== 'none',
  },
  {
    title: 'Design the pit',
    body: (c) => {
      const floor = c.p ? suggestedPitCells(c.p).floor : 4;
      return `Click **Paint pit**, set the **floor to ${floor * LAYER_M} m**, then click-drag across the **beacons** (the gold-coloured ground on your estimate). The walls slope automatically.`;
    },
    tab: 'mine',
    overlay: 'estimate',
    target: () => 'paint-pit',
    marks: (c) => (c.p ? suggestedPitCells(c.p).cells.filter((m) => c.p!.mine.target[m] === 0) : []),
    done: (c) => {
      if (!c.p || pitBlocksRemaining(c.p.mine) === 0) return false;
      const f = pitForecast(c.p, c.s.goldPrice);
      const want = suggestedPitCells(c.p).cells;
      const covered = want.filter((m) => c.p!.mine.target[m] > 0).length;
      return !!f && f.oreT > 0 && covered >= want.length * 0.7;
    },
  },
  {
    title: 'Read the pit forecast',
    body: () =>
      'This is the key to making money. The **Pit forecast** shows how much ore you will dig, and whether it is **gravel** or **hard rock**: that decides your equipment. **Gravel** washes in a sluice or trommel. **Hard rock** must be crushed (Crusher + Gravity, or a CIL mill); a sluice gets **0%** from rock! The ⚠ warnings list what is missing. **Don\'t lease yet**: rent starts the day you sign, and the permit isn\'t through.',
    tab: 'mine',
    target: () => 'forecast',
  },
  {
    title: 'Wait for the permit',
    body: () => 'Advance time until the permit is granted (about 30 days from when you applied).',
    target: () => 'advance-week',
    done: (c) => c.p?.permit === 'granted',
  },
  {
    title: 'Get the right equipment',
    body: () =>
      "Permit granted! Under **Suggested equipment**, **Lease** each item. Leasing costs nothing up front: perfect when cash is tight. (Buy instead once you know the mine will run for months.) The forecast's profit line updates as you add gear.",
    tab: 'mine',
    target: () => 'suggested',
    done: (c) => {
      if (!c.p) return false;
      const f = pitForecast(c.p, c.s.goldPrice);
      return !!f && f.suggested.length === 0 && has(c.p, (t) => ['backhoe', 'fleet', 'shovel'].includes(t)) && Number.isFinite(f.days);
    },
  },
  {
    title: 'Start production',
    body: () =>
      'Advance time and watch the Mine tab. Diggers strip waste and drop into the ore, the ore goes to the **stockpile**, and the mill **pours gold**. Keep going until you have **25 oz**.',
    tab: 'mine',
    target: () => 'advance-week',
    done: (c) => c.s.stats.ozProduced >= 25,
  },
  {
    title: 'Sell your gold',
    body: () =>
      'Gold in the vault is only worth something when you sell it, and unguarded gold can be stolen. Open the **Bank** tab and click **Sell all gold**. (Holding is a bet on the price.)',
    tab: 'bank',
    target: () => 'sell-gold',
    done: (c) => c.s.stats.ozSold > 0,
  },
  {
    title: "You're a miner!",
    body: () =>
      "That's the whole loop. Tips for the rest of the game: check **Last 30 days** on the Mine tab to see if you're making money; **buy** equipment for long jobs, since leases add up; **drill inside the pit** to firm up low-confidence ore; and sell **proven** claims for cash. New land and random events now appear. Good luck!",
    tab: 'mine',
  },
];

export const TUTORIAL_STEP_COUNT = STEPS.length;

/** Testing hook: is step `index` complete for this state? (null = a manual "Next" step) */
export function tutorialStepDone(index: number, s: GameState, ui: TutorialUi): boolean | null {
  const step = STEPS[index];
  if (!step.done) return null;
  const p = s.properties[0];
  return step.done({ s, p, plan: p ? tutorialPlan(p) : null, ui });
}

function useCtx(s: GameState, ui: TutorialUi): Ctx {
  const p = s.properties[0];
  const plan = useMemo(() => (p ? tutorialPlan(p) : null), [p]);
  return { s, p, plan, ui };
}

/** Beacons for the current step (used by the map). */
export function tutorialMarks(s: GameState, ui: TutorialUi): number[] {
  if (!s.tutorial || s.tutorial.done) return [];
  const step = STEPS[s.tutorial.step];
  const p = s.properties[0];
  if (!step?.marks) return [];
  return step.marks({ s, p, plan: p ? tutorialPlan(p) : null, ui });
}

function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>))}
    </>
  );
}

export function TutorialCoach({
  s,
  ui,
  setTab,
  setOverlay,
}: {
  s: GameState;
  ui: TutorialUi;
  setTab: (t: RightTab) => void;
  setOverlay: (o: Overlay) => void;
}) {
  const ctx = useCtx(s, ui);
  const [collapsed, setCollapsed] = useState(false);
  const t = s.tutorial;
  const index = t?.step ?? 0;
  const step = STEPS[Math.min(index, STEPS.length - 1)];
  const complete = !!step.done?.(ctx);

  // entering a step: show the right tab / overlay
  useEffect(() => {
    if (!t || t.done) return;
    if (step.tab) setTab(step.tab);
    if (step.overlay) setOverlay(step.overlay);
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-advance shortly after a step's goal is met
  useEffect(() => {
    if (!t || t.done || !complete) return;
    const id = setTimeout(() => {
      t.step = index + 1;
      store.touch();
    }, 900);
    return () => clearTimeout(id);
  }, [complete, index, t]);

  // highlight the element the player should use
  const target = step.target?.(ctx);
  useEffect(() => {
    if (!target) return;
    const els = [...document.querySelectorAll(`[data-tut="${target}"]`)];
    els.forEach((e) => e.classList.add('tut-glow'));
    if (els[0] && 'scrollIntoView' in els[0]) (els[0] as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return () => els.forEach((e) => e.classList.remove('tut-glow'));
  });

  if (!t || t.done) return null;
  const last = index >= STEPS.length - 1;
  const next = () => {
    if (last) endTutorial(s);
    else t.step = index + 1;
    store.touch();
  };
  if (collapsed) {
    return (
      <button className="coach-pill" onClick={() => setCollapsed(false)}>
        🎓 Tutorial: step {index + 1}/{STEPS.length}
      </button>
    );
  }
  return (
    <div className={`coach ${complete ? 'complete' : ''}`}>
      <div className="coach-head">
        <span className="coach-step">
          Step {index + 1} of {STEPS.length}
        </span>
        <span className="row" style={{ margin: 0 }}>
          <button className="ghost small-btn" onClick={() => setCollapsed(true)} title="Minimise">
            –
          </button>
          <button
            className="ghost small-btn"
            title="Skip the tutorial and play freely"
            onClick={() => {
              endTutorial(s);
              store.touch();
            }}
          >
            Skip
          </button>
        </span>
      </div>
      <div className="coach-progress">
        <i style={{ width: `${((index + (complete ? 1 : 0)) / STEPS.length) * 100}%` }} />
      </div>
      <h3>
        {complete ? '✓ ' : ''}
        {step.title}
      </h3>
      <p>
        <Rich text={step.body(ctx)} />
      </p>
      {!step.done && (
        <button onClick={next} autoFocus>
          {last ? 'Finish tutorial' : 'Next'}
        </button>
      )}
    </div>
  );
}
