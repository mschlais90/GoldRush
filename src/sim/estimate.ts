// Player-side resource model: inverse-distance interpolation of known assays,
// with a confidence value that decays with distance to the nearest sample.
import {
  GRAMS_PER_OZ,
  GRID_D,
  GRID_H,
  GRID_W,
  blockTonnes,
  ci,
  vi,
} from './geology/types';
import type { Knowledge, MineState } from './state';

export interface BlockModel {
  est: Float32Array; // g/t
  conf: Float32Array; // 0..1 (1 = measured)
}

const SEARCH_R = 5; // cells
/** Vertical distance weighting. A layer is physically half a cell, but grade changes much faster
 *  downhole (gravel over bedrock, vein walls), so count each layer as a full cell. */
const VERT = 1;
/** Assays above this are capped before being spread to neighbouring blocks (standard "top-cut"). */
const TOP_CUT = 20;
/** Background grade the estimate decays toward away from data, and the weight of that prior
 *  (equal to one sample about two cells away). */
const BACKGROUND = 0.02;
const PRIOR_W = 0.12;
/** Range of influence of a sample (cells). Beyond this the estimate is just background. */
const RANGE = 4.5;

const DEFAULT_OB = 2; // assumed gravel thickness where nothing has been drilled nearby

/** Overburden thickness for a column: known value, else inverse-distance from known columns nearby. */
export function estimateOverburden(k: Knowledge, c: number): { ob: number; known: boolean } {
  const known = k.ob ?? {};
  if (known[c] !== undefined) return { ob: known[c], known: true };
  let ws = 0;
  let vs = 0;
  for (const key in known) {
    const d2 = ((Number(key) % GRID_W) - (c % GRID_W)) ** 2 + (Math.floor(Number(key) / GRID_W) - Math.floor(c / GRID_W)) ** 2;
    if (d2 > 64) continue;
    const w = 1 / (d2 + 1);
    ws += w;
    vs += w * known[key];
  }
  return ws > 0 ? { ob: Math.round(vs / ws), known: true } : { ob: DEFAULT_OB, known: false };
}

/** verifiedOnly: ignore unverified seller-reported data (used by buyers and the bank). */
export function buildBlockModel(k: Knowledge, verifiedOnly = false): BlockModel {
  const n = GRID_W * GRID_H * GRID_D;
  const est = new Float32Array(n);
  const conf = new Float32Array(n);

  // group samples by column, tagging each as gravel cover or bedrock where the core showed the contact
  const knownOb = k.ob ?? {};
  const byCol = new Map<number, { z: number; g: number; cover: boolean | null }[]>();
  const samples: Record<number, number> = verifiedOnly ? { ...k.assays } : { ...(k.reported ?? {}), ...k.assays };
  for (const key in samples) {
    const v = Number(key);
    const z = Math.floor(v / (GRID_W * GRID_H));
    const c = v % (GRID_W * GRID_H);
    let arr = byCol.get(c);
    if (!arr) byCol.set(c, (arr = []));
    arr.push({ z, g: samples[key], cover: knownOb[c] !== undefined ? z < knownOb[c] : null });
  }
  const cols = [...byCol.entries()].map(([c, s]) => ({ x: c % GRID_W, y: Math.floor(c / GRID_W), s }));
  if (cols.length === 0) return { est, conf };

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const near = cols.filter((col) => Math.abs(col.x - x) <= SEARCH_R && Math.abs(col.y - y) <= SEARCH_R);
      if (near.length === 0) continue;
      // geological domains: only estimate gravel from gravel and bedrock from bedrock
      const obHere = estimateOverburden(k, y * GRID_W + x);
      for (let z = 0; z < GRID_D; z++) {
        const blockCover = obHere.known ? z < obHere.ob : null;
        let wsum = 0;
        let gsum = 0;
        let dmin = Infinity;
        let exact = -1;
        for (const col of near) {
          const dh2 = (col.x - x) ** 2 + (col.y - y) ** 2;
          if (dh2 > SEARCH_R * SEARCH_R) continue;
          for (const s of col.s) {
            if (blockCover !== null && s.cover !== null && s.cover !== blockCover) continue;
            const dz = (s.z - z) * VERT;
            if (Math.abs(dz) > 2) continue;
            const d2 = dh2 + dz * dz;
            if (d2 === 0) exact = s.g;
            if (d2 < dmin) dmin = d2;
            // inverse distance, tapered to zero at RANGE so data only informs nearby blocks
            const taper = Math.max(0, 1 - Math.sqrt(d2) / RANGE);
            if (taper <= 0) continue;
            const w = (taper * taper) / (d2 + 0.3) ** 1.2;
            wsum += w;
            gsum += w * Math.min(s.g, TOP_CUT);
          }
        }
        if (wsum === 0) continue;
        const i = vi(x, y, z);
        if (exact >= 0) {
          est[i] = exact;
          conf[i] = 1;
        } else {
          // blend toward background grade so a lone rich hole doesn't paint the whole neighbourhood gold
          est[i] = (gsum + PRIOR_W * BACKGROUND) / (wsum + PRIOR_W);
          conf[i] = Math.min(0.95, Math.exp(-Math.sqrt(dmin) / 1.9));
        }
      }
    }
  }
  return { est, conf };
}

