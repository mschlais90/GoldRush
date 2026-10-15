import { useState } from 'react';
import { appraise, creditLimit, equipmentValue, modelKey } from '../../sim/economy';
import { avgGrade, getModel, ounces, resourceReport, type ResourceClass } from '../../sim/estimate';
import { REGIONS } from '../../sim/regions';
import type { GameState, Property } from '../../sim/state';
import { grade, money, oz } from '../format';
import { store } from '../store';
import { Sparkline } from './TopBar';

export function ReportPanel({ s, p }: { s: GameState; p: Property }) {
  const [confirmSell, setConfirmSell] = useState(false);
  const model = getModel(modelKey(p), p.knowledge);
  const r = resourceReport(model, p.mine.cutoff, p.mine);
  const value = appraise(p, s.goldPrice);
  const L = p.ledger;
  const pnl = L.revenue - L.land - L.explore - L.capex - L.opex;
  const row = (name: string, c: ResourceClass, pm: string) => (
    <tr>
      <td>{name}</td>
      <td>{Math.round(c.tonnes / 1000).toLocaleString()}k t</td>
      <td>{grade(avgGrade(c))}</td>
      <td>
        {oz(ounces(c))} <span className="muted small">{pm}</span>
      </td>
    </tr>
  );
  return (
    <div className="panel">
      <h3>{p.name}</h3>
      <div className="muted small">
        {REGIONS[p.region].name} · bought day {p.boughtDay} for {money(p.purchasePrice)}
      </div>
      <h4>Resource estimate (cutoff {grade(p.mine.cutoff)})</h4>
      <table className="res">
        <thead>
          <tr>
            <th>Class</th>
            <th>Tonnes</th>
            <th>Grade</th>
            <th>Gold</th>
          </tr>
        </thead>
        <tbody>
          {row('Measured', r.measured, '')}
          {row('Indicated', r.indicated, '±25%')}
          {row('Inferred', r.inferred, '±60%')}
        </tbody>
      </table>
      <div className="small muted">
        Measured = sampled blocks. Indicated/Inferred are interpolated: drill more to firm them up. In-situ value at today's price:{' '}
        {money((ounces(r.measured) + ounces(r.indicated) + ounces(r.inferred)) * s.goldPrice)}
      </div>
      <h4>Ledger</h4>
      <div className="kv">
        <span>Land</span>
        <span>{money(-L.land)}</span>
        <span>Exploration</span>
        <span>{money(-L.explore)}</span>
        <span>Capital</span>
        <span>{money(-L.capex)}</span>
        <span>Operating</span>
        <span>{money(-L.opex)}</span>
        <span>Gold produced</span>
        <span className="pos">{money(L.revenue)}</span>
        <span>
          <b>Project P&amp;L</b>
        </span>
        <span className={pnl >= 0 ? 'pos' : 'neg'}>
          <b>{money(pnl)}</b>
        </span>
      </div>
      <h4>Sell the claim</h4>
      <div className="small">
        A buyer would pay <b>{money(value, false)}</b> based on your data
        {equipmentValue(p) > 0 && <> plus {money(equipmentValue(p))} for owned equipment</>}
        {p.bond > 0 && <> plus your bond back</>}.
      </div>
      {!confirmSell ? (
        <button className="secondary" onClick={() => setConfirmSell(true)}>
          Sell {p.name}…
        </button>
      ) : (
        <div className="row">
          <button
            className="danger"
            onClick={() => {
              store.dispatch({ type: 'sellProperty', propId: p.id });
              setConfirmSell(false);
            }}
          >
            Confirm sale
          </button>
          <button className="secondary" onClick={() => setConfirmSell(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function BankPanel({ s }: { s: GameState }) {
  const [amt, setAmt] = useState(50000);
  const limit = creditLimit(s);
  return (
    <div className="panel">
      <h3>Bank &amp; Bullion</h3>
      <div className="kv">
        <span>Gold price</span>
        <span>${s.goldPrice.toFixed(2)}/oz</span>
        <span>Gold in vault</span>
        <span>
          {oz(s.goldOz)} ≈ {money(s.goldOz * s.goldPrice)}
        </span>
      </div>
      <Sparkline data={s.priceHistory} width={300} height={60} />
      <div className="row">
        <button data-tut="sell-gold" disabled={s.goldOz <= 0} onClick={() => store.dispatch({ type: 'sellGold', oz: s.goldOz })}>
          Sell all gold
        </button>
        <button className="secondary" disabled={s.goldOz < 10} onClick={() => store.dispatch({ type: 'sellGold', oz: Math.floor(s.goldOz / 2) })}>
          Sell half
        </button>
      </div>
      <div className="small muted">Hold gold to bet on the price, but unguarded gold attracts thieves.</div>
      <h4>Loans (9% APR)</h4>
      <div className="kv">
        <span>Owed</span>
        <span className={s.loan > 0 ? 'neg' : ''}>{money(s.loan, false)}</span>
        <span>Credit limit</span>
        <span>{money(limit, false)}</span>
      </div>
      <div className="small muted">The bank lends against equipment and your proven resources. Drill out a deposit to borrow more.</div>
      <div className="row">
        <input type="number" step={10000} min={0} value={amt} onChange={(e) => setAmt(Math.max(0, Number(e.target.value)))} />
        <button onClick={() => store.dispatch({ type: 'borrow', amount: amt })}>Borrow</button>
        <button className="secondary" onClick={() => store.dispatch({ type: 'repay', amount: amt })}>
          Repay
        </button>
      </div>
    </div>
  );
}
