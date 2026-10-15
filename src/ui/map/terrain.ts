// Cached, pre-rendered surface art for a claim: hillshaded terrain, texture,
// vegetation and the creek. Only public surface information is used.
import { GRID_H, GRID_W, ci, cx, cy } from '../../sim/geology/types';
import { mixSeed } from '../../sim/rng';
import type { RegionId, WorldTruth } from '../../sim/geology/types';

type RGB = [number, number, number];

interface Palette {
  low: RGB;
  high: RGB;
  speck: RGB;
  veg: 'pine' | 'oak' | 'scrub';
  vegDensity: number;
  vegColor: RGB;
}

export const PALETTES: Record<RegionId, Palette> = {
  motherlode: { low: [92, 108, 52], high: [168, 150, 84], speck: [70, 84, 40], veg: 'oak', vegDensity: 0.05, vegColor: [52, 74, 34] },
  klondike: { low: [58, 78, 62], high: [128, 130, 108], speck: [40, 58, 46], veg: 'pine', vegDensity: 0.12, vegColor: [28, 52, 38] },
  nevada: { low: [168, 140, 100], high: [214, 190, 148], speck: [140, 118, 86], veg: 'scrub', vegDensity: 0.035, vegColor: [112, 118, 78] },
  outback: { low: [150, 78, 44], high: [204, 136, 82], speck: [120, 60, 36], veg: 'scrub', vegDensity: 0.03, vegColor: [96, 104, 60] },
};

/** Deterministic hash -> [0,1). */
export function hash01(a: number, b: number, seed = 0): number {
  return mixSeed(mixSeed(a | 0, b | 0), seed) / 4294967296;
}

function sampleTerrain(t: WorldTruth, fx: number, fy: number): number {
  const x0 = Math.max(0, Math.min(GRID_W - 1, Math.floor(fx - 0.5)));
  const y0 = Math.max(0, Math.min(GRID_H - 1, Math.floor(fy - 0.5)));
  const x1 = Math.min(GRID_W - 1, x0 + 1);
  const y1 = Math.min(GRID_H - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, fx - 0.5 - x0));
  const ty = Math.max(0, Math.min(1, fy - 0.5 - y0));
  const a = t.terrain[ci(x0, y0)] * (1 - tx) + t.terrain[ci(x1, y0)] * tx;
  const b = t.terrain[ci(x0, y1)] * (1 - tx) + t.terrain[ci(x1, y1)] * tx;
  return a * (1 - ty) + b * ty;
}

/** Smooth creek centreline in cell units (Chaikin-smoothed). */
export function streamCurve(t: WorldTruth): [number, number][] {
  const raw: [number, number][] = t.streamPath.map((c) => [cx(c) + 0.5, cy(c) + 0.5]);
  if (raw.length < 3) return raw;
  // thin the 4-connected staircase before smoothing so the creek meanders instead of zig-zagging
  let pts = raw.filter((_, i) => i % 3 === 0 || i === raw.length - 1);
  // extend to the map edge
  const first = pts[0];
  const last = pts[pts.length - 1];
  const toEdge = ([x, y]: [number, number]): [number, number] => {
    const d = [x, GRID_W - x, y, GRID_H - y];
    const m = Math.min(...d);
    if (m === d[0]) return [-0.5, y];
    if (m === d[1]) return [GRID_W + 0.5, y];
    if (m === d[2]) return [x, -0.5];
    return [x, GRID_H + 0.5];
  };
  pts = [toEdge(first), ...pts, toEdge(last)];
  for (let it = 0; it < 3; it++) {
    const out: [number, number][] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

export function strokeCurve(ctx: CanvasRenderingContext2D, pts: [number, number][], cs: number) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * cs, y * cs) : ctx.lineTo(x * cs, y * cs)));
  ctx.stroke();
}

const cache = new Map<string, HTMLCanvasElement>();