const modelCache = new Map<string, { n: number; model: BlockModel }>();

/** Cached block model; rebuilt only when the number of known assays changes. */
export function getModel(baseKey: string, k: Knowledge, verifiedOnly = false): BlockModel {
  const key = verifiedOnly ? baseKey + ':v' : baseKey;
  const n = Object.keys(k.assays).length + (verifiedOnly ? 0 : Object.keys(k.reported ?? {}).length);
  const hit = modelCache.get(key);
  if (hit && hit.n === n) return hit.model;
  const model = buildBlockModel(k, verifiedOnly);
  modelCache.set(key, { n, model });
  if (modelCache.size > 32) modelCache.delete(modelCache.keys().next().value!);
  return model;
}

/** Cache key for a property's block model. */
export function modelKey(p: { seed: number; id: number }): string {
  return `${p.seed}:${p.id}`;
}

/**
 * The most recent block model, even if a few grade-control assays have arrived since.
 * Good enough for day-to-day mine scheduling, and avoids rebuilding the model every day.
 */
export function getModelStale(baseKey: string, k: Knowledge): BlockModel {
  const hit = modelCache.get(baseKey);
  const n = Object.keys(k.assays).length + Object.keys(k.reported ?? {}).length;
  if (hit && Math.abs(hit.n - n) < 40) return hit.model;
  return getModel(baseKey, k);
}

export interface ResourceClass {
  tonnes: number;
  grams: number;
  blocks: number;
}

export interface ResourceReport {
  cutoff: number;
  measured: ResourceClass;
  indicated: ResourceClass;
  inferred: ResourceClass;
}

const emptyClass = (): ResourceClass => ({ tonnes: 0, grams: 0, blocks: 0 });

/** Classifies unmined blocks above cutoff. Rock type is unknown to the player, so a nominal density is used. */
export function resourceReport(model: BlockModel, cutoff: number, mine?: MineState): ResourceReport {
  const r: ResourceReport = { cutoff, measured: emptyClass(), indicated: emptyClass(), inferred: emptyClass() };
  const t = blockTonnes(1);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const minedTo = mine ? mine.mined[ci(x, y)] : 0;
      for (let z = minedTo; z < GRID_D; z++) {
        const i = vi(x, y, z);
        if (mine?.stoped?.[i]) continue;
        const g = model.est[i];
        const c = model.conf[i];
        if (g < cutoff || c < 0.2) continue;
        const cls = c >= 1 ? r.measured : c >= 0.5 ? r.indicated : r.inferred;
        cls.tonnes += t;
        cls.grams += t * g;
        cls.blocks++;
      }
    }
  }
  return r;
}

export function ounces(cls: ResourceClass): number {
  return cls.grams / GRAMS_PER_OZ;
}

export function avgGrade(cls: ResourceClass): number {
  return cls.tonnes > 0 ? cls.grams / cls.tonnes : 0;
}
