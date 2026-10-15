import type { Archetype, RegionId } from './geology/types';

export interface Region {
  id: RegionId;
  name: string;
  blurb: string;
  archetypeWeights: Record<Archetype, number>;
  streamChance: number;
  landPriceMult: number;
  permitDays: number;
  /** Day-of-year ranges when ground is frozen and mining halts. */
  winter?: [number, number];
  unlockNetWorth: number;
}

export const REGIONS: Record<RegionId, Region> = {
  motherlode: {
    id: 'motherlode',
    name: 'Mother Lode, California',
    blurb: 'Classic quartz veins and rich creek gravels. A good place to learn.',
    archetypeWeights: { vein: 0.45, placer: 0.35, pocket: 0.1, porphyry: 0.1 },
    streamChance: 0.9,
    landPriceMult: 1,
    permitDays: 30,
    unlockNetWorth: 0,
  },
  klondike: {
    id: 'klondike',
    name: 'Klondike, Yukon',
    blurb: 'Placer country. Cheap claims, rich gravels, but the ground freezes Nov-Mar.',
    archetypeWeights: { placer: 0.7, vein: 0.2, pocket: 0.1, porphyry: 0 },
    streamChance: 1,
    landPriceMult: 0.8,
    permitDays: 20,
    winter: [305, 90],
    unlockNetWorth: 400_000,
  },
  nevada: {
    id: 'nevada',
    name: 'Carlin Trend, Nevada',
    blurb: 'Huge low-grade disseminated deposits. Big capital, big returns.',
    archetypeWeights: { porphyry: 0.6, vein: 0.25, pocket: 0.15, placer: 0 },
    streamChance: 0.15,
    landPriceMult: 1.8,
    permitDays: 60,
    unlockNetWorth: 1_500_000,
  },
  outback: {
    id: 'outback',
    name: 'Golden Triangle, Victoria',
    blurb: 'Nugget country. Erratic, pockety gold - fortunes made and lost.',
    archetypeWeights: { pocket: 0.4, vein: 0.4, placer: 0.2, porphyry: 0 },
    streamChance: 0.5,
    landPriceMult: 1.2,
    permitDays: 40,
    unlockNetWorth: 5_000_000,
  },
};

export const REGION_ORDER: RegionId[] = ['motherlode', 'klondike', 'nevada', 'outback'];

export function isWinter(region: Region, day: number): boolean {
  if (!region.winter) return false;
  const doy = day % 365;
  const [start, end] = region.winter;
  return start > end ? doy >= start || doy < end : doy >= start && doy < end;
}