export function terrainBitmap(t: WorldTruth, seed: number, region: RegionId, px: number): HTMLCanvasElement {
  const key = `${seed}:${region}:${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pal = PALETTES[region];
  const cv = document.createElement('canvas');
  cv.width = px;
  cv.height = px;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(px, px);
  const cs = px / GRID_W;
  const relief = 4.5;
  for (let py = 0; py < px; py++) {
    for (let pxx = 0; pxx < px; pxx++) {
      const fx = (pxx + 0.5) / cs;
      const fy = (py + 0.5) / cs;
      const e = sampleTerrain(t, fx, fy);
      const ex = sampleTerrain(t, fx + 0.35, fy) - sampleTerrain(t, fx - 0.35, fy);
      const ey = sampleTerrain(t, fx, fy + 0.35) - sampleTerrain(t, fx, fy - 0.35);
      // light from the north-west
      const shade = Math.max(0.55, Math.min(1.35, 1 - (ex + ey) * relief));
      const n1 = hash01(pxx >> 1, py >> 1, seed) - 0.5;
      const n2 = hash01(pxx >> 3, py >> 3, seed + 7) - 0.5;
      const tex = 1 + n1 * 0.1 + n2 * 0.08;
      const speck = hash01(pxx, py, seed + 3) < 0.04;
      const i = (py * px + pxx) * 4;
      for (let k = 0; k < 3; k++) {
        const base = speck ? pal.speck[k] : pal.low[k] + (pal.high[k] - pal.low[k]) * e;
        img.data[i + k] = Math.max(0, Math.min(255, base * shade * tex));
      }
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // contour lines every 0.1 of elevation (subtle)
  ctx.fillStyle = 'rgba(40,30,10,0.12)';
  for (let py = 0; py < px; py += 1) {
    for (let pxx = 0; pxx < px; pxx += 1) {
      const a = Math.floor(sampleTerrain(t, pxx / cs, py / cs) * 8);
      const b = Math.floor(sampleTerrain(t, (pxx + 1) / cs, py / cs) * 8);
      const c = Math.floor(sampleTerrain(t, pxx / cs, (py + 1) / cs) * 8);
      if (a !== b || a !== c) ctx.fillRect(pxx, py, 1, 1);
    }
  }

  // creek: gravel bank, water, highlight
  const curve = streamCurve(t);
  if (curve.length > 2) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(196,178,132,0.9)';
    ctx.lineWidth = cs * 1.25;
    strokeCurve(ctx, curve, cs);
    ctx.strokeStyle = '#2f5f8f';
    ctx.lineWidth = cs * 0.72;
    strokeCurve(ctx, curve, cs);
    ctx.strokeStyle = 'rgba(120,180,230,0.55)';
    ctx.lineWidth = cs * 0.28;
    strokeCurve(ctx, curve, cs);
  }

  // vegetation, kept off the creek
  const nearStream = new Set<number>();
  for (const c of t.streamPath) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) nearStream.add(ci(cx(c) + dx, cy(c) + dy));
  }
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (nearStream.has(ci(x, y))) continue;
      const e = t.terrain[ci(x, y)];
      const dens = pal.vegDensity * (pal.veg === 'pine' ? 0.6 + e : 1.4 - e);
      for (let k = 0; k < 3; k++) {
        if (hash01(x * 3 + k, y, seed + 11) > dens) continue;
        const vx = (x + hash01(x, y * 7 + k, seed + 12)) * cs;
        const vy = (y + hash01(x * 5 + k, y, seed + 13)) * cs;
        drawPlant(ctx, pal, vx, vy, cs * (0.28 + 0.2 * hash01(x, y, seed + k)));
      }
    }
  }

  cache.set(key, cv);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return cv;
}

function drawPlant(ctx: CanvasRenderingContext2D, pal: Palette, x: number, y: number, r: number) {
  const [cr, cg, cb] = pal.vegColor;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.35, y + r * 0.45, r * 0.8, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  if (pal.veg === 'pine') {
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.4);
    ctx.lineTo(x + r * 0.75, y + r * 0.5);
    ctx.lineTo(x - r * 0.75, y + r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(${cr + 30},${cg + 40},${cb + 30},0.6)`;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.4);
    ctx.lineTo(x - r * 0.75, y + r * 0.5);
    ctx.lineTo(x, y + r * 0.3);
    ctx.closePath();
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, `rgb(${cr + 45},${cg + 50},${cb + 30})`);
    g.addColorStop(1, `rgb(${cr},${cg},${cb})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, pal.veg === 'scrub' ? r * 0.7 : r, 0, Math.PI * 2);
    ctx.fill();
  }
}
