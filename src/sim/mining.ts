// Daily mine + mill simulation for one property: open pit, underground stoping
// from a shaft, and the processing plant they both feed.
import { BREAKDOWN_CHANCE, EQUIPMENT } from './equipment';
import { GRAMS_PER_OZ, GRID_D, GRID_H, GRID_W, ROCK_HARDNESS, Rock, blockTonnes, ci, cx, cy, inBounds, vi, type WorldTruth } from './geology/types';
import { type BlockModel, getModelStale, modelKey } from './estimate';
import { REGIONS, isWinter } from './regions';
import type { Rng } from './rng';
import type { EquipmentUnit, MineState, Property } from './state';

export const BLAST_COST_PER_T = 1.8;
/** Highest cutoff (g/t) the player may set; in-game breakeven grades sit well below this. */
export const MAX_CUTOFF = 2.5;
/** Deeper pits mean longer hauls: slower digging and higher cost per tonne per layer of depth. */
export const HAUL_SLOWDOWN_PER_LAYER = 0.08;
export const HAUL_COST_PER_T_PER_LAYER = 0.35;
const SLOPE = 2; // layers of depth difference allowed between neighbouring columns

export const UNDERGROUND = {
  collarCost: 350_000, // headframe, hoist, collar
  sinkCostPerLayer: 22_000,
  sinkDaysPerLayer: 3,
  hoistTpd: 1_400, // max tonnes the shaft can hoist per day
  hoistOpexPerDay: 1_800,
  costPerT: 18, // ground support, ventilation, explosives
  driftCostPerCell: 1_200, // development cost per cell of horizontal distance from the shaft
  crownPillar: 2, // layers of rock left between pit floor (or surface) and a stope
  shaftSalvage: 0.4, // fraction of shaft investment a buyer pays for
};

export function newMineState(): MineState {
  return {
    target: new Array(GRID_W * GRID_H).fill(0),
    mined: new Array(GRID_W * GRID_H).fill(0),
    progressT: 0,
    cutoff: 0.5,
    gravel: { t: 0, g: 0 },
    rock: { t: 0, g: 0 },
    haltedUntil: 0,
    status: 'Idle',
    oreT: 0,
    wasteT: 0,
    goldG: 0,
    shaft: null,
    stopes: [],
    stoped: {},
    ugProgressT: 0,
    ugHaltedUntil: 0,
    ugStatus: 'No shaft',
    ugOreT: 0,
    ugWasteT: 0,
    followVein: true,
  };
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Deepen neighbouring columns so pit walls stay stable (~45 degrees). */
export function expandPitSlopes(target: number[]) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let c = 0; c < target.length; c++) {
      const need = target[c] - SLOPE;
      if (need <= 0) continue;
      for (const [dx, dy] of NEIGHBORS) {
        const x = cx(c) + dx;
        const y = cy(c) + dy;
        if (!inBounds(x, y)) continue;
        const n = ci(x, y);
        if (target[n] < need) {
          target[n] = need;
          changed = true;
        }
      }
    }
  }
}

/**
 * Next block to dig that respects wall slopes. With a block model, the pit "drops in" toward the
 * richest ore it can reach (what a mine planner would schedule); otherwise it strips bench by bench.
 */
export function nextBlock(m: MineState, model?: BlockModel): { c: number; z: number } | null {
  let best: { c: number; z: number } | null = null;
  let bestScore = -Infinity;
  for (let c = 0; c < m.target.length; c++) {
    const z = m.mined[c];
    if (z >= m.target[c] || z >= GRID_D) continue;
    let ok = true;
    for (const [dx, dy] of NEIGHBORS) {
      const x = cx(c) + dx;
      const y = cy(c) + dy;
      if (inBounds(x, y) && m.mined[ci(x, y)] < z + 1 - SLOPE) ok = false;
    }
    if (!ok) continue;
    let value = 0;
    if (model) {
      // ore reachable from here within the next few benches, nearer benches weighted higher
      for (let k = 0; k < 3 && z + k < m.target[c]; k++) {
        const i = vi(cx(c), cy(c), z + k);
        if (model.conf[i] > 0.15 && model.est[i] >= m.cutoff) value += (model.est[i] - m.cutoff + 0.5) / (k + 1);
      }
    }
    const score = value * 10 - z;
    if (score > bestScore) {
      bestScore = score;
      best = { c, z };
    }
  }
  return best;
}

export function pitBlocksRemaining(m: MineState): number {
  let n = 0;
  for (let c = 0; c < m.target.length; c++) n += Math.max(0, m.target[c] - m.mined[c]);
  return n;
}

