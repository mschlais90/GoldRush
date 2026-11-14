// Draws the home-screen icon (a gold ingot with a sparkle) and writes PNGs to public/.
// Dependency-free: rasterizes polygons with 4x4 supersampling and encodes PNG via node:zlib.
// Run: npx tsx tools/make-icons.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

type Pt = [number, number];
type RGB = [number, number, number];
type Shade = (x: number, y: number) => RGB;

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};
const vgrad = (y0: number, y1: number, c0: string, c1: string): Shade => (_x, y) => mix(hex(c0), hex(c1), (y - y0) / (y1 - y0));

function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function star(cx: number, cy: number, r: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.22;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 64): Pt[] {
  return Array.from({ length: n }, (_, i): Pt => [cx + Math.cos((i / n) * Math.PI * 2) * rx, cy + Math.sin((i / n) * Math.PI * 2) * ry]);
}

/** Irregular blob: a lumpy circle, for rocks and gold flakes. */
function blob(cx: number, cy: number, r: number, rnd: () => number, n = 7): Pt[] {
  const off = rnd() * Math.PI * 2;
  return Array.from({ length: n }, (_, i): Pt => {
    const a = off + (i / n) * Math.PI * 2;
    const rr = r * (0.7 + 0.45 * rnd());
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8];
  });
}

/** Small deterministic PRNG so the icon is identical every run. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Layer = { poly: Pt[]; shade: Shade; alpha?: number };

/** A miner's pan seen from above: steel rim, gravel in the bottom, gold flakes in the tail. */
function panLayers(): Layer[] {
  const L: Layer[] = [];
  const rnd = rng(1849);
  const cx = 256;
  const cy = 262;
  L.push({ poly: ellipse(cx + 6, cy + 30, 218, 170), shade: () => [0, 0, 0], alpha: 0.5 });
  // rim lip, sloped wall, flat floor
  L.push({ poly: ellipse(cx, cy, 214, 166), shade: vgrad(cy - 166, cy + 166, '#a3a9b0', '#4a4f56') });
  L.push({ poly: ellipse(cx, cy + 2, 198, 151), shade: vgrad(cy - 150, cy + 150, '#1f2328', '#4b5158') });
  L.push({ poly: ellipse(cx, cy + 16, 132, 98), shade: vgrad(cy - 82, cy + 114, '#3a3f45', '#2a2e33') });
  // a film of muddy water over the floor
  L.push({ poly: ellipse(cx, cy + 16, 132, 98), shade: () => hex('#6b5a3a'), alpha: 0.25 });

  // gravel: rocks spread over the floor and lower wall, each with a highlight
  const ROCK = ['#7b746a', '#8e8576', '#5f5a53', '#9a8f7c', '#6e6458', '#a39a8a'].map(hex);
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd());
    const x = cx + 30 + Math.cos(a) * d * 128;
    const y = cy + 6 + Math.sin(a) * d * 102;
    if (x < cx + 10 && y > cy + 30) continue; // keep the gold tail clear
    const r = 7 + rnd() * 13;
    const col = ROCK[Math.floor(rnd() * ROCK.length)];
    L.push({ poly: blob(x + 2, y + 3, r, rnd), shade: () => [0, 0, 0], alpha: 0.35 });
    L.push({ poly: blob(x, y, r, rnd), shade: () => col });
    L.push({ poly: ellipse(x - r * 0.3, y - r * 0.3, r * 0.35, r * 0.25, 12), shade: () => [255, 255, 255], alpha: 0.18 });
  }

  // black sand trailing toward the front-left, where gold settles
  for (let i = 0; i < 110; i++) {
    const t = rnd();
    const x = cx - 130 + t * 140 + (rnd() - 0.5) * 40;
    const y = cy + 64 + Math.sin(t * Math.PI) * 28 + (rnd() - 0.5) * 30;
    L.push({ poly: ellipse(x, y, 3, 2.5, 8), shade: () => hex('#14161a'), alpha: 0.9 });
  }
  // gold flakes in the black sand: big enough to read at home-screen size
  const FLAKES: [number, number, number][] = [
    [-84, 74, 19], [-40, 92, 15], [-108, 98, 11], [-6, 74, 10], [-66, 110, 9], [-20, 112, 7], [-118, 66, 7], [10, 100, 6],
  ];
  for (const [dx, dy, r] of FLAKES) {
    const x = cx + dx;
    const y = cy + dy;
    L.push({ poly: blob(x + 2, y + 3, r, rnd, 7), shade: () => [0, 0, 0], alpha: 0.4 });
    L.push({ poly: blob(x, y, r, rnd, 7), shade: vgrad(y - r, y + r, '#fff3b8', '#d4921c') });
  }
  L.push({ poly: star(cx - 78, cy + 64, 40), shade: () => hex('#fff8e0') });
  L.push({ poly: star(cx - 30, cy + 84, 20), shade: () => hex('#fff8e0'), alpha: 0.9 });
  // shine on the far rim lip
  L.push({ poly: ellipse(cx - 40, cy - 153, 44, 4, 24), shade: () => [255, 255, 255], alpha: 0.4 });
  return L;
}

