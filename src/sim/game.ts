// The game reducer. applyCommand mutates GameState deterministically: the same
// seed + command list always produces the same state.
import { ACHIEVEMENTS, checkAchievements, grant } from './achievements';
import type { Command, CommandResult } from './commands';
import {
  CLAIM_FEE_PER_DAY,
  LOAN_APR,
  appraise,
  creditLimit,
  dailyLeaseCost,
  equipmentValue,
  modelKey,
  netWorth,
  stepGoldPrice,
} from './economy';
import { EQUIPMENT, resaleValue } from './equipment';
import { rollEvent } from './events';
import { GRID_D, GRID_H, GRID_W, LAYER_M, ci, cx, cy, inBounds, vi } from './geology/types';
import { dueDiligenceReport, generateListing, refreshMarket } from './market';
import { getModel } from './estimate';
import { MAX_CUTOFF, UNDERGROUND, expandPitSlopes, gramsToOz, mineDay, newMineState, sortStopes, stopeAllowed } from './mining';
import {
  COSTS,
  bestIntercept,
  drillCost,
  drillDays,
  geophysSurvey,
  panColors,
  revealColumn,
  revealWalkover,
  soilGridCells,
  soilSample,
  trenchCells,
} from './prospecting';
import { REGIONS, REGION_ORDER } from './regions';
import { Rng, hashString } from './rng';
import {
  GAME_YEARS,
  type GameState,
  type Knowledge,
  type Listing,
  type NoticeKind,
  type Property,
  SAVE_VERSION,
  START_CASH,
} from './state';
import { getTruth } from './truth';

export function newGame(seed: number, mode: GameState['mode'] = 'standard', label = ''): GameState {
  const s: GameState = {
    version: SAVE_VERSION,
    seed,
    mode,
    label,
    day: 0,
    endDay: 365 * GAME_YEARS,
    startCash: START_CASH,
    cash: START_CASH,
    goldOz: 0,
    goldPrice: 2000,
    priceHistory: [2000],
    loan: 0,
    rng: { s: seed >>> 0 },
    nextId: 1,
    properties: [],
    listings: [],
    unlockedRegions: ['motherlode'],
    notices: [],
    achievements: [],
    stats: {
      holesDrilled: 0,
      metresDrilled: 0,
      ozProduced: 0,
      ozSold: 0,
      bestIntercept: null,
      propertiesBought: 0,
      propertiesSold: 0,
      peakNetWorth: START_CASH,
    },
    regionHype: {},
    gameOver: null,
  };
  const rng = new Rng(s.rng);
  for (let i = 0; i < 4; i++) {
    const l = generateListing(s, rng, 'motherlode');
    l.expiresDay = 60 + i * 15;
    s.listings.push(l);
  }
  notify(s, 'info', 'Welcome to GoldRush', 'Buy a claim from the Land Office, read the ground, drill, and build a mining empire. You have 5 years.', false);
  return s;
}

/** Claim used by the tutorial: shallow, rich creek gravels beside a quartz vein that outcrops. */
export const TUTORIAL_CLAIM_SEED = 164;

/** A normal game with one hand-picked claim for sale and a coach walking the player through it. */
export function newTutorialGame(): GameState {
  const s = newGame(1849, 'tutorial', 'Tutorial');
  s.listings = [
    {
      id: s.nextId++,
      seed: TUTORIAL_CLAIM_SEED,
      region: 'motherlode',
      name: "Prospector's Creek",
      ask: 35_000,
      listedDay: 0,
      expiresDay: 100_000,
      report: [],
      salted: false,
      dd: 'none',
      ddDay: 0,
    },
  ];
  s.tutorial = { step: 0, done: false };
  return s;
}

/** Finish (or skip) the tutorial: the world comes alive with listings and events. */
export function endTutorial(s: GameState) {
  if (!s.tutorial || s.tutorial.done) return;
  s.tutorial.done = true;
  const rng = new Rng(s.rng);
  for (let i = 0; i < 3; i++) s.listings.push(generateListing(s, rng, 'motherlode'));
}

