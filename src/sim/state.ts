import type { RngState } from './rng';
import type { RegionId } from './geology/types';
import type { EquipTypeId } from './equipment';

export interface Hole {
  id: number;
  name: string;
  c: number; // column index
  depth: number; // layers
  endDay: number; // drilling finished
  assayDay: number; // lab results back
  status: 'drilling' | 'lab' | 'done';
}

export interface Trench {
  id: number;
  name: string;
  cells: number[];
  depth: number;
  endDay: number;
  assayDay: number;
  status: 'digging' | 'lab' | 'done';
}

export type JobKind = 'walkover' | 'walkoverAll' | 'pan' | 'soil' | 'geophys' | 'permit';

export interface Job {
  id: number;
  kind: JobKind;
  propId: number;
  c?: number;
  endDay: number;
  resultDay: number; // when lab-dependent results (soil) arrive
  done: boolean;
}

export interface Knowledge {
  clues: number[]; // per column: revealed Clue, or -1 if not yet walked
  pans: Record<number, number>; // column -> gold colors
  soil: Record<number, number>; // column -> ppb Au
  geophys: number[] | null; // per column chargeability (noisy)
  assays: Record<number, number>; // voxel -> g/t (exact, verified)
  reported: Record<number, number>; // voxel -> g/t claimed by a previous owner (unverified)
  ob: Record<number, number>; // column -> overburden thickness (layers), learned from drilling/trenching/mining
  holes: Hole[];
  trenches: Trench[];
}

export interface EquipmentUnit {
  id: number;
  type: EquipTypeId;
  leased: boolean;
  brokenUntil: number;
  boughtDay: number;
}

export interface Stockpile {
  t: number;
  g: number; // contained gold, grams
}

export interface MineState {
  target: number[]; // per column: planned pit floor (layers)
  mined: number[]; // per column: layers removed
  progressT: number; // effort tonnes into the current block
  cutoff: number; // g/t
  gravel: Stockpile;
  rock: Stockpile;
  haltedUntil: number;
  status: string;
  oreT: number;
  wasteT: number;
  goldG: number;
  shaft: Shaft | null;
  stopes: number[]; // queued voxels for underground extraction
  stoped: Record<number, 1>; // voxels already mined out underground
  ugProgressT: number;
  ugHaltedUntil: number;
  ugStatus: string;
  ugOreT: number;
  ugWasteT: number;
  followVein: boolean; // auto-queue neighbours of stopes that turn out to be ore
}

export interface Shaft {
  c: number; // collar column
  depth: number; // layers sunk
  target: number; // layers ordered
  progress: number; // days into the current layer
  invested: number;
}

export interface Ledger {
  land: number;
  explore: number;
  capex: number;
  opex: number;
  revenue: number; // gold produced valued at the price on the day it was poured
}

export interface Property {
  id: number;
  name: string;
  seed: number;
  region: RegionId;
  boughtDay: number;
  purchasePrice: number;
  permit: 'none' | 'pending' | 'granted';
  permitDay: number;
  bond: number;
  knowledge: Knowledge;
  jobs: Job[];
  lanes: { field: number; drill: number; contractor: number };
  equipment: EquipmentUnit[];
  mine: MineState;
  ledger: Ledger;
  /** Last 30 days of operating results, newest last. */
  pnl: { day: number; rev: number; cost: number }[];
}

export interface ReportedHole {
  c: number;
  results: number[]; // g/t per layer as reported by the seller
}

export interface Listing {
  id: number;
  seed: number;
  region: RegionId;
  name: string;
  ask: number;
  listedDay: number;
  expiresDay: number;
  report: ReportedHole[];
  /** HIDDEN: never display. In multiplayer this stays server-side. */
  salted: boolean;
  dd: 'none' | 'pending' | 'done';
  ddDay: number;
  ddResult?: string;
}

export type NoticeKind = 'assay' | 'event' | 'info' | 'warn' | 'good';

export interface Notice {
  id: number;
  day: number;
  kind: NoticeKind;
  title: string;
  body: string;
  propId?: number;
  holeId?: number;
  trenchId?: number;
  popup: boolean;
}

export interface GameStats {
  holesDrilled: number;
  metresDrilled: number;
  ozProduced: number;
  ozSold: number;
  bestIntercept: { grade: number; metres: number; hole: string; prop: string } | null;
  propertiesBought: number;
  propertiesSold: number;
  peakNetWorth: number;
}

export interface GameState {
  version: number;
  seed: number;
  mode: 'standard' | 'daily' | 'tutorial';
  /** Present in tutorial games: current coach step; `done` once the player finishes or skips it. */
  tutorial?: { step: number; done: boolean };
  label: string;
  day: number;
  endDay: number;
  startCash: number;
  cash: number;
  goldOz: number;
  goldPrice: number;
  priceHistory: number[];
  loan: number;
  rng: RngState;
  nextId: number;
  properties: Property[];
  listings: Listing[];
  unlockedRegions: RegionId[];
  notices: Notice[];
  achievements: string[];
  stats: GameStats;
  regionHype: Partial<Record<RegionId, number>>;
  gameOver: { reason: string; netWorth: number } | null;
}

export const SAVE_VERSION = 2;
export const START_CASH = 200_000;
export const GAME_YEARS = 5;