/** Horizontal distance (cells) from the shaft to a column. */
export function driftDistance(m: MineState, c: number): number {
  if (!m.shaft) return 0;
  return Math.abs(cx(c) - cx(m.shaft.c)) + Math.abs(cy(c) - cy(m.shaft.c));
}

/** Can this voxel be added to the stope plan? */
export function stopeAllowed(m: MineState, i: number): boolean {
  const c = i % (GRID_W * GRID_H);
  const z = Math.floor(i / (GRID_W * GRID_H));
  return z >= m.mined[c] + UNDERGROUND.crownPillar && !m.stoped[i];
}

/** Sort the stope queue: nearest the shaft first, then shallowest. */
export function sortStopes(m: MineState) {
  const key = (i: number) => {
    const c = i % (GRID_W * GRID_H);
    const z = Math.floor(i / (GRID_W * GRID_H));
    return driftDistance(m, c) * 100 + z;
  };
  m.stopes.sort((a, b) => key(a) - key(b));
}

/** Ore found underground: queue the surrounding blocks (faces + edges) so crews chase the vein. */
export function followOre(m: MineState, i: number) {
  const c = i % (GRID_W * GRID_H);
  const x0 = cx(c);
  const y0 = cy(c);
  const z0 = Math.floor(i / (GRID_W * GRID_H));
  const queued = new Set(m.stopes);
  let added = false;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const n = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        // faces, plus up/down-dip diagonals; skip flat diagonals and corners to limit dilution
        if (n === 0 || n === 3 || (n === 2 && dz === 0)) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        const z = z0 + dz;
        if (!inBounds(x, y) || z < 0 || z >= GRID_D) continue;
        const j = vi(x, y, z);
        if (queued.has(j) || !stopeAllowed(m, j)) continue;
        m.stopes.push(j);
        queued.add(j);
        added = true;
      }
  if (added) sortStopes(m);
}

const isGravel = (rock: number) => rock === Rock.Overburden || rock === Rock.Paystreak;

export interface MineDayResult {
  opex: number;
  capex: number;
  goldG: number;
  blocks: number;
  ugBlocks: number;
  shaftLevel: number | null; // set on the day the shaft reaches a new level
  breakdowns: { unit: EquipmentUnit; repair: number }[];
  bigBlock: { grade: number; c: number; z: number; underground: boolean } | null;
}

function working(u: EquipmentUnit, day: number) {
  return u.brokenUntil <= day;
}

function recordBlock(p: Property, t: WorldTruth, i: number, res: MineDayResult, underground: boolean) {
  const m = p.mine;
  const rock = t.rock[i];
  const tonnes = blockTonnes(rock);
  const g = t.grade[i];
  p.knowledge.assays[i] = Math.round(g * 100) / 100; // grade control reveals truth
  const col = i % (GRID_W * GRID_H);
  if (Math.floor(i / (GRID_W * GRID_H)) >= t.overburden[col]) (p.knowledge.ob ??= {})[col] = t.overburden[col];
  if (g >= m.cutoff) {
    const pile = isGravel(rock) ? m.gravel : m.rock;
    pile.t += tonnes;
    pile.g += tonnes * g;
    if (underground) m.ugOreT += tonnes;
    else m.oreT += tonnes;
    if (!res.bigBlock || g > res.bigBlock.grade) {
      const c = i % (GRID_W * GRID_H);
      res.bigBlock = { grade: g, c, z: Math.floor(i / (GRID_W * GRID_H)), underground };
    }
  } else if (underground) m.ugWasteT += tonnes;
  else m.wasteT += tonnes;
}