/** Upgrade an older save in place. Returns null if it can't be migrated. */
export function migrateSave(s: GameState): GameState | null {
  if (s.version > SAVE_VERSION) return null;
  for (const p of s.properties) {
    p.mine = { ...newMineState(), ...p.mine };
    p.knowledge.reported ??= {};
    p.knowledge.ob ??= {};
    p.pnl ??= [];
    // old saves stored this pit-only status, which read as if underground crews were missing
    if (p.mine.status === 'No digging equipment') p.mine.status = 'No pit planned';
  }
  s.version = SAVE_VERSION;
  return s;
}

export function dailySeed(date: Date): number {
  return hashString(`goldrush-${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`);
}

function notify(s: GameState, kind: NoticeKind, title: string, body: string, popup: boolean, extra: Partial<GameState['notices'][0]> = {}) {
  s.notices.push({ id: s.nextId++, day: s.day, kind, title, body, popup, ...extra });
  if (s.notices.length > 300) s.notices.splice(0, s.notices.length - 300);
}

function emptyKnowledge(): Knowledge {
  return {
    clues: new Array(GRID_W * GRID_H).fill(-1),
    pans: {},
    soil: {},
    geophys: null,
    assays: {},
    reported: {},
    ob: {},
    holes: [],
    trenches: [],
  };
}

function prop(s: GameState, id: number): Property | undefined {
  return s.properties.find((p) => p.id === id);
}

const fail = (error: string): CommandResult => ({ ok: false, error });
const OK: CommandResult = { ok: true };

function spend(s: GameState, p: Property | null, amount: number, bucket: 'explore' | 'capex' | 'opex' | 'land'): boolean {
  if (s.cash < amount) return false;
  s.cash -= amount;
  if (p) p.ledger[bucket] += amount;
  return true;
}

function laneStart(s: GameState, p: Property, lane: keyof Property['lanes']): number {
  return Math.max(s.day, p.lanes[lane]);
}

