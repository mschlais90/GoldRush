import { useEffect, useRef } from 'react';
import { GRID_H, GRID_W, LAYER_M, cx, cy } from '../../sim/geology/types';
import { columnLabel } from '../../sim/market';
import { COSTS, bestIntercept } from '../../sim/prospecting';
import { REGIONS, REGION_ORDER } from '../../sim/regions';
import type { GameState, Listing } from '../../sim/state';
import { getTruth } from '../../sim/truth';
import { grade, money } from '../format';
import { store } from '../store';

function SurfacePreview({ l }: { l: Listing }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    const t = getTruth(l.seed, l.region); // public: terrain + streams only
    const cs = 3;
    for (let c = 0; c < GRID_W * GRID_H; c++) {
      const e = t.terrain[c];
      ctx.fillStyle = t.stream[c] ? '#3c6eaa' : `rgb(${90 + 60 * e},${100 + 50 * e},${60 + 30 * e})`;
      ctx.fillRect(cx(c) * cs, cy(c) * cs, cs, cs);
    }
    ctx.fillStyle = '#c050c0';
    for (const h of l.report) ctx.fillRect(cx(h.c) * cs - 1, cy(h.c) * cs - 1, 5, 5);
  }, [l]);
  return <canvas ref={ref} width={GRID_W * 3} height={GRID_H * 3} className="preview" />;
}

export function LandOffice({ s, onClose }: { s: GameState; onClose: () => void }) {
  const locked = REGION_ORDER.filter((r) => !s.unlockedRegions.includes(r));
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🏛 Land Office</h2>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>
        <p className="muted">
          Claims for sale. Seller reports may be exaggerated or even <b>salted</b>. Due diligence ({money(COSTS.dueDiligence.cost)},{' '}
          {COSTS.dueDiligence.days} days) checks their claims and maps the surface geology.
        </p>
        <div className="listings">
          {s.listings.length === 0 && <p>No claims for sale right now. Check back next week.</p>}
          {s.listings.map((l) => {
            const t = getTruth(l.seed, l.region);
            const hasStream = t.streamPath.length > 0;
            return (
              <div className="listing" key={l.id}>
                <SurfacePreview l={l} />
                <div className="listing-body">
                  <h3>{l.name}</h3>
                  <div className="muted">{REGIONS[l.region].name}</div>
                  <div className="price">{money(l.ask, false)}</div>
                  <div className="muted small">
                    {hasStream ? 'Creek crosses the claim' : 'No surface water'} · offer expires in {l.expiresDay - s.day} days
                  </div>
                  {l.report.length > 0 ? (
                    <div className="report">
                      <b>Seller's drill report:</b>
                      {l.report.map((h, i) => {
                        const bi = bestIntercept(h.results);
                        return (
                          <div key={i} className="small">
                            Hist-{i + 1} at {columnLabel(h.c)}, {h.results.length * LAYER_M} m:{' '}
                            {bi ? `${bi.metres} m @ ${grade(bi.grade)}` : 'nothing significant'}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="small muted">Raw ground, no previous work.</div>
                  )}
                  {l.dd === 'done' && <div className="dd">{l.ddResult}</div>}
                  {l.dd === 'pending' && <div className="dd muted">Geologist on site… report in {l.ddDay - s.day} days</div>}
                  <div className="row">
                    <button data-tut="buy-claim" disabled={s.cash < l.ask} onClick={() => store.dispatch({ type: 'buyListing', listingId: l.id }).ok && onClose()}>
                      Buy claim
                    </button>
                    {l.dd === 'none' && (
                      <button className="secondary" onClick={() => store.dispatch({ type: 'dueDiligence', listingId: l.id })}>
                        Due diligence
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {locked.length > 0 && (
          <p className="muted small">
            Locked regions: {locked.map((r) => `${REGIONS[r].name} (net worth ${money(REGIONS[r].unlockNetWorth)})`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}
