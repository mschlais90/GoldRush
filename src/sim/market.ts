// Property listings: asking price, seller's (sometimes salted) drill reports.
import { GRID_D, GRID_W, GRID_H, vi } from './geology/types';
import { landBase } from './economy';
import { bestIntercept } from './prospecting';
import { REGIONS } from './regions';
import type { Rng } from './rng';
import type { GameState, Listing } from './state';
import { getTruth } from './truth';
import type { RegionId } from './geology/types';

const ADJ = ['Lucky', 'Golden', 'Lost', 'Rattlesnake', 'Hidden', 'Widow\'s', 'Silver', 'Eagle', 'Copper', 'Last Chance', 'Bonanza', 'Dutchman\'s', 'Sunrise', 'Blue', 'Red Dog', 'Grizzly', 'Coyote', 'Iron', 'Crooked', 'Deadwood'];
const NOUN = ['Gulch', 'Creek', 'Ridge', 'Flats', 'Hollow', 'Bar', 'Hill', 'Canyon', 'Draw', 'Mesa', 'Lode', 'Claim', 'Bench', 'Fork', 'Basin'];

export function propertyName(rng: Rng): string {
  return `${rng.pick(ADJ)} ${rng.pick(NOUN)}`;
}

export function generateListing(s: GameState, rng: Rng, region: RegionId): Listing {
  const seed = rng.int(1, 2 ** 31 - 2);
  const t = getTruth(seed, region);
  const report: Listing['report'] = [];
  let salted = false;
  if (rng.chance(0.45)) {
    salted = rng.chance(0.3);
    const n = rng.int(1, 3);
    // sellers drill where things look promising
    const interesting: number[] = [];
    for (let c = 0; c < GRID_W * GRID_H; c++) if (t.clue[c] >= 2) interesting.push(c);
    for (let h = 0; h < n; h++) {
      const c = interesting.length && rng.chance(0.7) ? rng.pick(interesting) : rng.int(0, GRID_W * GRID_H - 1);
      const depth = rng.int(8, 16);
      const x = c % GRID_W;
      const y = Math.floor(c / GRID_W);
      const results: number[] = [];
      for (let z = 0; z < Math.min(depth, GRID_D); z++) {
        let g = t.grade[vi(x, y, z)];
        if (salted && z >= 2 && z < 7) g = g * rng.range(4, 10) + rng.range(1.5, 6);
        results.push(Math.round(g * 100) / 100);
      }
      report.push({ c, results });
    }
  }
  let hype = 0;
  for (const h of report) {
    const bi = bestIntercept(h.results);
    if (bi) hype += bi.grade * bi.metres;
  }
  const regionHype = s.regionHype[region] ?? 1;
  const base = landBase({ region }) * rng.range(0.7, 1.35);
  const ask = Math.round(((base + hype * 900 * REGIONS[region].landPriceMult) * regionHype) / 500) * 500;
  return {
    id: s.nextId++,
    seed,
    region,
    name: propertyName(rng),
    ask,
    listedDay: s.day,
    expiresDay: s.day + rng.int(40, 90),
    report,
    salted,
    dd: 'none',
    ddDay: 0,
  };
}

export function refreshMarket(s: GameState, rng: Rng) {
  s.listings = s.listings.filter((l) => l.expiresDay > s.day);
  const target = 6;
  if (s.listings.length < target && (s.day % 7 === 0 || s.listings.length < 3)) {
    const region = rng.pick(s.unlockedRegions);
    s.listings.push(generateListing(s, rng, region));
  }
}

/** Results of a due-diligence visit: checks the seller's claims and summarizes surface geology. */
export function dueDiligenceReport(l: Listing): string {
  const t = getTruth(l.seed, l.region);
  const counts = new Map<number, number>();
  for (let c = 0; c < GRID_W * GRID_H; c++) counts.set(t.clue[c], (counts.get(t.clue[c]) ?? 0) + 1);
  const parts: string[] = [];
  const q = (counts.get(2) ?? 0) + (counts.get(3) ?? 0);
  if (q) parts.push(`${q} quartz outcrop${q > 1 ? 's' : ''}`);
  if (counts.get(3)) parts.push('visible gold in outcrop');
  if (counts.get(4)) parts.push(`${counts.get(4)} gossan patches`);
  if (counts.get(5)) parts.push(`${counts.get(5)} patches of stressed vegetation`);
  if (counts.get(6)) parts.push(`${counts.get(6)} old workings`);
  let s = `Geologist's walk-through noted: ${parts.length ? parts.join(', ') : 'nothing of interest'}.`;
  if (l.report.length) {
    let reported = 0;
    let actual = 0;
    for (const h of l.report) {
      const x = h.c % GRID_W;
      const y = Math.floor(h.c / GRID_W);
      h.results.forEach((g, z) => {
        reported += g;
        actual += t.grade[vi(x, y, z)];
      });
    }
    const ratio = actual / Math.max(0.01, reported);
    s +=
      ratio < 0.5
        ? ` Re-assay of the seller's core came back ${Math.round((1 - ratio) * 100)}% LOWER than reported. These samples were SALTED!`
        : ' Re-assay of the seller\'s core confirms the reported grades.';
  }
  return s;
}

export function columnLabel(c: number): string {
  return `(${(c % GRID_W) + 1}, ${Math.floor(c / GRID_W) + 1})`;
}