export function applyCommand(s: GameState, cmd: Command): CommandResult {
  if (s.gameOver && cmd.type !== 'sellGold') return fail('The game is over.');
  switch (cmd.type) {
    case 'advance': {
      let stopped: string | undefined;
      for (let i = 0; i < cmd.days; i++) {
        const before = s.notices.length;
        advanceDay(s);
        if (s.gameOver) {
          stopped = s.gameOver.reason;
          break;
        }
        const popped = s.notices.slice(before).find((n) => n.popup);
        if (popped && i < cmd.days - 1) {
          stopped = popped.title;
          break;
        }
      }
      return { ok: true, stopped };
    }

    case 'buyListing': {
      const l = s.listings.find((x) => x.id === cmd.listingId);
      if (!l) return fail('Listing no longer available.');
      if (s.cash < l.ask) return fail('Not enough cash.');
      s.cash -= l.ask;
      const p = createProperty(s, l);
      s.properties.push(p);
      s.listings = s.listings.filter((x) => x !== l);
      s.stats.propertiesBought++;
      notify(s, 'good', `Purchased ${p.name}`, `The deed to ${p.name} (${REGIONS[p.region].name}) is yours for $${l.ask.toLocaleString()}.`, false, { propId: p.id });
      return OK;
    }

    case 'dueDiligence': {
      const l = s.listings.find((x) => x.id === cmd.listingId);
      if (!l) return fail('Listing no longer available.');
      if (l.dd !== 'none') return fail('Due diligence already ordered.');
      if (!spend(s, null, COSTS.dueDiligence.cost, 'explore')) return fail('Not enough cash.');
      l.dd = 'pending';
      l.ddDay = s.day + COSTS.dueDiligence.days;
      l.expiresDay = Math.max(l.expiresDay, l.ddDay + 5);
      return OK;
    }

    case 'sellProperty': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const price = appraise(p, s.goldPrice);
      const equip = equipmentValue(p); // owned gear + shaft salvage
      const disturbed = p.mine.mined.some((v) => v > 0) || !!p.mine.shaft;
      const bondBack = disturbed ? Math.round(p.bond * 0.5) : p.bond;
      const total = price + equip + bondBack;
      s.cash += total;
      s.properties = s.properties.filter((x) => x !== p);
      s.stats.propertiesSold++;
      notify(
        s,
        'good',
        `Sold ${p.name}`,
        `Sale price $${price.toLocaleString()} + equipment $${equip.toLocaleString()} + bond refund $${bondBack.toLocaleString()} = $${total.toLocaleString()}.`,
        false,
      );
      return OK;
    }

    case 'walkover':
    case 'walkoverAll': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const spec = cmd.type === 'walkover' ? COSTS.walkover : COSTS.walkoverAll;
      if (!spend(s, p, spec.cost, 'explore')) return fail('Not enough cash.');
      const start = laneStart(s, p, 'field');
      const end = start + spec.days;
      p.lanes.field = end;
      p.jobs.push({ id: s.nextId++, kind: cmd.type, propId: p.id, c: cmd.type === 'walkover' ? ci(cmd.x, cmd.y) : undefined, endDay: end, resultDay: end, done: false });
      return OK;
    }

    case 'pan': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const t = getTruth(p.seed, p.region);
      if (!inBounds(cmd.x, cmd.y) || !t.stream[ci(cmd.x, cmd.y)]) return fail('You can only pan in a stream.');
      if (!spend(s, p, COSTS.pan.cost, 'explore')) return fail('Not enough cash.');
      const start = laneStart(s, p, 'field');
      const end = start + COSTS.pan.days;
      p.lanes.field = end;
      p.jobs.push({ id: s.nextId++, kind: 'pan', propId: p.id, c: ci(cmd.x, cmd.y), endDay: end, resultDay: end, done: false });
      return OK;
    }

    case 'soil': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      if (!spend(s, p, COSTS.soil.cost, 'explore')) return fail('Not enough cash.');
      const start = laneStart(s, p, 'field');
      const end = start + COSTS.soil.days;
      p.lanes.field = end;
      p.jobs.push({ id: s.nextId++, kind: 'soil', propId: p.id, c: ci(cmd.x, cmd.y), endDay: end, resultDay: end + COSTS.soil.labDays, done: false });
      return OK;
    }

    case 'geophys': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      if (p.knowledge.geophys || p.jobs.some((j) => j.kind === 'geophys' && !j.done)) return fail('Survey already done or in progress.');
      if (!spend(s, p, COSTS.geophys.cost, 'explore')) return fail('Not enough cash.');
      const start = laneStart(s, p, 'contractor');
      const end = start + COSTS.geophys.days;
      p.lanes.contractor = end;
      p.jobs.push({ id: s.nextId++, kind: 'geophys', propId: p.id, endDay: end, resultDay: end, done: false });
      return OK;
    }

    case 'trench': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const cells = trenchCells(cmd.x0, cmd.y0, cmd.x1, cmd.y1);
      if (!cells.length) return fail('Invalid trench.');
      const cost = cells.length * COSTS.trench.costPerCell;
      if (!spend(s, p, cost, 'explore')) return fail('Not enough cash.');
      const start = laneStart(s, p, 'field');
      const end = start + Math.ceil(cells.length / COSTS.trench.cellsPerDay);
      p.lanes.field = end;
      p.knowledge.trenches.push({
        id: s.nextId++,
        name: `TR-${p.knowledge.trenches.length + 1}`,
        cells,
        depth: COSTS.trench.layers,
        endDay: end,
        assayDay: end + COSTS.trench.labDays,
        status: 'digging',
      });
      return OK;
    }

    case 'drill': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      if (!inBounds(cmd.x, cmd.y)) return fail('Out of bounds.');
      const depth = Math.max(1, Math.min(GRID_D, Math.round(cmd.depth)));
      const cost = drillCost(depth, cmd.rush);
      if (!spend(s, p, cost, 'explore')) return fail('Not enough cash.');
      const start = laneStart(s, p, 'drill');
      const end = start + drillDays(depth);
      p.lanes.drill = end;
      const n = p.knowledge.holes.filter((h) => !h.name.startsWith('Hist')).length + 1;
      p.knowledge.holes.push({
        id: s.nextId++,
        name: `DH-${String(n).padStart(2, '0')}`,
        c: ci(cmd.x, cmd.y),
        depth,
        endDay: end,
        assayDay: end + (cmd.rush ? COSTS.drill.rushLabDays : COSTS.drill.labDays),
        status: 'drilling',
      });
      s.stats.holesDrilled++;
      s.stats.metresDrilled += depth * LAYER_M;
      return OK;
    }

    case 'applyPermit': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      if (p.permit !== 'none') return fail('Permit already applied for.');
      const total = COSTS.permit.cost + COSTS.permit.bond;
      if (s.cash < total) return fail(`Need $${total.toLocaleString()} (fee + environmental bond).`);
      s.cash -= total;
      p.ledger.capex += COSTS.permit.cost;
      p.bond = COSTS.permit.bond;
      p.permit = 'pending';
      p.permitDay = s.day + REGIONS[p.region].permitDays;
      return OK;
    }

    case 'buyEquipment': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const eq = EQUIPMENT[cmd.equip];
      if (!eq) return fail('Unknown equipment.');
      if (!cmd.lease && !spend(s, p, eq.price, 'capex')) return fail('Not enough cash.');
      p.equipment.push({ id: s.nextId++, type: eq.id, leased: cmd.lease, brokenUntil: 0, boughtDay: s.day });
      return OK;
    }

    case 'sellEquipment': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const u = p.equipment.find((e) => e.id === cmd.unitId);
      if (!u) return fail('No such unit.');
      if (!u.leased) s.cash += resaleValue(u.type);
      p.equipment = p.equipment.filter((e) => e !== u);
      return OK;
    }

    case 'setPit': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const m = p.mine;
      for (const c of cmd.cells) {
        if (c < 0 || c >= m.target.length) continue;
        m.target[c] = Math.max(m.mined[c], Math.min(GRID_D, Math.round(cmd.depth)));
      }
      expandPitSlopes(m.target);
      return OK;
    }

    case 'clearPit': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      p.mine.target = p.mine.mined.slice();
      return OK;
    }

    case 'placeShaft': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      if (p.mine.shaft) return fail('This claim already has a shaft.');
      if (!inBounds(cmd.x, cmd.y)) return fail('Out of bounds.');
      const c = ci(cmd.x, cmd.y);
      if (getTruth(p.seed, p.region).stream[c]) return fail("You can't collar a shaft in a creek.");
      if (p.mine.target[c] > 0 || p.mine.mined[c] > 0) return fail('Collar the shaft outside the pit.');
      if (!spend(s, p, UNDERGROUND.collarCost, 'capex')) return fail(`A headframe and hoist cost ${UNDERGROUND.collarCost.toLocaleString()}.`);
      p.mine.shaft = { c, depth: 0, target: 0, progress: 0, invested: UNDERGROUND.collarCost };
      return OK;
    }

    case 'setShaftDepth': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const sh = p.mine.shaft;
      if (!sh) return fail('Build a headframe first.');
      sh.target = Math.max(sh.depth, Math.min(GRID_D, Math.round(cmd.depth)));
      return OK;
    }

    case 'setStopes': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      const m = p.mine;
      if (!m.shaft) return fail('Stopes are mined from a shaft. Build one first.');
      const model = getModel(modelKey(p), p.knowledge);
      const queued = new Set(m.stopes);
      let added = 0;
      for (const c of cmd.cells) {
        if (c < 0 || c >= GRID_W * GRID_H) continue;
        for (let z = Math.max(0, cmd.zFrom); z <= Math.min(GRID_D - 1, cmd.zTo); z++) {
          const i = vi(cx(c), cy(c), z);
          if (queued.has(i) || !stopeAllowed(m, i)) continue;
          // only stope blocks your model says are ore: selective mining is the point
          if (model.est[i] < m.cutoff || model.conf[i] < 0.2) continue;
          m.stopes.push(i);
          queued.add(i);
          added++;
        }
      }
      sortStopes(m);
      return added > 0 || cmd.cells.length > 1 ? OK : { ok: true, stopped: 'No estimated ore there' };
    }

    case 'setFollowVein': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      p.mine.followVein = cmd.on;
      return OK;
    }

    case 'clearStopes': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      p.mine.stopes = [];
      return OK;
    }

    case 'setCutoff': {
      const p = prop(s, cmd.propId);
      if (!p) return fail('No such property.');
      p.mine.cutoff = Math.max(0, Math.min(MAX_CUTOFF, cmd.cutoff));
      return OK;
    }

    case 'sellGold': {
      const oz = Math.min(cmd.oz, s.goldOz);
      if (oz <= 0) return fail('No gold to sell.');
      s.goldOz -= oz;
      s.cash += oz * s.goldPrice;
      s.stats.ozSold += oz;
      return OK;
    }

    case 'borrow': {
      const room = creditLimit(s) - s.loan;
      if (cmd.amount <= 0) return fail('Invalid amount.');
      if (cmd.amount > room) return fail(`The bank will only lend you $${Math.max(0, room).toLocaleString()} more.`);
      s.loan += cmd.amount;
      s.cash += cmd.amount;
      return OK;
    }

    case 'repay': {
      const amt = Math.min(cmd.amount, s.loan, s.cash);
      if (amt <= 0) return fail('Nothing to repay.');
      const big = s.loan >= 100_000;
      s.loan -= amt;
      s.cash -= amt;
      if (s.loan < 1) {
        s.loan = 0;
        if (big && grant(s, 'debt_free')) notify(s, 'good', 'Achievement: Debt Free', 'You paid off a six-figure loan.', false);
      }
      return OK;
    }
  }
  return fail('Unknown command.');
}

