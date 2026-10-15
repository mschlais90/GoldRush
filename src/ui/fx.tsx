// Visual effects: title backdrop, gold particle burst, value-change flashes.
import { useEffect, useRef, useState } from 'react';

/** Animated title backdrop: dusk sky, layered ridgelines, a headframe, drifting gold dust. */
export function TitleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const dust = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.5 + Math.random() * 1.8,
      v: 0.00015 + Math.random() * 0.0004,
      p: Math.random() * Math.PI * 2,
    }));
    const ridge = (w: number, h: number, base: number, amp: number, freq: number, seed: number) => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const t = x / w;
        const y =
          base -
          amp * (0.55 * Math.sin(t * freq + seed) + 0.3 * Math.sin(t * freq * 2.3 + seed * 1.7) + 0.15 * Math.sin(t * freq * 5.1 + seed * 0.3));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
    };
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#0b0f1a');
      sky.addColorStop(0.55, '#3a2416');
      sky.addColorStop(0.75, '#a0521e');
      sky.addColorStop(1, '#1a120c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // setting sun
      const sx = w * 0.68;
      const sy = h * 0.66;
      const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.45);
      sun.addColorStop(0, 'rgba(255,214,120,0.95)');
      sun.addColorStop(0.08, 'rgba(255,170,60,0.75)');
      sun.addColorStop(0.4, 'rgba(200,90,30,0.18)');
      sun.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
      // ridgelines, far to near
      const layers: [string, number, number, number, number][] = [
        ['#4a2a1c', 0.7, 60, 5, 1.2],
        ['#2e1c14', 0.78, 70, 4, 2.6],
        ['#1a110c', 0.88, 55, 6, 4.1],
      ];
      for (const [color, base, amp, freq, seed] of layers) {
        ridge(w, h, h * base, amp, freq, seed);
        ctx.fillStyle = color;
        ctx.fill();
      }
      // headframe silhouette on the near ridge
      const hx = w * 0.22;
      const hy = h * 0.86;
      ctx.strokeStyle = '#0d0907';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(hx - 34, hy);
      ctx.lineTo(hx, hy - 110);
      ctx.lineTo(hx + 34, hy);
      ctx.moveTo(hx - 24, hy - 35);
      ctx.lineTo(hx + 24, hy - 35);
      ctx.moveTo(hx - 14, hy - 70);
      ctx.lineTo(hx + 14, hy - 70);
      ctx.moveTo(hx, hy - 110);
      ctx.lineTo(hx + 60, hy - 30);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy - 106, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#0d0907';
      ctx.fillRect(hx + 40, hy - 34, 56, 34);
      // gold dust
      const t = now / 1000;
      for (const d of dust) {
        d.y -= d.v * 16;
        if (d.y < -0.02) {
          d.y = 1.02;
          d.x = Math.random();
        }
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + d.p));
        ctx.fillStyle = `rgba(255,${200 + Math.round(40 * tw)},120,${0.55 * tw})`;
        ctx.beginPath();
        ctx.arc((d.x + 0.02 * Math.sin(t + d.p)) * w, d.y * h, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="title-backdrop" />;
}

/** A one-shot burst of gold flakes, used when an assay comes back rich. */
export function GoldBurst({ intensity = 1 }: { intensity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(80 * intensity);
    const parts = Array.from({ length: n }, () => {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 9;
      return { x: w / 2, y: h * 0.45, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, r: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 };
    });
    let raf = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const age = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - age / 2.2);
        ctx.fillStyle = Math.sin(p.rot * 3) > 0 ? '#ffd34d' : '#fff2b0';
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
      }
      if (age < 2.4) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [intensity]);
  return <canvas ref={ref} className="gold-burst" />;
}

/** Returns 'up' / 'down' briefly after `value` changes, for flash animations. */
export function useFlash(value: number, threshold = 0.5): { dir: '' | 'up' | 'down'; delta: number; key: number } {
  const prev = useRef(value);
  const [state, setState] = useState<{ dir: '' | 'up' | 'down'; delta: number; key: number }>({ dir: '', delta: 0, key: 0 });
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (Math.abs(d) < threshold) return;
    setState((s) => ({ dir: d > 0 ? 'up' : 'down', delta: d, key: s.key + 1 }));
    const t = setTimeout(() => setState((s) => ({ ...s, dir: '' })), 1400);
    return () => clearTimeout(t);
  }, [value, threshold]);
  return state;
}
