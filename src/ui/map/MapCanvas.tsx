import { useEffect, useRef, useState } from 'react';
import { modelKey } from '../../sim/economy';
import { getModel } from '../../sim/estimate';
import { Clue, GRID_D, GRID_H, GRID_W, ci, cx, cy, inBounds, vi } from '../../sim/geology/types';
import { COSTS, sampleAt, soilGridCells, trenchCells } from '../../sim/prospecting';
import type { Property } from '../../sim/state';
import { getTruth } from '../../sim/truth';
import { gradeColor, heatColor } from '../format';
import { drawClue, drawSparkle } from './sprites';
import { hash01, streamCurve, strokeCurve, terrainBitmap } from './terrain';

export type Overlay = 'none' | 'soil' | 'geophys' | 'estimate' | 'confidence' | 'pit';
export type Tool = 'inspect' | 'walkover' | 'pan' | 'soil' | 'trench' | 'drill' | 'pit' | 'shaft' | 'stope';

const PAINT_TOOLS: Tool[] = ['pit', 'stope'];
const N = GRID_W * GRID_H;

interface Props {
  prop: Property;
  version: number;
  overlay: Overlay;
  slice: number; // -1 = max over depth
  tool: Tool;
  trenchStart: number | null;
  selectedHole: number | null;
  onCellClick: (c: number) => void;
  onPaint: (c: number) => void;
  onHover: (c: number | null) => void;
  /** Tutorial beacons: cells to point the player at. */
  marks?: number[];
}

export function MapCanvas(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const hoverRef = useRef<number | null>(null);
  const propsRef = useRef(p);
  propsRef.current = p;
  const [size, setSize] = useState(640);
  const [, setHover] = useState<number | null>(null);
  const painting = useRef(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const s = Math.max(320, Math.min(el.clientWidth, el.clientHeight || el.clientWidth));
      setSize(Math.floor(s / GRID_W) * GRID_W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rebuild the static layer whenever game data or view options change.
  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    const cv = staticRef.current ?? document.createElement('canvas');
    cv.width = px;
    cv.height = px;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStatic(ctx, size / GRID_W, p, 800);
    staticRef.current = cv;
    paint();
  }, [p.prop, p.version, p.overlay, p.slice, p.selectedHole, size]);

  /** Blit the static layer, then water, sparkles and tool previews. */
  function paint(now = performance.now()) {
    const cv = canvasRef.current;
    if (!cv || !staticRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const px = Math.round(size * dpr);
    if (cv.width !== px) {
      cv.width = px;
      cv.height = px;
    }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticRef.current, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDynamic(ctx, size / GRID_W, propsRef.current, hoverRef.current, now / 1000);
  }
  const paintRef = useRef(paint);
  paintRef.current = paint;

  // Animation loop (~20 fps) for the shimmer and sparkles.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 50) return;
      last = now;
      paintRef.current(now);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cellFromEvent = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * GRID_W);
    const y = Math.floor(((e.clientY - r.top) / r.height) * GRID_H);
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return ci(x, y);
  };

  return (
    <div className="map-wrap" ref={wrapRef}>
      <div className="map-frame" style={{ width: size, height: size }}>
        <canvas
          ref={canvasRef}
          style={{ width: size, height: size, cursor: p.tool === 'inspect' ? 'default' : 'crosshair' }}
          onMouseMove={(e) => {
            const c = cellFromEvent(e);
            if (c !== hoverRef.current) {
              hoverRef.current = c;
              setHover(c);
              p.onHover(c);
              paint();
            }
            if (painting.current && c !== null && PAINT_TOOLS.includes(p.tool)) p.onPaint(c);
          }}
          onMouseLeave={() => {
            painting.current = false;
            hoverRef.current = null;
            setHover(null);
            p.onHover(null);
          }}
          onMouseDown={(e) => {
            const c = cellFromEvent(e);
            if (c === null) return;
            if (PAINT_TOOLS.includes(p.tool)) {
              painting.current = true;
              p.onPaint(c);
            } else p.onCellClick(c);
          }}
          onMouseUp={() => (painting.current = false)}
        />
      </div>
    </div>
  );
}