function createProperty(s: GameState, l: Listing): Property {
  const k = emptyKnowledge();
  l.report.forEach((h, i) => {
    k.holes.push({ id: s.nextId++, name: `Hist-${i + 1}`, c: h.c, depth: h.results.length, endDay: s.day, assayDay: s.day, status: 'done' });
    h.results.forEach((g, z) => (k.reported[vi(cx(h.c), cy(h.c), z)] = g));
  });
  return {
    id: s.nextId++,
    name: l.name,
    seed: l.seed,
    region: l.region,
    boughtDay: s.day,
    purchasePrice: l.ask,
    permit: 'none',
    permitDay: 0,
    bond: 0,
    knowledge: k,
    jobs: [],
    lanes: { field: 0, drill: 0, contractor: 0 },
    equipment: [],
    mine: newMineState(),
    ledger: { land: l.ask, explore: 0, capex: 0, opex: 0, revenue: 0 },
    pnl: [],
  };
}

/**
 * Cover a negative cash balance: sell gold, then borrow, then the bank seizes and
 * sells owned equipment (cheapest first). Returns false only when nothing is left.
 */
function coverOverdraft(s: GameState): boolean {
  if (s.goldOz > 0) {
    const oz = Math.min(s.goldOz, -s.cash / s.goldPrice + 0.001);
    s.goldOz -= oz;
    s.cash += oz * s.goldPrice;
    s.stats.ozSold += oz;
    notify(s, 'warn', 'Gold sold to cover bills', `${oz.toFixed(1)} oz sold at $${Math.round(s.goldPrice)}/oz.`, false);
    if (s.cash >= 0) return true;
  }
  const room = creditLimit(s) - s.loan;
  const need = -s.cash;
  if (room >= need) {
    s.loan += need;
    s.cash = 0;
    const recent = s.notices.some((n) => n.title === 'Overdraft covered by bank' && n.day > s.day - 14);
    if (!recent) notify(s, 'warn', 'Overdraft covered by bank', `The bank is lending you money to cover bills. Loan is now $${Math.round(s.loan).toLocaleString()}.`, false);
    return true;
  }
  if (room > 0) {
    s.loan += room;
    s.cash += room;
  }
  const owned = s.properties
    .flatMap((p) => p.equipment.filter((u) => !u.leased).map((u) => ({ p, u })))
    .sort((a, b) => resaleValue(a.u.type) - resaleValue(b.u.type));
  for (const { p, u } of owned) {
    if (s.cash >= 0) break;
    const v = resaleValue(u.type);
    s.cash += v;
    p.equipment = p.equipment.filter((e) => e !== u);
    notify(s, 'warn', `Repossessed: ${EQUIPMENT[u.type].name}`, `The bank seized and sold equipment at ${p.name} for $${v.toLocaleString()}.`, true, { propId: p.id });
  }
  return s.cash >= 0;
}