/** Map local (u along the axis, v across it) points onto the canvas from origin `o` along unit `d`. */
function local(o: Pt, d: Pt, pts: Pt[]): Pt[] {
  const n: Pt = [-d[1], d[0]];
  return pts.map(([u, v]): Pt => [o[0] + d[0] * u + n[0] * v, o[1] + d[1] * u + n[1] * v]);
}
const unit = (a: Pt, b: Pt): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
};
/** Shade across a shape: c0 on one side of the axis through `o`, c1 on the other, over width w. */
const across = (o: Pt, d: Pt, w: number, c0: string, c1: string): Shade => (x, y) => {
  const t = ((x - o[0]) * -d[1] + (y - o[1]) * d[0]) / w + 0.5;
  return mix(hex(c0), hex(c1), t);
};

/** Crossed pick and shovel over a gold nugget: the prospector's emblem. */
function pickLayers(): Layer[] {
  const L: Layer[] = [];
  const rnd = rng(1849);

  // shovel (behind): grip bottom-left, blade top-right
  const sA: Pt = [126, 398];
  const sB: Pt = [306, 218];
  const sd = unit(sA, sB);
  const sLen = Math.hypot(sB[0] - sA[0], sB[1] - sA[1]);
  L.push({ poly: local([sA[0] + 6, sA[1] + 8], sd, [[0, -11], [sLen + 160, -42], [sLen + 160, 42], [0, 11]]), shade: () => [0, 0, 0], alpha: 0.35 });
  L.push({ poly: local(sA, sd, [[0, -10], [sLen, -10], [sLen, 10], [0, 10]]), shade: across(sA, sd, 20, '#c58f52', '#6e4422') });
  L.push({ poly: local(sA, sd, [[-18, -30], [0, -30], [0, 30], [-18, 30]]), shade: across(sA, sd, 60, '#b98446', '#5f3a1c') }); // T grip
  const blade: Pt[] = [[0, -11], [30, -13], [40, -42], [52, -46], [112, -42], [166, 0], [112, 42], [52, 46], [40, 42], [30, 13], [0, 11]];
  L.push({ poly: local(sB, sd, blade), shade: across(sB, sd, 88, '#e3e7eb', '#5a6169') });
  L.push({ poly: local(sB, sd, [[48, -4], [140, -3], [140, 3], [48, 4]]), shade: () => [0, 0, 0], alpha: 0.18 }); // spine
  L.push({ poly: local(sB, sd, [[0, -11], [30, -13], [30, 13], [0, 11]]), shade: () => hex('#3d4248') }); // socket

  // pick (in front): handle bottom-right, head top-left
  const pA: Pt = [392, 396];
  const pB: Pt = [168, 172];
  const pd = unit(pA, pB);
  const pLen = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
  L.push({ poly: local([pA[0] + 6, pA[1] + 8], pd, [[0, -12], [pLen, -12], [pLen, 12], [0, 12]]), shade: () => [0, 0, 0], alpha: 0.35 });
  L.push({ poly: local(pA, pd, [[0, -11], [pLen + 14, -12], [pLen + 14, 12], [0, 11]]), shade: across(pA, pd, 24, '#c99556', '#6b4120') });
  // curved, double-pointed head perpendicular to the handle, bending back toward it
  const head: Pt[] = [];
  const H = 17;
  const HL = 116;
  for (let i = 0; i <= 24; i++) {
    const t = -1 + i / 12;
    const h = H * (1 - 0.88 * Math.abs(t));
    head.push([-26 * t * t + h, t * HL]);
  }
  for (let i = 24; i >= 0; i--) {
    const t = -1 + i / 12;
    const h = H * (1 - 0.88 * Math.abs(t));
    head.push([-26 * t * t - h, t * HL]);
  }
  L.push({ poly: local([pB[0] + 6, pB[1] + 8], pd, head), shade: () => [0, 0, 0], alpha: 0.35 });
  L.push({ poly: local(pB, pd, head), shade: across(pB, [pd[1], -pd[0]], 40, '#5a6169', '#e6eaee') });
  L.push({ poly: local(pB, pd, [[-20, -15], [20, -15], [20, 15], [-20, 15]]), shade: across(pB, pd, 30, '#9aa1a8', '#41474e') }); // eye

  // gold nugget at the foot of the crossing
  const nc: Pt = [256, 384];
  L.push({ poly: ellipse(nc[0] + 6, nc[1] + 50, 84, 15), shade: () => [0, 0, 0], alpha: 0.45 });
  // smooth lumpy outline: a few low-frequency bumps rather than sharp facets
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const nug: Pt[] = Array.from({ length: 72 }, (_, i): Pt => {
    const a = (i / 72) * Math.PI * 2;
    const r = 66 * (1 + 0.1 * Math.sin(3 * a + ph[0]) + 0.07 * Math.sin(5 * a + ph[1]) + 0.04 * Math.sin(8 * a + ph[2]));
    return [nc[0] + Math.cos(a) * r * 1.1, nc[1] + Math.sin(a) * r * 0.82];
  });
  L.push({ poly: nug, shade: vgrad(nc[1] - 56, nc[1] + 54, '#fff1a6', '#a8680c') });
  // lower rim in shadow, then soft highlights on the upper lumps
  L.push({ poly: ellipse(nc[0] + 4, nc[1] + 30, 60, 22, 32), shade: () => hex('#7a4a06'), alpha: 0.22 });
  L.push({ poly: ellipse(nc[0] - 18, nc[1] - 22, 26, 14, 32), shade: () => hex('#fffbe0'), alpha: 0.6 });
  L.push({ poly: ellipse(nc[0] + 24, nc[1] - 10, 14, 8, 24), shade: () => hex('#fffbe0'), alpha: 0.4 });
  L.push({ poly: star(nc[0] + 46, nc[1] - 46, 34), shade: () => hex('#fff8e0') });
  L.push({ poly: star(nc[0] - 58, nc[1] - 4, 14), shade: () => hex('#fff8e0'), alpha: 0.85 });
  return L;
}

