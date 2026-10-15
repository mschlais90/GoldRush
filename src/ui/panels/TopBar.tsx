import { netWorth } from '../../sim/economy';
import type { GameState } from '../../sim/state';
import { dateLabel, money, oz } from '../format';
import { useFlash } from '../fx';
import { store } from '../store';

export function Sparkline({ data, width = 120, height = 28 }: { data: number[]; width?: number; height?: number }) {
  const pts = data.slice(-120);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const d = pts
    .map((v, i) => `${(i / (pts.length - 1)) * width},${height - ((v - min) / Math.max(1, max - min)) * (height - 2) - 1}`)
    .join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg width={width} height={height} className="spark">
      <polyline points={d} fill="none" stroke={up ? '#7bd88f' : '#ff7b72'} strokeWidth="1.5" />
    </svg>
  );
}

/** A top-bar stat that flashes green/red and floats the change when its value moves. */
function FlashStat(p: { label: string; value: number; threshold: number; text: string; cls?: string; big?: boolean; fmt: (d: number) => string }) {
  const f = useFlash(p.value, p.threshold);
  return (
    <div className={`stat ${p.big ? 'big' : ''}`}>
      <span className="lbl">{p.label}</span>
      <span className={`${p.cls ?? ''} ${f.dir ? `flash-${f.dir}` : ''}`} key={f.key}>
        {p.text}
      </span>
      {f.dir && (
        <span key={`d${f.key}`} className={`float-delta ${f.dir}`}>
          {f.delta > 0 ? '+' : '−'}
          {p.fmt(Math.abs(f.delta))}
        </span>
      )}
    </div>
  );
}

export function TopBar({ s, onQuit }: { s: GameState; onQuit: () => void }) {
  const w = netWorth(s);
  const prev = s.priceHistory[s.priceHistory.length - 2] ?? s.goldPrice;
  const chg = ((s.goldPrice - prev) / prev) * 100;
  const daysLeft = s.endDay - s.day;
  const adv = (days: number) => store.dispatch({ type: 'advance', days });
  return (
    <header className="topbar">
      <div className="brand">GoldRush</div>
      <div className="stat">
        <span className="lbl">Date</span>
        <span>{dateLabel(s.day)}</span>
        <span className="sub">{daysLeft} days left</span>
      </div>
      <FlashStat label="Cash" value={s.cash} threshold={1} text={money(s.cash)} cls={s.cash < 20000 ? 'neg' : ''} fmt={(d) => money(d)} />
      <FlashStat label="Gold held" value={s.goldOz} threshold={0.05} text={oz(s.goldOz)} fmt={(d) => `${d.toFixed(1)} oz`} />
      <div className="stat">
        <span className="lbl">Gold price</span>
        <span>
          ${s.goldPrice.toFixed(0)}/oz <span className={chg >= 0 ? 'pos' : 'neg'}>{chg >= 0 ? '▲' : '▼'}{Math.abs(chg).toFixed(1)}%</span>
        </span>
      </div>
      <Sparkline data={s.priceHistory} />
      {s.loan > 0 && (
        <div className="stat">
          <span className="lbl">Loan</span>
          <span className="neg">{money(s.loan)}</span>
        </div>
      )}
      <FlashStat label="Net worth" value={w} threshold={100} text={money(w)} cls="gold" big fmt={(d) => money(d)} />
      <div className="advance">
        <button data-tut="advance-day" onClick={() => adv(1)} title="Space">+1 day</button>
        <button data-tut="advance-week" onClick={() => adv(7)} title="W">+1 week</button>
        <button data-tut="advance-month" onClick={() => adv(30)} title="M">+30 days</button>
      </div>
      <button className="ghost" onClick={onQuit} title="Save & return to title">☰</button>
    </header>
  );
}