/** Advance the world by one day. */
export function advanceDay(s: GameState) {
  const rng = new Rng(s.rng);
  s.day++;
  s.goldPrice = stepGoldPrice(s.goldPrice, rng);

  for (const p of s.properties) {
    const t = getTruth(p.seed, p.region);
    const k = p.knowledge;

    for (const j of p.jobs) {
      if (j.done || j.resultDay > s.day) continue;
      j.done = true;
      switch (j.kind) {
        case 'walkover':
          revealWalkover(k, t, cx(j.c!), cy(j.c!), COSTS.walkover.radius);
          break;
        case 'walkoverAll':
          for (let c = 0; c < GRID_W * GRID_H; c++) k.clues[c] = t.clue[c];
          notify(s, 'info', `${p.name}: walk-over complete`, 'Your geologist has mapped every outcrop and surface clue on the claim.', false, { propId: p.id });
          break;
        case 'pan':
          k.pans[j.c!] = panColors(t, j.c!, rng);
          break;
        case 'soil': {
          for (const c of soilGridCells(cx(j.c!), cy(j.c!))) k.soil[c] = soilSample(t, cx(c), cy(c), rng);
          notify(s, 'info', `${p.name}: soil assays back`, 'Soil geochemistry results are on the map (Soil overlay).', false, { propId: p.id });
          break;
        }
        case 'geophys':
          k.geophys = geophysSurvey(t, rng);
          notify(s, 'info', `${p.name}: IP survey complete`, 'Chargeability data is on the map (Geophysics overlay). Watch for false anomalies.', false, { propId: p.id });
          break;
        case 'permit':
          break;
      }
    }
    p.jobs = p.jobs.filter((j) => !j.done || j.resultDay > s.day - 30);

    for (const h of k.holes) {
      if (h.status === 'drilling' && h.endDay <= s.day) h.status = 'lab';
      if (h.status === 'lab' && h.assayDay <= s.day) {
        h.status = 'done';
        revealColumn(k, t, h.c, h.depth);
        const grades: number[] = [];
        for (let z = 0; z < h.depth; z++) grades.push(k.assays[vi(cx(h.c), cy(h.c), z)]);
        const bi = bestIntercept(grades);
        if (bi && (!s.stats.bestIntercept || bi.grade * bi.metres > s.stats.bestIntercept.grade * s.stats.bestIntercept.metres)) {
          s.stats.bestIntercept = { grade: bi.grade, metres: bi.metres, hole: h.name, prop: p.name };
        }
        const headline = bi ? `${bi.metres} m @ ${bi.grade.toFixed(2)} g/t from ${bi.from} m` : 'No significant intercepts';
        notify(s, 'assay', `${p.name} ${h.name}: ${headline}`, headline, true, { propId: p.id, holeId: h.id });
      }
    }
    for (const tr of k.trenches) {
      if (tr.status === 'digging' && tr.endDay <= s.day) tr.status = 'lab';
      if (tr.status === 'lab' && tr.assayDay <= s.day) {
        tr.status = 'done';
        let best = 0;
        for (const c of tr.cells) {
          revealColumn(k, t, c, tr.depth);
          for (let z = 0; z < tr.depth; z++) best = Math.max(best, k.assays[vi(cx(c), cy(c), z)]);
        }
        notify(s, 'assay', `${p.name} ${tr.name}: best sample ${best.toFixed(2)} g/t`, `Channel samples from ${tr.cells.length} cells.`, true, { propId: p.id, trenchId: tr.id });
      }
    }

    if (p.permit === 'pending' && p.permitDay <= s.day) {
      p.permit = 'granted';
      notify(s, 'good', `${p.name}: mining permit granted`, 'You may now dig. Plan a pit, buy equipment, and start production.', true, { propId: p.id });
    }

    // Mining & milling
    const r = mineDay(p, t, s.day, rng);
    s.cash -= r.opex + r.capex;
    p.ledger.opex += r.opex;
    p.ledger.capex += r.capex;
    if (r.shaftLevel !== null && p.mine.shaft && r.shaftLevel === p.mine.shaft.target) {
      notify(s, 'good', `${p.name}: shaft bottomed at ${r.shaftLevel * LAYER_M} m`, 'The station is cut. Underground crews can stope every level above it.', false, { propId: p.id });
    }
    if (r.goldG > 0) {
      const oz = gramsToOz(r.goldG);
      s.goldOz += oz;
      s.stats.ozProduced += oz;
      p.ledger.revenue += oz * s.goldPrice;
    }
    for (const b of r.breakdowns) {
      notify(s, 'warn', `${p.name}: ${EQUIPMENT[b.unit.type].name} broke down`, b.repair ? `Repairs cost $${b.repair.toLocaleString()}.` : 'The leasing company is fixing it.', false, { propId: p.id });
    }
    if (r.bigBlock && r.bigBlock.grade >= 20) {
      const who = r.bigBlock.underground ? 'The stope crew just blasted into' : 'The shovel just bit into';
      notify(s, 'good', `${p.name}: bonanza block!`, `${who} ${r.bigBlock.grade.toFixed(1)} g/t ore at ${(r.bigBlock.z + 1) * LAYER_M} m.`, false, { propId: p.id });
    }

    const fixed = CLAIM_FEE_PER_DAY + dailyLeaseCost(p);
    s.cash -= fixed;
    p.ledger.opex += fixed;
    (p.pnl ??= []).push({ day: s.day, rev: gramsToOz(r.goldG) * s.goldPrice, cost: r.opex + r.capex + fixed });
    if (p.pnl.length > 30) p.pnl.shift();
  }

  for (const l of s.listings) {
    if (l.dd === 'pending' && l.ddDay <= s.day) {
      l.dd = 'done';
      l.ddResult = dueDiligenceReport(l);
      if (l.salted && l.report.length && grant(s, 'salt_sniffer')) {
        notify(s, 'good', 'Achievement: Salt Sniffer', 'You caught a salted drill report before buying.', false);
      }
      notify(s, 'info', `Due diligence: ${l.name}`, l.ddResult, true);
    }
  }

  if (s.loan > 0) s.loan += (s.loan * LOAN_APR) / 365;

  // keep the world calm while the tutorial is teaching the basics
  const tutorialRunning = s.tutorial !== undefined && !s.tutorial.done;
  if (!tutorialRunning) {
    const ev = rollEvent(s, rng);
    if (ev) notify(s, ev.kind, ev.title, ev.body, false, { propId: ev.propId });
    refreshMarket(s, rng);
  }
  s.priceHistory.push(Math.round(s.goldPrice * 100) / 100);

  if (s.cash < 0 && !coverOverdraft(s)) {
    s.gameOver = { reason: 'Bankrupt! The bank has called in your loans.', netWorth: netWorth(s) };
    return;
  }

  const w = netWorth(s);
  s.stats.peakNetWorth = Math.max(s.stats.peakNetWorth, w);
  for (const id of REGION_ORDER) {
    const reg = REGIONS[id];
    if (!s.unlockedRegions.includes(id) && s.stats.peakNetWorth >= reg.unlockNetWorth) {
      s.unlockedRegions.push(id);
      s.listings.push(generateListing(s, rng, id));
      notify(s, 'good', `New region: ${reg.name}`, reg.blurb, true);
    }
  }
  for (const id of checkAchievements(s, w)) {
    const a = ACHIEVEMENTS.find((x) => x.id === id)!;
    notify(s, 'good', `Achievement: ${a.name}`, a.desc, false);
  }

  if (s.day >= s.endDay) {
    s.gameOver = { reason: `${GAME_YEARS} years are up!`, netWorth: w };
  }
}

