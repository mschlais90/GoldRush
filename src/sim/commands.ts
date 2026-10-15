import type { EquipTypeId } from './equipment';

/** Every player action is a plain serializable command (multiplayer-ready). */
export type Command =
  | { type: 'buyListing'; listingId: number }
  | { type: 'dueDiligence'; listingId: number }
  | { type: 'sellProperty'; propId: number }
  | { type: 'walkover'; propId: number; x: number; y: number }
  | { type: 'walkoverAll'; propId: number }
  | { type: 'pan'; propId: number; x: number; y: number }
  | { type: 'soil'; propId: number; x: number; y: number }
  | { type: 'geophys'; propId: number }
  | { type: 'trench'; propId: number; x0: number; y0: number; x1: number; y1: number }
  | { type: 'drill'; propId: number; x: number; y: number; depth: number; rush: boolean }
  | { type: 'applyPermit'; propId: number }
  | { type: 'buyEquipment'; propId: number; equip: EquipTypeId; lease: boolean }
  | { type: 'sellEquipment'; propId: number; unitId: number }
  | { type: 'setPit'; propId: number; cells: number[]; depth: number }
  | { type: 'clearPit'; propId: number }
  | { type: 'placeShaft'; propId: number; x: number; y: number }
  | { type: 'setShaftDepth'; propId: number; depth: number }
  | { type: 'setStopes'; propId: number; cells: number[]; zFrom: number; zTo: number }
  | { type: 'clearStopes'; propId: number }
  | { type: 'setFollowVein'; propId: number; on: boolean }
  | { type: 'setCutoff'; propId: number; cutoff: number }
  | { type: 'sellGold'; oz: number }
  | { type: 'borrow'; amount: number }
  | { type: 'repay'; amount: number }
  | { type: 'advance'; days: number };

export interface CommandResult {
  ok: boolean;
  error?: string;
  /** advance: why time stopped early, if it did */
  stopped?: string;
}
