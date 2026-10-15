import { EQUIPMENT, LEASE_RATE, resaleValue } from './equipment';
import { getModel, modelKey, ounces, resourceReport } from './estimate';
import { UNDERGROUND } from './mining';
import { REGIONS } from './regions';
import type { Rng } from './rng';
import type { GameState, Property } from './state';

export const BASE_GOLD_PRICE = 2000;
export const LOAN_APR = 0.09;
export const CLAIM_FEE_PER_DAY = 25;

export function stepGoldPrice(price: number, rng: Rng): number {
  const drift = 0.0015 * Math.log(BASE_GOLD_PRICE / price);
  return price * Math.exp(drift + rng.normal(0, 0.011));
}

export { modelKey };

export function landBase(p: { region: Property['region'] }): number {
  return 30_000 * REGIONS[p.region].landPriceMult;
}

const appraisalCache = new Map<string, { n: number; mined: number; measured: number; indicated: number; inferred: number }>();

/**
 * What a buyer would pay today for the claim, based on *your* data. Buyers pay
 * a small fraction of in-ground value, and much less for interpolated ounces.
 */
export function appraise(p: Property, goldPrice: number): number {
  const key = modelKey(p);
  // Refresh on new exploration results, and every ~40 blocks of mining (grade control alone shouldn't force a rebuild daily).
  const k = p.knowledge;
  const n = k.holes.filter((h) => h.status === 'done').length * 1000 + k.trenches.filter((t) => t.status === 'done').length;
  const dug = p.mine.mined.reduce((a, b) => a + b, 0) + Object.keys(p.mine.stoped ?? {}).length;
  const mined = Math.floor(dug / 40);
  let hit = appraisalCache.get(key);
  if (!hit || hit.n !== n || hit.mined !== mined) {
    const r = resourceReport(getModel(key, p.knowledge, true), 0.5, p.mine);
    hit = { n, mined, measured: ounces(r.measured), indicated: ounces(r.indicated), inferred: ounces(r.inferred) };
    appraisalCache.set(key, hit);
    if (appraisalCache.size > 64) appraisalCache.delete(appraisalCache.keys().next().value!);
  }
  const perOz = goldPrice * (hit.measured * 0.06 + hit.indicated * 0.035 + hit.inferred * 0.008);
  return Math.round(landBase(p) + perOz);
}
/** Resale value of owned equipment plus what a buyer pays for an existing shaft. */
export function equipmentValue(p: Property): number {
  const shaft = p.mine.shaft ? p.mine.shaft.invested * UNDERGROUND.shaftSalvage : 0;
  return Math.round(shaft + p.equipment.filter((e) => !e.leased).reduce((s, e) => s + resaleValue(e.type), 0));
}

export function netWorth(s: GameState): number {
  let w = s.cash + s.goldOz * s.goldPrice - s.loan;
  for (const p of s.properties) w += appraise(p, s.goldPrice) + equipmentValue(p) + p.bond;
  return Math.round(w);
}

export function creditLimit(s: GameState): number {
  let lim = 60_000;
  for (const p of s.properties) lim += 0.5 * equipmentValue(p) + 0.5 * appraise(p, s.goldPrice);
  return Math.round(lim);
}

export function dailyLeaseCost(p: Property): number {
  return p.equipment
    .filter((e) => e.leased)
    .reduce((s, e) => s + EQUIPMENT[e.type].price * LEASE_RATE, 0);
}

/** Internal rate of return implied by growing startCash to netWorth over `days`. */
export function annualizedReturn(start: number, end: number, days: number): number {
  if (days <= 0 || start <= 0) return 0;
  if (end <= 0) return -1;
  return Math.pow(end / start, 365 / days) - 1;
}