// Artwork in a 512x512 design space, painted back to front.
const INGOT: Layer[] = [
  // soft shadow under the ingot
  { poly: Array.from({ length: 48 }, (_, i): Pt => [256 + Math.cos((i / 48) * Math.PI * 2) * 185, 372 + Math.sin((i / 48) * Math.PI * 2) * 26]), shade: () => [0, 0, 0], alpha: 0.45 },
  // front face
  { poly: [[136, 262], [376, 262], [420, 364], [92, 364]], shade: vgrad(262, 364, '#f7cd5c', '#9c5f10') },
  // top face
  { poly: [[178, 196], [334, 196], [376, 262], [136, 262]], shade: vgrad(196, 262, '#fff1bf', '#f2c14e') },
  // bright lip where the faces meet
  { poly: [[136, 260], [376, 260], [378, 266], [134, 266]], shade: () => hex('#fff6d8') },
  // stamped panel on the front
  { poly: [[178, 286], [334, 286], [352, 340], [160, 340]], shade: vgrad(286, 340, '#c98a1f', '#e7b44a'), alpha: 0.55 },
  // sparkles
  { poly: star(372, 150, 46), shade: () => hex('#fff8e0') },
  { poly: star(150, 168, 22), shade: () => hex('#fff8e0'), alpha: 0.85 },
];

function background(x: number, y: number): RGB {
  const d = Math.hypot(x - 256, y - 230) / 360;
  return mix(hex('#3a2c14'), hex('#0b0f1a'), d);
}

const DESIGNS: Record<string, () => Layer[]> = { ingot: () => INGOT, pan: panLayers, pick: pickLayers };

function render(size: number, layers: Layer[]): Buffer {
  // bounding boxes let each sample skip the shapes that can't contain it
  const LAYERS = layers.map((l) => {
    const xs = l.poly.map((p) => p[0]);
    const ys = l.poly.map((p) => p[1]);
    return { ...l, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const SS = 4;
  const scale = 512 / size;
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * scale;
          const y = (py + (sy + 0.5) / SS) * scale;
          let c = background(x, y);
          for (const l of LAYERS) if (x >= l.x0 && x <= l.x1 && y >= l.y0 && y <= l.y1 && inside(l.poly, x, y)) c =mix(c, l.shade(x, y), l.alpha ?? 1);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const i = (py * size + px) * 4;
      const n = SS * SS;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return png(size, rgba);
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function png(size: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Usage: make-icons.ts [design] [--preview <dir>]
//   design: ingot (default) | pan
//   --preview writes a single 512px <design>.png to <dir> instead of replacing public/.
const args = process.argv.slice(2);
const pi = args.indexOf('--preview');
const previewDir = pi >= 0 ? args[pi + 1] : null;
const design = args.find((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1)) ?? 'ingot';
const layers = DESIGNS[design]?.();
if (!layers) throw new Error(`Unknown design "${design}". Options: ${Object.keys(DESIGNS).join(', ')}`);

if (previewDir) {
  mkdirSync(previewDir, { recursive: true });
  writeFileSync(`${previewDir}/${design}.png`, render(512, layers));
  console.log(`${previewDir}/${design}.png (preview)`);
} else {
  mkdirSync('public', { recursive: true });
  for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon-32.png', 32]] as const) {
    writeFileSync(`public/${name}`, render(size, layers));
    console.log(`public/${name} (${size}x${size}, ${design})`);
  }
}