export function mineDay(p: Property, t: WorldTruth, day: number, rng: Rng): MineDayResult {
  const m = p.mine;
  const res: MineDayResult = { opex: 0, capex: 0, goldG: 0, blocks: 0, ugBlocks: 0, shaftLevel: null, breakdowns: [], bigBlock: null };
  const used = new Set<EquipmentUnit>();
  const has = (kind: string) => p.equipment.some((e) => EQUIPMENT[e.type].kind === kind);

  // Vault is a standing cost.
  for (const u of p.equipment) if (u.type === 'vault') res.opex += EQUIPMENT.vault.opexPerDay;

  if (p.permit !== 'granted') {
    m.status = p.permit === 'pending' ? 'Waiting for mining permit' : 'No mining permit';
    m.ugStatus = m.shaft ? 'Waiting for mining permit' : 'No shaft';
    return res;
  }

  const halted = m.haltedUntil > day;
  const winter = isWinter(REGIONS[p.region], day);
  const pumps = p.equipment.filter((e) => e.type === 'pump' && working(e, day));
  let pumping = false;

  // --- Open pit (frozen in winter) ---------------------------------------------
  const diggers = p.equipment.filter((e) => EQUIPMENT[e.type].kind === 'dig' && working(e, day));
  const schedule = diggers.length > 0 && pitBlocksRemaining(m) > 0 ? getModelStale(modelKey(p), p.knowledge) : undefined;
  let stall = '';
  if (halted) stall = `Halted until day ${m.haltedUntil}`;
  else if (winter) stall = 'Winter: ground frozen';
  else {
    let dayLeft = 1;
    while (dayLeft > 1e-6 && diggers.length > 0) {
      const b = nextBlock(m, schedule);
      if (!b) {
        stall = pitBlocksRemaining(m) === 0 ? (m.target.some((v) => v > 0) ? 'Pit plan complete' : 'No pit planned') : 'Pit blocked';
        break;
      }
      const i = vi(cx(b.c), cy(b.c), b.z);
      if (m.stoped[i]) {
        m.mined[b.c]++; // pit breaks into an old stope: nothing to dig
        continue;
      }
      const rock = t.rock[i];
      const wet = b.z >= t.waterTable[b.c];
      if (wet && pumps.length === 0) {
        stall = 'Flooded: buy pumps to dig below the water table';
        break;
      }
      if (wet) pumping = true;
      const able = diggers.filter((u) => (EQUIPMENT[u.type].maxDepth ?? 0) > b.z);
      if (able.length === 0) {
        stall = `Too deep (${(b.z + 1) * 5} m) for your diggers`;
        break;
      }
      let rate = 0;
      for (const u of able) {
        const hard = ROCK_HARDNESS[rock] * (u.type === 'shovel' && !isGravel(rock) ? 5 : 1);
        rate += EQUIPMENT[u.type].capacity / hard;
        used.add(u);
      }
      rate /= 1 + HAUL_SLOWDOWN_PER_LAYER * b.z;
      const tonnes = blockTonnes(rock);
      const need = (tonnes - m.progressT) / rate;
      if (need > dayLeft) {
        m.progressT += rate * dayLeft;
        dayLeft = 0;
        break;
      }
      dayLeft -= need;
      m.progressT = 0;
      m.mined[b.c]++;
      res.blocks++;
      if (!isGravel(rock)) res.opex += tonnes * BLAST_COST_PER_T;
      res.opex += tonnes * HAUL_COST_PER_T_PER_LAYER * b.z;
      recordBlock(p, t, i, res, false);
    }
  }
  if (!pumping && pumps.length) {
    // keep pumping if the pit floor is already below the water table
    for (let c = 0; c < m.mined.length && !pumping; c++) if (m.mined[c] > t.waterTable[c]) pumping = true;
  }

  // --- Underground (works through winter) --------------------------------------
  const crews = p.equipment.filter((e) => EQUIPMENT[e.type].kind === 'ug' && working(e, day));
  let hoisted = false;
  let ugStall = '';
  const sh = m.shaft;
  if (!sh) ugStall = 'No shaft';
  else if (halted || m.ugHaltedUntil > day) ugStall = `Halted until day ${Math.max(m.haltedUntil, m.ugHaltedUntil)}`;
  else {
    // Shaft sinking
    if (sh.depth < sh.target) {
      const wet = sh.depth >= t.waterTable[sh.c];
      if (wet && pumps.length === 0) ugStall = 'Shaft flooded: buy pumps to sink below the water table';
      else {
        if (wet) pumping = true;
        const daily = UNDERGROUND.sinkCostPerLayer / UNDERGROUND.sinkDaysPerLayer;
        res.capex += daily;
        sh.invested += daily;
        sh.progress++;
        if (sh.progress >= UNDERGROUND.sinkDaysPerLayer) {
          sh.progress = 0;
          // sinking through rock reveals the shaft column
          const i = vi(cx(sh.c), cy(sh.c), sh.depth);
          p.knowledge.assays[i] = Math.round(t.grade[i] * 100) / 100;
          m.stoped[i] = 1;
          m.stopes = m.stopes.filter((s) => s !== i);
          sh.depth++;
          res.shaftLevel = sh.depth;
        }
      }
    }
    // Stoping
    let budget = Math.min(
      UNDERGROUND.hoistTpd,
      crews.reduce((s, u) => s + EQUIPMENT[u.type].capacity, 0),
    );
    if (crews.length === 0) ugStall ||= sh.depth < sh.target ? `Sinking shaft: ${sh.depth * 5} m of ${sh.target * 5} m` : 'No underground crew';
    while (budget > 1e-6 && crews.length > 0) {
      const i = m.stopes.find((s) => Math.floor(s / (GRID_W * GRID_H)) < sh.depth && stopeAllowed(m, s));
      if (i === undefined) {
        ugStall ||=
          m.stopes.length === 0
            ? 'No stopes planned'
            : sh.depth < sh.target
              ? `Sinking shaft: ${sh.depth * 5} m of ${sh.target * 5} m`
              : 'Stopes below the shaft: sink it deeper';
        break;
      }
      const c = i % (GRID_W * GRID_H);
      const z = Math.floor(i / (GRID_W * GRID_H));
      if (z >= t.waterTable[c]) {
        if (pumps.length === 0) {
          ugStall = 'Workings flooded: buy pumps';
          break;
        }
        pumping = true;
      }
      for (const u of crews) used.add(u);
      hoisted = true;
      const rock = t.rock[i];
      const tonnes = blockTonnes(rock);
      const hard = Math.max(0.6, ROCK_HARDNESS[rock]);
      const need = (tonnes - m.ugProgressT) * hard;
      if (need > budget) {
        m.ugProgressT += budget / hard;
        budget = 0;
        break;
      }
      budget -= need;
      m.ugProgressT = 0;
      m.stopes = m.stopes.filter((s) => s !== i);
      m.stoped[i] = 1;
      res.ugBlocks++;
      res.opex += tonnes * UNDERGROUND.costPerT + driftDistance(m, c) * UNDERGROUND.driftCostPerCell;
      recordBlock(p, t, i, res, true);
      if (m.followVein && t.grade[i] >= m.cutoff) followOre(m, i);
    }
    if (hoisted) res.opex += UNDERGROUND.hoistOpexPerDay;
  }
  if (pumping) for (const u of pumps) used.add(u);

  // --- Processing (mills run year-round) ---------------------------------------
  const mills = p.equipment
    .filter((e) => EQUIPMENT[e.type].kind === 'process' && working(e, day))
    .sort((a, b) => EQUIPMENT[b.type].recovery!.rock - EQUIPMENT[a.type].recovery!.rock);
  let processed = 0;
  if (!halted) {
    for (const u of mills) {
      const eq = EQUIPMENT[u.type];
      let cap = eq.capacity;
      const piles = eq.recovery!.rock > 0 ? [m.rock, m.gravel] : [m.gravel];
      for (const pile of piles) {
        if (cap <= 0 || pile.t <= 0) continue;
        const take = Math.min(cap, pile.t);
        const grade = pile.g / pile.t;
        const rec = pile === m.rock ? eq.recovery!.rock : eq.recovery!.gravel;
        res.goldG += take * grade * rec;
        pile.g -= take * grade;
        pile.t -= take;
        if (pile.t < 1e-6) pile.t = pile.g = 0;
        cap -= take;
        processed += take;
        used.add(u);
      }
    }
  }
  m.goldG += res.goldG;

  for (const u of used) {
    res.opex += EQUIPMENT[u.type].opexPerDay;
    if (rng.chance(BREAKDOWN_CHANCE)) {
      u.brokenUntil = day + rng.int(2, 8);
      const repair = u.leased ? 0 : Math.round(EQUIPMENT[u.type].price * 0.03);
      res.breakdowns.push({ unit: u, repair });
      res.opex += repair;
    }
  }

  const stock = m.gravel.t + m.rock.t;
  if (stall) m.status = stall;
  else if (res.blocks > 0 || diggers.length > 0) m.status = 'Mining';
  else if (has('dig')) m.status = 'Diggers under repair';
  // underground crews never work the pit, so don't imply they're missing
  else m.status = pitBlocksRemaining(m) === 0 ? 'No pit planned' : 'No open-pit diggers (shovel crew, backhoe or fleet)';
  if (processed > 0 && m.status !== 'Mining') m.status += ` - milling stockpile (${Math.round(stock)} t left)`;
  else if (stock > 0 && mills.length === 0 && !has('process')) m.status += ' - ore stockpiled, no mill';
  m.ugStatus = ugStall || (hoisted ? 'Stoping' : 'Idle');
  return res;
}

export function gramsToOz(g: number) {
  return g / GRAMS_PER_OZ;
}
