// Memoized access to the hidden world for a property/listing. The truth is fully
// derived from (seed, region), so it never needs to be serialized.
import { generateWorld } from './geology/generate';
import type { RegionId, WorldTruth } from './geology/types';

const cache = new Map<string, WorldTruth>();
const MAX = 24;

export function getTruth(seed: number, region: RegionId): WorldTruth {
  const key = `${seed}:${region}`;
  let t = cache.get(key);
  if (!t) {
    t = generateWorld(seed, region);
    cache.set(key, t);
    if (cache.size > MAX) cache.delete(cache.keys().next().value!);
  }
  return t;
}
