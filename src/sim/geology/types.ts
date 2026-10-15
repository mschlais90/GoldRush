export const GRID_W = 40;
export const GRID_H = 40;
export const GRID_D = 24;
export const CELL_M = 10; // horizontal cell size (m)
export const LAYER_M = 5; // vertical layer thickness (m)

export enum Rock {
  Overburden = 0, // soil / barren gravel
  Bedrock = 1,
  Quartz = 2,
  Altered = 3, // porphyry alteration zone
  Paystreak = 4, // gold-bearing placer gravel
}

export const ROCK_NAMES = ['Overburden', 'Bedrock', 'Quartz vein', 'Altered rock', 'Pay gravel'];
export const ROCK_DENSITY = [2.0, 2.7, 2.6, 2.6, 2.1]; // t/m3
export const ROCK_HARDNESS = [0.3, 1.0, 1.4, 0.8, 0.35]; // relative digging difficulty

export enum Clue {
  None = 0,
  Outcrop = 1, // bare bedrock
  QuartzOutcrop = 2,
  VisibleGold = 3,
  Gossan = 4, // rusty iron-stained soil
  VegStress = 5, // stunted vegetation
  OldWorkings = 6,
}

export const CLUE_NAMES = [
  'Nothing notable',
  'Bedrock outcrop',
  'Quartz outcrop',
  'Quartz with visible gold!',
  'Gossan (rusty iron staining)',
  'Stressed vegetation',
  'Old abandoned workings',
];

export type Archetype = 'placer' | 'vein' | 'porphyry' | 'pocket';

export type RegionId = 'motherlode' | 'klondike' | 'nevada' | 'outback';

export interface DepositSummary {
  archetype: Archetype;
  label: string;
}

/** The hidden truth. Never shown to the player directly. */
export interface WorldTruth {
  grade: Float32Array; // g/t, index vi(x,y,z)
  rock: Uint8Array;
  overburden: Uint8Array; // layers of overburden per column
  waterTable: Uint8Array; // first layer below water table per column
  stream: Uint8Array; // 1 = visible stream
  streamPath: number[]; // column indices, upstream -> downstream
  clue: Uint8Array; // per column
  chargeability: Float32Array; // per column, geophysical response (no noise)
  terrain: Float32Array; // per column, cosmetic elevation 0..1
  deposits: DepositSummary[];
}

export const vi = (x: number, y: number, z: number) => z * GRID_W * GRID_H + y * GRID_W + x;
export const ci = (x: number, y: number) => y * GRID_W + x;
export const cx = (c: number) => c % GRID_W;
export const cy = (c: number) => Math.floor(c / GRID_W);
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

export function blockTonnes(rock: number): number {
  return CELL_M * CELL_M * LAYER_M * ROCK_DENSITY[rock];
}

export const GRAMS_PER_OZ = 31.1035;
