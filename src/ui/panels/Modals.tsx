import { useEffect, useState } from 'react';
import { ACHIEVEMENTS } from '../../sim/achievements';
import { annualizedReturn, netWorth } from '../../sim/economy';
import type { GameState, Notice } from '../../sim/state';
import { money, oz } from '../format';
import { loadScores, store } from '../store';
import { CoreLog } from './ExplorePanel';
import { cx, cy, vi } from '../../sim/geology/types';
import { columnLabel } from '../../sim/market';
import { grade } from '../format';
import { GoldBurst } from '../fx';

/** Pops the oldest unseen popup notice. Assay results reveal row-by-row for suspense. */
export function NoticeModal({ s }: { s: GameState }) {
  const n = s.notices.find((x) => x.popup);
  const [shown, setShown] = useState(0);
  useEffect(() => setShown(0), [n?.id]);
  const hole = n?.holeId ? s.properties.find((p) => p.id === n.propId)?.knowledge.holes.find((h) => h.id === n.holeId) : undefined;
  useEffect(() => {
    if (!hole || shown >= hole.depth) return;
    const t = setTimeout(() => setShown((v) => v + 1), 110);
    return () => clearTimeout(t);
  }, [hole, shown]);
  if (!n) return null;
  const close = () => {
    n.popup = false;
    store.touch();
  };
  const p = n.propId ? s.properties.find((x) => x.id === n.propId) : undefined;
  const trench = n.trenchId && p ? p.knowledge.trenches.find((t) => t.id === n.trenchId) : undefined;
  const done = !hole || shown >= hole.depth;
  const hot = n.kind === 'assay' && /@ (\d+\.?\d*)/.exec(n.title);
  const hotGrade = hot ? Number(hot[1]) : 0;
  const bonanza = hotGrade >= 5;
  return (
    <div className="modal-bg">
      {bonanza && done && <GoldBurst key={n.id} intensity={Math.min(2.5, hotGrade / 6)} />}
      <div className={`modal ${bonanza && done ? 'bonanza' : ''} ${n.kind === 'assay' ? 'assay' : ''}`}>
        <h2>{n.kind === 'assay' ? '📜 Assay results' : n.title}</h2>
        {hole && p && <CoreLog p={p} hole={hole} revealCount={shown} />}
        {trench && p && (
          <div className="corelog">
            {trench.cells.map((c) => (
              <div key={c} className="small">
                {columnLabel(c)}:{' '}
                {Array.from({ length: trench.depth }, (_, z) => grade(p.knowledge.assays[vi(cx(c), cy(c), z)] ?? 0)).join(' · ')}
              </div>
            ))}
          </div>
        )}
        {done && <p className={bonanza ? 'gold big-text' : ''}>{n.kind === 'assay' ? n.title : n.body}</p>}
        <div className="row">
          <button onClick={close} disabled={!done && !!hole} autoFocus>
            {done ? 'Continue' : 'Assaying…'}
          </button>
          {!done && (
            <button className="secondary" onClick={() => setShown(99)}>
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GameOverModal({ s, onShowTruth }: { s: GameState; onShowTruth: () => void }) {
  if (!s.gameOver) return null;
  const w = netWorth(s);
  const ret = annualizedReturn(s.startCash, w, s.day);
  const scores = loadScores();
  return (
    <div className="modal-bg">
      <div className="modal">
        <h2>{s.gameOver.reason}</h2>
        <div className="kv">
          <span>Final net worth</span>
          <span className="gold big-text">{money(w, false)}</span>
          <span>Annualized return</span>
          <span className={ret >= 0 ? 'pos' : 'neg'}>{(ret * 100).toFixed(1)}%/yr</span>
          <span>Gold produced</span>
          <span>{oz(s.stats.ozProduced)}</span>
          <span>Holes drilled</span>
          <span>
            {s.stats.holesDrilled} ({s.stats.metresDrilled.toLocaleString()} m)
          </span>
          <span>Best intercept</span>
          <span>
            {s.stats.bestIntercept
              ? `${s.stats.bestIntercept.metres} m @ ${s.stats.bestIntercept.grade.toFixed(2)} g/t (${s.stats.bestIntercept.prop})`
              : 'none'}
          </span>
          <span>Achievements</span>
          <span>
            {s.achievements.length}/{ACHIEVEMENTS.length}
          </span>
        </div>
        <h4>Hall of fame</h4>
        <ol className="scores">
          {scores.slice(0, 8).map((sc, i) => (
            <li key={i}>
              <b>{money(sc.netWorth)}</b> · {(sc.annual * 100).toFixed(0)}%/yr · {sc.label} · {sc.date}
            </li>
          ))}
        </ol>
        <div className="row">
          <button onClick={onShowTruth}>Reveal what was really down there</button>
          <button className="secondary" onClick={() => store.quit()}>
            Title screen
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewsFeed({ s, onSelect }: { s: GameState; onSelect: (n: Notice) => void }) {
  const items = s.notices.slice(-40).reverse();
  return (
    <div className="panel news">
      <h3>News</h3>
      {items.map((n) => (
        <div key={n.id} className={`news-item ${n.kind}`} onClick={() => onSelect(n)}>
          <span className="muted small">d{n.day}</span> <b>{n.title}</b>
          {n.kind !== 'assay' && <div className="small">{n.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function Achievements({ s }: { s: GameState }) {
  return (
    <div className="panel">
      <h3>Achievements</h3>
      {ACHIEVEMENTS.map((a) => (
        <div key={a.id} className={`ach ${s.achievements.includes(a.id) ? 'got' : ''}`}>
          {s.achievements.includes(a.id) ? '🏆' : '🔒'} <b>{a.name}</b> <span className="small muted">{a.desc}</span>
        </div>
      ))}
    </div>
  );
}