/** A clue sprite rendered into a tiny canvas, for the legend. */
export function ClueIcon({ clue, size = 18 }: { clue: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#7c8a4a';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    drawClue(ctx, clue, size * 0.1, size * 0.1, size * 0.8, 7);
  }, [clue, size]);
  return <canvas ref={ref} style={{ width: size, height: size, verticalAlign: 'middle' }} />;
}

// ---------------------------------------------------------------------------
// Helpers

/** Draw a 40x40 per-cell colour field scaled up with smooth interpolation. */
function drawField(ctx: CanvasRenderingContext2D, size: number, fill: (c: number) => [number, number, number, number] | null) {
  const g = document.createElement('canvas');
  g.width = GRID_W;
  g.height = GRID_H;
  const gx = g.getContext('2d')!;
  const img = gx.createImageData(GRID_W, GRID_H);
  for (let c = 0; c < N; c++) {
    const v = fill(c);
    if (!v) continue;
    img.data.set([v[0], v[1], v[2], Math.round(v[3] * 255)], c * 4);
  }
  gx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(g, 0, 0, size, size);
  ctx.restore();
}

/** Outline the boundary of a set of cells. */
function outlineCells(ctx: CanvasRenderingContext2D, cs: number, set: Set<number>, color: string, width: number, dash: number[] = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (const c of set) {
    const x = cx(c) * cs;
    const y = cy(c) * cs;
    const has = (dx: number, dy: number) => inBounds(cx(c) + dx, cy(c) + dy) && set.has(ci(cx(c) + dx, cy(c) + dy));
    if (!has(0, -1)) (ctx.moveTo(x, y), ctx.lineTo(x + cs, y));
    if (!has(0, 1)) (ctx.moveTo(x, y + cs), ctx.lineTo(x + cs, y + cs));
    if (!has(-1, 0)) (ctx.moveTo(x, y), ctx.lineTo(x, y + cs));
    if (!has(1, 0)) (ctx.moveTo(x + cs, y), ctx.lineTo(x + cs, y + cs));
  }
  ctx.stroke();
  ctx.restore();
}

function holeBest(p: Property, h: Property['knowledge']['holes'][0]) {
  let best = 0;
  if (h.status === 'done') for (let z = 0; z < h.depth; z++) best = Math.max(best, sampleAt(p.knowledge, vi(cx(h.c), cy(h.c), z)) ?? 0);
  return best;
}

// ---------------------------------------------------------------------------
// Static layer

