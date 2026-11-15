// Visual effects: title backdrop, gold particle burst, value-change flashes.
import { useEffect, useRef, useState } from 'react';
import { animateScene, layoutScene, paintScene, type Scene } from './titleScene';
import { MOBILE_MAX_WIDTH } from './useIsMobile';

/** Animated title backdrop: a placer camp at dusk (see titleScene.ts). */
export function TitleBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    // static scenery is painted here once per size; only the moving parts are drawn each frame
    const bg = document.createElement('canvas');
    let scene: Scene | null = null;
    let sceneDpr = 0;
    let sw = 0;
    let sh = 0;
    // offset of the visible window into the (possibly larger) laid-out scene
    let ox = 0;
    let oy = 0;
    let raf = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (!scene || sw !== w || sh !== h || sceneDpr !== dpr) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
        sw = w;
        sh = h;
        ({ scene, ox, oy } = frameScene(w, h));
        sceneDpr = dpr;
        paintScene(bg, scene, dpr);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, -ox * dpr, -oy * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, -ox * dpr, -oy * dpr);
      animateScene(ctx, scene, now / 1000);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="title-backdrop" />;
}

/**
 * Choose the scene to lay out and which part of it to show. Desktop and landscape screens get the
 * scene at exactly the screen size. Portrait phones get a larger virtual scene, cropped: the extra
 * height trims sky off the top (raising the horizon) and the extra width makes the sluice and camp
 * bigger, with the window centred on them.
 */
function frameScene(w: number, h: number): { scene: Scene; ox: number; oy: number } {
  if (w > MOBILE_MAX_WIDTH || h <= w) return { scene: layoutScene(w, h), ox: 0, oy: 0 };
  const vw = Math.round(w * 1.6);
  const vh = Math.round(h * 1.3);
  const scene = layoutScene(vw, vh);
  // centre on the span from the sluice's upstream end to the far side of the tent
  const left = scene.sluice.x;
  const right = scene.tent[0] + 60 * scene.u;
  const ox = Math.max(0, Math.min(vw - w, (left + right) / 2 - w / 2));
  return { scene, ox, oy: vh - h };
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
