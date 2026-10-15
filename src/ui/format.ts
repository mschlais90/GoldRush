export function money(n: number, compact = true): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (compact && a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (compact && a >= 1e4) return `${sign}$${(a / 1e3).toFixed(0)}k`;
  return `${sign}$${Math.round(a).toLocaleString()}`;
}

export function oz(n: number): string {
  return n >= 1000 ? `${Math.round(n).toLocaleString()} oz` : `${n.toFixed(1)} oz`;
}

export function grade(g: number): string {
  if (g >= 10) return `${g.toFixed(1)} g/t`;
  return `${g.toFixed(2)} g/t`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function dateLabel(day: number): string {
  const year = Math.floor(day / 365) + 1;
  let doy = day % 365;
  let month = 0;
  while (doy >= MONTH_DAYS[month]) doy -= MONTH_DAYS[month++];
  return `Year ${year}, ${MONTHS[month]} ${doy + 1}`;
}

/** Gold-grade colour ramp (log scale): grey -> brown -> orange -> gold -> white. */
export function gradeColor(g: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.02, [70, 70, 78]],
    [0.2, [120, 90, 60]],
    [0.5, [190, 110, 40]],
    [1.5, [235, 160, 30]],
    [5, [255, 215, 60]],
    [20, [255, 250, 200]],
  ];
  const lg = Math.log10(Math.max(0.02, g));
  for (let i = 1; i < stops.length; i++) {
    const [g1, c1] = stops[i];
    const [g0, c0] = stops[i - 1];
    if (g <= g1) {
      const t = (lg - Math.log10(g0)) / (Math.log10(g1) - Math.log10(g0));
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * Math.max(0, Math.min(1, t)))) as [number, number, number];
    }
  }
  return stops[stops.length - 1][1];
}

export function rgb([r, g, b]: [number, number, number], a = 1): string {
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

/** Blue -> magenta -> red ramp for geochem / geophysics in [0,1]. */
export function heatColor(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  const r = Math.round(40 + 215 * Math.min(1, t * 1.6));
  const g = Math.round(60 + 160 * Math.max(0, t - 0.6) * 2.5);
  const b = Math.round(160 * (1 - t) + 40);
  return [r, Math.min(255, g), b];
}
