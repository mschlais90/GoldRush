// Small vector sprites for surface clues and map markers.
import { Clue } from '../../sim/geology/types';
import { hash01 } from './terrain';

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function boulder(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, light: string, dark: string, seed: number) {
  const n = 7;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + 0.35 * hash01(i, seed, 5));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.8;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawClue(ctx: CanvasRenderingContext2D, clue: number, x: number, y: number, cs: number, c: number) {
  const mx = x + cs / 2;
  const my = y + cs / 2;
  const r = cs * 0.36;
  switch (clue) {
    case Clue.Outcrop:
      shadow(ctx, mx + r * 0.2, my + r * 0.55, r * 0.9, r * 0.35);
      boulder(ctx, mx, my, r * 0.85, '#b4b0a8', '#5e5a55', c);
      break;
    case Clue.QuartzOutcrop:
    case Clue.VisibleGold: {
      shadow(ctx, mx + r * 0.2, my + r * 0.6, r * 0.9, r * 0.35);
      boulder(ctx, mx, my + r * 0.1, r * 0.8, '#9c968c', '#57534d', c);
      // crystals
      ctx.fillStyle = '#f7f7f2';
      ctx.strokeStyle = 'rgba(80,80,90,0.7)';
      for (const [dx, h] of [
        [-0.35, 0.9],
        [0.05, 1.25],
        [0.4, 0.8],
      ]) {
        const bx = mx + dx * r;
        ctx.beginPath();
        ctx.moveTo(bx - r * 0.16, my + r * 0.2);
        ctx.lineTo(bx - r * 0.16, my - r * (h - 0.4));
        ctx.lineTo(bx, my - r * h);
        ctx.lineTo(bx + r * 0.16, my - r * (h - 0.4));
        ctx.lineTo(bx + r * 0.16, my + r * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      if (clue === Clue.VisibleGold) {
        ctx.fillStyle = '#ffd34d';
        ctx.shadowColor = '#ffcc33';
        ctx.shadowBlur = cs * 0.6;
        for (const [dx, dy] of [
          [-0.2, 0.05],
          [0.25, -0.1],
          [0.05, 0.3],
        ]) {
          ctx.beginPath();
          ctx.arc(mx + dx * r, my + dy * r, r * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }
      break;
    }
    case Clue.Gossan: {
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, r * 1.25);
      g.addColorStop(0, 'rgba(190,80,30,0.95)');
      g.addColorStop(0.6, 'rgba(160,70,30,0.6)');
      g.addColorStop(1, 'rgba(140,60,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mx, my, r * 1.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(230,140,40,0.8)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.arc(mx + (hash01(c, i, 1) - 0.5) * r * 1.4, my + (hash01(i, c, 2) - 0.5) * r * 1.4, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case Clue.VegStress: {
      // a dead, leafless shrub
      ctx.strokeStyle = '#d6b26a';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1.2, cs * 0.08);
      ctx.beginPath();
      ctx.moveTo(mx, my + r);
      ctx.lineTo(mx, my - r * 0.2);
      ctx.moveTo(mx, my + r * 0.2);
      ctx.lineTo(mx - r * 0.7, my - r * 0.6);
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + r * 0.7, my - r * 0.8);
      ctx.moveTo(mx, my - r * 0.2);
      ctx.lineTo(mx - r * 0.15, my - r);
      ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    }
    case Clue.OldWorkings: {
      // collapsed adit: dark hole with timber frame
      shadow(ctx, mx, my + r * 0.5, r, r * 0.4);
      ctx.fillStyle = '#7a6a55';
      ctx.beginPath();
      ctx.arc(mx, my + r * 0.2, r, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#0d0c0b';
      ctx.beginPath();
      ctx.arc(mx, my + r * 0.4, r * 0.6, Math.PI, 0);
      ctx.lineTo(mx + r * 0.6, my + r * 0.6);
      ctx.lineTo(mx - r * 0.6, my + r * 0.6);
      ctx.fill();
      ctx.strokeStyle = '#a07a4a';
      ctx.lineWidth = Math.max(1.5, cs * 0.1);
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.65, my + r * 0.65);
      ctx.lineTo(mx - r * 0.65, my - r * 0.25);
      ctx.lineTo(mx + r * 0.65, my - r * 0.25);
      ctx.lineTo(mx + r * 0.65, my + r * 0.65);
      ctx.stroke();
      break;
    }
  }
}

/** Animated glint used on visible gold and rich drill holes. */
export function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, phase: number) {
  const a = Math.max(0, Math.sin(phase));
  if (a <= 0.05) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = '#fff7d6';
  ctx.lineWidth = 1.2;
  ctx.shadowColor = '#ffd34d';
  ctx.shadowBlur = 6;
  const s = size * (0.6 + 0.4 * a);
  ctx.beginPath();
  ctx.moveTo(x - s, y);
  ctx.lineTo(x + s, y);
  ctx.moveTo(x, y - s);
  ctx.lineTo(x, y + s);
  ctx.stroke();
  ctx.restore();
}