/** Pit colour by bench depth: tan oxidised benches near surface, blue-grey fresh rock at depth. */
function pitColor(d: number, noise: number): string {
  const t = Math.min(1, d / 14);
  const r = 176 - 118 * t + noise;
  const g = 146 - 92 * t + noise;
  const b = 108 - 44 * t + noise;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Headframe on a cleared pad, about 2 cells tall so it reads as a landmark. */
function drawHeadframe(ctx: CanvasRenderingContext2D, x: number, y: number, cs: number) {
  const s = cs * 1.1;
  ctx.save();
  // pad + shadow
  ctx.fillStyle = 'rgba(190,170,130,0.75)';
  ctx.fillRect(x - s * 0.9, y - s * 0.5, s * 1.8, s * 1.1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y + s * 0.5);
  ctx.lineTo(x + s * 0.9, y + s * 0.2);
  ctx.lineTo(x + s * 0.5, y + s * 0.5);
  ctx.fill();
  // hoist house
  ctx.fillStyle = '#7a3b2a';
  ctx.strokeStyle = '#1a0f0a';
  ctx.lineWidth = 1.2;
  ctx.fillRect(x + s * 0.2, y - s * 0.05, s * 0.65, s * 0.5);
  ctx.strokeRect(x + s * 0.2, y - s * 0.05, s * 0.65, s * 0.5);
  ctx.fillStyle = '#4a4a4a';
  ctx.beginPath();
  ctx.moveTo(x + s * 0.15, y - s * 0.05);
  ctx.lineTo(x + s * 0.525, y - s * 0.3);
  ctx.lineTo(x + s * 0.9, y - s * 0.05);
  ctx.fill();
  // collar
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x - s * 0.35, y + s * 0.15, s * 0.4, s * 0.3);
  // A-frame
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = Math.max(3, cs * 0.22);
  const frame = () => {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y + s * 0.45);
    ctx.lineTo(x - s * 0.15, y - s * 1.0);
    ctx.lineTo(x + s * 0.2, y + s * 0.45);
    ctx.moveTo(x - s * 0.4, y);
    ctx.lineTo(x + s * 0.1, y);
    ctx.moveTo(x - s * 0.15, y - s * 1.0);
    ctx.lineTo(x + s * 0.45, y - s * 0.05);
    ctx.stroke();
  };
  frame();
  ctx.strokeStyle = '#e8e0cc';
  ctx.lineWidth = Math.max(1.5, cs * 0.1);
  frame();
  // sheave wheel
  ctx.beginPath();
  ctx.arc(x - s * 0.15, y - s * 0.95, s * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2a2a';
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPit(ctx: CanvasRenderingContext2D, cs: number, prop: Property) {
  const m = prop.mine;
  const depthAt = (x: number, y: number) => (inBounds(x, y) ? m.mined[ci(x, y)] : 0);
  // floor fill with gravel speckle
  for (let c = 0; c < N; c++) {
    const d = m.mined[c];
    if (d <= 0) continue;
    const x = cx(c) * cs;
    const y = cy(c) * cs;
    ctx.fillStyle = pitColor(d, (hash01(c, d, 3) - 0.5) * 10);
    ctx.fillRect(x, y, cs + 0.5, cs + 0.5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let k = 0; k < 4; k++) ctx.fillRect(x + hash01(c, k, 21) * cs, y + hash01(k, c, 22) * cs, 1.5, 1.5);
  }
  // bench walls: a strip on the floor side of each step, lit from the north-west
  const wall = Math.max(2, cs * 0.28);
  for (let c = 0; c < N; c++) {
    const d = m.mined[c];
    if (d <= 0) continue;
    const X = cx(c);
    const Y = cy(c);
    const x = X * cs;
    const y = Y * cs;
    const step = (dx: number, dy: number) => d - depthAt(X + dx, Y + dy); // >0 where the neighbour is higher ground
    // north/west neighbours higher: their walls face south/east, catching the light
    if (step(0, -1) > 0) {
      ctx.fillStyle = 'rgba(255,240,210,0.28)';
      ctx.fillRect(x, y, cs, wall);
    }
    if (step(-1, 0) > 0) {
      ctx.fillStyle = 'rgba(255,240,210,0.22)';
      ctx.fillRect(x, y, wall, cs);
    }
    // south/east neighbours higher: walls in shadow
    if (step(0, 1) > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(x, y + cs - wall, cs, wall);
    }
    if (step(1, 0) > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(x + cs - wall, y, wall, cs);
    }
  }
  // crest line around the pit rim
  const rim = new Set<number>();
  for (let c = 0; c < N; c++) if (m.mined[c] > 0) rim.add(c);
  if (rim.size) outlineCells(ctx, cs, rim, 'rgba(40,28,16,0.85)', Math.max(1.5, cs * 0.12));
}

function drawStatic(ctx: CanvasRenderingContext2D, cs: number, p: Props, bitmapPx: number) {
  const prop = p.prop;
  const k = prop.knowledge;
  const m = prop.mine;
  const size = cs * GRID_W;
  // Public surface info only (terrain + visible streams): anyone standing on the claim sees these.
  const surface = getTruth(prop.seed, prop.region);

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(terrainBitmap(surface, prop.seed, prop.region, bitmapPx), 0, 0, size, size);

  drawPit(ctx, cs, prop);

  // Fog of war over ground your geologists haven't walked
  drawField(ctx, size, (c) => (k.clues[c] < 0 && m.mined[c] === 0 ? [18, 24, 32, 0.42] : null));

  // Data overlays
  if (p.overlay === 'soil') {
    const pts = Object.entries(k.soil).map(([key, v]) => ({ c: Number(key), v }));
    const max = Math.max(20, ...pts.map((q) => q.v));
    drawField(ctx, size, (c) => {
      let ws = 0;
      let vs = 0;
      let dmin = 99;
      for (const q of pts) {
        const d2 = (cx(q.c) - cx(c)) ** 2 + (cy(q.c) - cy(c)) ** 2;
        if (d2 > 9) continue;
        const w = 1 / (d2 + 0.5);
        ws += w;
        vs += w * q.v;
        dmin = Math.min(dmin, Math.sqrt(d2));
      }
      if (!ws) return null;
      const t = Math.log(1 + vs / ws) / Math.log(1 + max);
      const [r, g, b] = heatColor(t);
      return [r, g, b, 0.8 * Math.max(0, 1 - dmin / 3)];
    });
  } else if (p.overlay === 'geophys' && k.geophys) {
    const max = Math.max(...k.geophys);
    drawField(ctx, size, (c) => {
      const [r, g, b] = heatColor(k.geophys![c] / max);
      return [r, g, b, 0.7];
    });
  } else if (p.overlay === 'estimate' || p.overlay === 'confidence') {
    const model = getModel(modelKey(prop), k);
    drawField(ctx, size, (c) => {
      const x = cx(c);
      const y = cy(c);
      let g = 0;
      let conf = 0;
      const z0 = Math.max(p.slice < 0 ? 0 : p.slice, m.mined[c]);
      const z1 = p.slice < 0 ? GRID_D : p.slice + 1;
      for (let z = z0; z < z1; z++) {
        const i = vi(x, y, z);
        if (m.stoped[i]) continue;
        if (p.overlay === 'confidence') conf = Math.max(conf, model.conf[i]);
        else if (model.conf[i] > 0.15 && model.est[i] > g) {
          g = model.est[i];
          conf = model.conf[i];
        }
      }
      if (p.overlay === 'confidence') return conf > 0 ? [80, 200, 255, conf * 0.75] : null;
      if (conf <= 0 || g < 0.1) return null;
      const [r, gg, b] = gradeColor(g);
      return [r, gg, b, 0.3 + 0.6 * conf];
    });
  } else if (p.overlay === 'pit') {
    drawField(ctx, size, (c) => (m.target[c] > m.mined[c] ? [255, 80, 60, 0.2 + 0.6 * (m.target[c] / GRID_D)] : null));
  }

  // Faint survey grid every 5 cells
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 5; i < GRID_W; i += 5) {
    ctx.moveTo(i * cs + 0.5, 0);
    ctx.lineTo(i * cs + 0.5, size);
    ctx.moveTo(0, i * cs + 0.5);
    ctx.lineTo(size, i * cs + 0.5);
  }
  ctx.stroke();

  // Planned pit and stopes as clean region outlines
  const planned = new Set<number>();
  for (let c = 0; c < N; c++) if (m.target[c] > m.mined[c]) planned.add(c);
  if (planned.size) outlineCells(ctx, cs, planned, 'rgba(255,120,90,0.95)', 2, [6, 3]);
  const stopeCols = new Set(m.stopes.map((i) => i % N));
  if (stopeCols.size) outlineCells(ctx, cs, stopeCols, 'rgba(230,110,255,0.95)', 2, [3, 3]);
  const stoped = new Map<number, number>();
  for (const key in m.stoped) {
    const c = Number(key) % N;
    if (!m.shaft || c !== m.shaft.c) stoped.set(c, (stoped.get(c) ?? 0) + 1);
  }
  for (const [c, n] of stoped) {
    const g = ctx.createRadialGradient(cx(c) * cs + cs / 2, cy(c) * cs + cs / 2, 0, cx(c) * cs + cs / 2, cy(c) * cs + cs / 2, cs * 0.6);
    g.addColorStop(0, `rgba(140,70,200,${Math.min(0.8, 0.3 + n * 0.08)})`);
    g.addColorStop(1, 'rgba(140,70,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx(c) * cs, cy(c) * cs, cs, cs);
  }

  // Clues
  for (let c = 0; c < N; c++) {
    const clue = k.clues[c];
    if (clue > 0 && m.mined[c] === 0) drawClue(ctx, clue, cx(c) * cs, cy(c) * cs, cs, c);
  }

  // Trenches: an excavated slot with spoil along one side
  for (const tr of k.trenches) {
    const pts = tr.cells.map((c): [number, number] => [cx(c) + 0.5, cy(c) + 0.5]);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(170,140,100,0.9)';
    ctx.lineWidth = cs * 0.7;
    strokeCurve(ctx, pts, cs);
    ctx.strokeStyle = tr.status === 'done' ? '#4a3a2a' : '#5e5245';
    ctx.lineWidth = cs * 0.32;
    strokeCurve(ctx, pts, cs);
    ctx.lineCap = 'butt';
  }

  // Pan results: little gold pans
  ctx.textAlign = 'center';
  for (const [key, colors] of Object.entries(k.pans)) {
    const c = Number(key);
    const x = cx(c) * cs + cs / 2;
    const y = cy(c) * cs + cs / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 2, cs * 0.45, cs * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x, y, 0, x, y, cs * 0.45);
    g.addColorStop(0, colors > 0 ? '#e9b949' : '#5c5a55');
    g.addColorStop(1, '#3b3a37');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, cs * 0.45, cs * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors > 3 ? '#1a1408' : '#fff';
    ctx.font = `bold ${Math.max(8, Math.floor(cs * 0.48))}px system-ui, sans-serif`;
    ctx.fillText(String(colors), x, y + cs * 0.17);
  }

  // Drill holes on cleared pads
  for (const h of k.holes) {
    const x = cx(h.c) * cs + cs / 2;
    const y = cy(h.c) * cs + cs / 2;
    ctx.fillStyle = 'rgba(200,180,140,0.55)';
    ctx.fillRect(x - cs * 0.48, y - cs * 0.48, cs * 0.96, cs * 0.96);
    const best = holeBest(prop, h);
    if (h.status === 'done') {
      if (best >= 1) {
        ctx.shadowColor = `rgb(${gradeColor(best).join(',')})`;
        ctx.shadowBlur = cs * (best >= 5 ? 1 : 0.5);
      }
      ctx.fillStyle = `rgb(${gradeColor(best).join(',')})`;
    } else ctx.fillStyle = h.status === 'lab' ? '#e8d36a' : '#9aa6ae';
    ctx.beginPath();
    ctx.arc(x, y, cs * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = h.id === p.selectedHole ? 3 : 1.5;
    ctx.strokeStyle = h.id === p.selectedHole ? '#fff' : h.name.startsWith('Hist') ? '#d070d0' : '#14100a';
    ctx.stroke();
  }

  if (m.shaft) drawHeadframe(ctx, cx(m.shaft.c) * cs + cs / 2, cy(m.shaft.c) * cs + cs / 2, cs);

  // Edge vignette
  const v = ctx.createRadialGradient(size / 2, size / 2, size * 0.45, size / 2, size / 2, size * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);
}

// ---------------------------------------------------------------------------
// Dynamic layer (every frame)

const curveCache = new WeakMap<object, [number, number][]>();

function drawDynamic(ctx: CanvasRenderingContext2D, cs: number, p: Props, hover: number | null, t: number) {
  const prop = p.prop;
  const k = prop.knowledge;
  const surface = getTruth(prop.seed, prop.region);

  // Water shimmer flowing downstream
  let curve = curveCache.get(surface);
  if (!curve) curveCache.set(surface, (curve = streamCurve(surface)));
  if (curve.length > 2) {
    ctx.save();
    // no water shimmer where the pit has cut through the creek
    const size = cs * GRID_W;
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    for (let c = 0; c < N; c++) if (prop.mine.mined[c] > 0) ctx.rect(cx(c) * cs, cy(c) * cs, cs, cs);
    ctx.clip('evenodd');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(210,235,255,0.35)';
    ctx.lineWidth = Math.max(1, cs * 0.1);
    ctx.setLineDash([cs * 0.4, cs * 1.6]);
    ctx.lineDashOffset = -t * cs * 1.5;
    strokeCurve(ctx, curve, cs);
    ctx.restore();
  }

  // Sparkles on visible gold and rich holes
  for (let c = 0; c < N; c++) {
    if (k.clues[c] === Clue.VisibleGold) {
      drawSparkle(ctx, cx(c) * cs + cs * 0.65, cy(c) * cs + cs * 0.3, cs * 0.35, t * 2.5 + c);
    }
  }
  for (const h of k.holes) {
    const x = cx(h.c) * cs + cs / 2;
    const y = cy(h.c) * cs + cs / 2;
    if (h.status === 'done' && holeBest(prop, h) >= 5) drawSparkle(ctx, x + cs * 0.3, y - cs * 0.3, cs * 0.4, t * 2 + h.id);
    if (h.status !== 'done') {
      // pulsing ring while drilling / at the lab
      const a = 0.5 + 0.5 * Math.sin(t * 4 + h.id);
      ctx.strokeStyle = h.status === 'lab' ? `rgba(255,220,100,${a})` : `rgba(200,220,230,${a})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, cs * (0.5 + 0.15 * a), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Tutorial beacons: pulsing gold rings with a bobbing arrow
  if (p.marks?.length) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.save();
    for (const c of p.marks) {
      const x = cx(c) * cs + cs / 2;
      const y = cy(c) * cs + cs / 2;
      ctx.strokeStyle = `rgba(255,211,77,${0.55 + 0.45 * pulse})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#ffd34d';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, cs * (0.55 + 0.25 * pulse), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (p.marks.length <= 6) {
      ctx.fillStyle = '#ffd34d';
      for (const c of p.marks) {
        const x = cx(c) * cs + cs / 2;
        const y = cy(c) * cs - cs * (0.6 + 0.25 * pulse);
        ctx.beginPath();
        ctx.moveTo(x, y + cs * 0.35);
        ctx.lineTo(x - cs * 0.3, y - cs * 0.1);
        ctx.lineTo(x + cs * 0.3, y - cs * 0.1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Tool previews
  if (hover !== null) {
    const hx = cx(hover);
    const hy = cy(hover);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    if (p.tool === 'walkover') {
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(hx * cs + cs / 2, hy * cs + cs / 2, (COSTS.walkover.radius + 0.5) * cs, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (p.tool === 'soil') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const c of soilGridCells(hx, hy)) {
        ctx.beginPath();
        ctx.arc(cx(c) * cs + cs / 2, cy(c) * cs + cs / 2, cs * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.tool === 'trench' && p.trenchStart !== null) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      for (const c of trenchCells(cx(p.trenchStart), cy(p.trenchStart), hx, hy)) ctx.fillRect(cx(c) * cs, cy(c) * cs, cs, cs);
    }
    ctx.shadowColor = 'rgba(255,255,255,0.8)';
    ctx.shadowBlur = 6;
    ctx.strokeRect(hx * cs + 1, hy * cs + 1, cs - 2, cs - 2);
    ctx.shadowBlur = 0;
  }
  if (p.trenchStart !== null) {
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx(p.trenchStart) * cs + 1, cy(p.trenchStart) * cs + 1, cs - 2, cs - 2);
  }
}
