// Diorama terrain for the 3D view: a smooth, faceted heightfield for natural
// ground, flat benches where the pit has been dug, and vertical walls (banded
// like rock strata) at pit edges and around the outside of the claim block.
import * as THREE from 'three';
import { GRID_D, GRID_H, GRID_W, ci, inBounds } from '../../sim/geology/types';
import type { RegionId, WorldTruth } from '../../sim/geology/types';
import type { MineState } from '../../sim/state';
import { PALETTES, hash01 } from '../map/terrain';

export const VZ = 0.5; // a layer is half a cell tall
export const RELIEF = 1.6; // height of surface hills, in cell units
const BOTTOM = -GRID_D * VZ;

type RGB = [number, number, number];

const lin = (c: number) => Math.pow(Math.max(0, Math.min(1, c)), 2.2);
const toLinear = ([r, g, b]: RGB): RGB => [lin(r), lin(g), lin(b)];

/** Rock colour (sRGB 0..1) at height y, banded per layer. */
function strata(h: number): RGB {
  if (h > -0.01) return [0.45, 0.34, 0.22]; // soil
  const d = Math.min(1, -h / (GRID_D * VZ));
  const band = Math.floor(-h / VZ + 1e-6) % 2 === 0 ? 1 : 0.9;
  return [(0.58 - 0.26 * d) * band, (0.52 - 0.24 * d) * band, (0.44 - 0.16 * d) * band];
}

export function buildDiorama(t: WorldTruth, m: MineState, region: RegionId, seed: number): THREE.BufferGeometry {
  const pal = PALETTES[region];
  const pos: number[] = [];
  const col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], ca: RGB, cb: RGB = ca, cc: RGB = ca) => {
    pos.push(...a, ...b, ...c);
    col.push(...toLinear(ca), ...toLinear(cb), ...toLinear(cc));
  };

  // natural ground height at cell corners (shared, so hills are smooth)
  const CW = GRID_W + 1;
  const corner = new Float32Array(CW * (GRID_H + 1));
  for (let y = 0; y <= GRID_H; y++) {
    for (let x = 0; x <= GRID_W; x++) {
      let s = 0;
      let n = 0;
      let wet = false;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) {
        if (!inBounds(x + dx, y + dy)) continue;
        const c = ci(x + dx, y + dy);
        s += t.terrain[c];
        n++;
        if (t.stream[c]) wet = true;
      }
      corner[y * CW + x] = (s / n) * RELIEF - (wet ? 0.18 : 0);
    }
  }
  const cornerH = (x: number, y: number) => corner[y * CW + x];
  const mined = (x: number, y: number) => (inBounds(x, y) ? m.mined[ci(x, y)] : 0);
  /** Height of a cell's top along one of its edges (two endpoints). */
  const edgeTop = (x: number, y: number, ax: number, ay: number, bx: number, by: number): [number, number] => {
    const d = mined(x, y);
    return d > 0 ? [-d * VZ, -d * VZ] : [cornerH(ax, ay), cornerH(bx, by)];
  };

  /** Wall quad on edge A->B from top heights (ha, hb) down to `lo`, banded per layer. */
  const wall = (ax: number, az: number, bx: number, bz: number, ha: number, hb: number, lo: number) => {
    const top = Math.min(ha, hb);
    if (Math.max(ha, hb) <= lo + 1e-6) return;
    // first band: sloped top down to the first layer boundary below it
    let next = Math.max(lo, top >= 0 ? 0 : Math.floor(top / VZ - 1e-6) * VZ);
    if (next >= top - 1e-6) next = Math.max(lo, next - VZ);
    tri([ax, ha, az], [bx, hb, bz], [bx, next, bz], strata(ha), strata(hb), strata(next));
    tri([ax, ha, az], [bx, next, bz], [ax, next, az], strata(ha), strata(next), strata(next));
    let hi = next;
    while (hi > lo + 1e-6) {
      const l2 = Math.max(lo, hi - VZ);
      const c1 = strata(hi - 1e-3);
      tri([ax, hi, az], [bx, hi, bz], [bx, l2, bz], c1);
      tri([ax, hi, az], [bx, l2, bz], [ax, l2, az], c1);
      hi = l2;
    }
  };

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = ci(x, y);
      const d = m.mined[c];
      const n = (hash01(x, y, seed) - 0.5) * 0.05;
      // top face (CCW seen from above so the normal points up)
      if (d > 0) {
        const h = -d * VZ;
        const k = Math.min(1, d / 14);
        const floor: RGB = [0.69 - 0.4 * k + n, 0.57 - 0.32 * k + n, 0.42 - 0.14 * k + n];
        tri([x, h, y], [x, h, y + 1], [x + 1, h, y + 1], floor);
        tri([x, h, y], [x + 1, h, y + 1], [x + 1, h, y], floor);
      } else {
        const e = t.terrain[c];
        const ground: RGB = t.stream[c]
          ? [0.22, 0.42, 0.64]
          : ([0, 1, 2].map((i) => (pal.low[i] + (pal.high[i] - pal.low[i]) * e) / 255 + n) as RGB);
        const h00 = cornerH(x, y);
        const h10 = cornerH(x + 1, y);
        const h01 = cornerH(x, y + 1);
        const h11 = cornerH(x + 1, y + 1);
        tri([x, h00, y], [x, h01, y + 1], [x + 1, h11, y + 1], ground);
        tri([x, h00, y], [x + 1, h11, y + 1], [x + 1, h10, y], ground);
      }

      // walls on edges where the neighbour is lower (or outside the claim)
      const edges: [number, number, number, number, number, number][] = [
        // dx, dy, A(x,y), B(x,y) ordered so the normal faces the neighbour
        [0, -1, x, y, x + 1, y],
        [0, 1, x + 1, y + 1, x, y + 1],
        [-1, 0, x, y + 1, x, y],
        [1, 0, x + 1, y, x + 1, y + 1],
      ];
      for (const [dx, dy, ax, ay, bx, by] of edges) {
        const [ha, hb] = edgeTop(x, y, ax, ay, bx, by);
        let lo: number;
        if (!inBounds(x + dx, y + dy)) lo = BOTTOM;
        else {
          const dn = mined(x + dx, y + dy);
          if (dn === 0) continue; // neighbour is natural ground: corners are shared, or it walls itself
          lo = -dn * VZ;
        }
        wall(ax, ay, bx, by, ha, hb, lo);
      }
    }
  }
  // base slab, facing down
  const base: RGB = [0.12, 0.12, 0.14];
  tri([0, BOTTOM, 0], [GRID_W, BOTTOM, 0], [GRID_W, BOTTOM, GRID_H], base);
  tri([0, BOTTOM, 0], [GRID_W, BOTTOM, GRID_H], [0, BOTTOM, GRID_H], base);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Ground height at the centre of a cell (for placing collars and the headframe). */
export function surfaceY(t: WorldTruth, m: MineState, c: number): number {
  if (m.mined[c] > 0) return -m.mined[c] * VZ;
  return t.terrain[c] * RELIEF;
}
