import { EQUIPMENT, EQUIP_CATEGORIES, EQUIP_ORDER, LEASE_RATE, resaleValue } from '../../sim/equipment';
import { GRAMS_PER_OZ, GRID_H, GRID_W, LAYER_M } from '../../sim/geology/types';
import { pitForecast } from '../../sim/forecast';
import { MAX_CUTOFF, UNDERGROUND, pitBlocksRemaining } from '../../sim/mining';
import { COSTS } from '../../sim/prospecting';
import { REGIONS, isWinter } from '../../sim/regions';
import type { GameState, Property } from '../../sim/state';
import { money } from '../format';
import { Help } from '../Help';
import { store } from '../store';
import type { Tool } from '../map/MapCanvas';
import { useState } from 'react';

interface Props {
  s: GameState;
  p: Property;
  tool: Tool;
  setTool: (t: Tool) => void;
  pitDepth: number;
  setPitDepth: (n: number) => void;
  stopeRange: [number, number];
  setStopeRange: (r: [number, number]) => void;
}

export function MinePanel({ s, p, tool, setTool, pitDepth, setPitDepth, stopeRange, setStopeRange }: Props) {
  const m = p.mine;
  const region = REGIONS[p.region];
  const send = store.dispatch;
  const remaining = pitBlocksRemaining(m);
  return (
    <div className="panel">
      <h3>Mine</h3>
      <div className="kv">
        <span>Permit</span>
        <span>
          {p.permit === 'granted' && <b className="pos">Granted</b>}
          {p.permit === 'pending' && `Pending: day ${p.permitDay}`}
          {p.permit === 'none' && (
            <button data-tut="apply-permit" onClick={() => send({ type: 'applyPermit', propId: p.id })}>
              Apply ({money(COSTS.permit.cost)} + {money(COSTS.permit.bond)} bond, {region.permitDays}d)
            </button>
          )}
        </span>
        <span>Open pit</span>
        <span>
          {m.status}
          {isWinter(region, s.day) ? ' ❄' : ''}
        </span>
        <span>Ore mined</span>
        <span>{Math.round(m.oreT).toLocaleString()} t</span>
        <span>Waste moved</span>
        <span>{Math.round(m.wasteT).toLocaleString()} t</span>
        <span>Stockpiles</span>
        <span>
          {Math.round(m.gravel.t).toLocaleString()} t gravel · {Math.round(m.rock.t).toLocaleString()} t rock
        </span>
        <span>Gold poured</span>
        <span className="gold">{(m.goldG / GRAMS_PER_OZ).toFixed(1)} oz</span>
      </div>
      <RecentResults p={p} />

      <h4>Pit design</h4>
      <div className="row wrap">
        <button data-tut="paint-pit" className={`tool-sm ${tool === 'pit' ? 'active' : ''}`} onClick={() => setTool(tool === 'pit' ? 'inspect' : 'pit')}>
          ✏ Paint pit
        </button>
        <label>
          floor <b className="fixed-num">{pitDepth * LAYER_M} m</b>
          <input type="range" min={0} max={24} value={pitDepth} onChange={(e) => setPitDepth(Number(e.target.value))} />
        </label>
        <button className="secondary small-btn" onClick={() => send({ type: 'clearPit', propId: p.id })}>
          Clear plan
        </button>
      </div>
      <div className="small muted">
        Click-drag on the map to dig to the chosen floor (0 m erases). Walls are auto-sloped. {remaining} blocks left in plan.
      </div>
      <label className="small">
        Cutoff grade <b>{m.cutoff.toFixed(2)} g/t</b>. Blocks below this go to the waste dump.
        <input type="range" min={0} max={MAX_CUTOFF} step={0.05} value={m.cutoff} onChange={(e) => send({ type: 'setCutoff', propId: p.id, cutoff: Number(e.target.value) })} />
      </label>
      <ForecastBox s={s} p={p} />

      <Underground p={p} tool={tool} setTool={setTool} stopeRange={stopeRange} setStopeRange={setStopeRange} />

      <h4>Equipment on site</h4>
      {p.equipment.length === 0 && <div className="small muted">None yet.</div>}
      {p.equipment.map((u) => (
        <div key={u.id} className="equip-row">
          <span>
            {EQUIPMENT[u.type].name} {u.leased && <span className="tag">leased</span>}
            {u.brokenUntil > s.day && <span className="tag neg">broken: {u.brokenUntil - s.day}d</span>}
          </span>
          <button className="secondary small-btn" onClick={() => send({ type: 'sellEquipment', propId: p.id, unitId: u.id })}>
            {u.leased ? 'Return' : `Sell ${money(resaleValue(u.type))}`}
          </button>
        </div>
      ))}

      {EQUIP_CATEGORIES.map((cat) => (
        <div key={cat.name}>
          <h4>{cat.name}</h4>
          <div className="equip-shop">
            {EQUIP_ORDER.filter((id) => cat.kinds.includes(EQUIPMENT[id].kind)).map((id) => {
              const e = EQUIPMENT[id];
              const spec =
                e.kind === 'dig'
                  ? `${e.capacity} t/d, to ${(e.maxDepth ?? 0) * LAYER_M} m`
                  : e.kind === 'ug'
                    ? `${e.capacity} t/d underground`
                  : e.kind === 'process'
                    ? `${e.capacity} t/d · gravel ${Math.round(e.recovery!.gravel * 100)}% / rock ${Math.round(e.recovery!.rock * 100)}%`
                    : '';
              const tag = e.kind === 'process' ? (e.recovery!.rock > 0 ? 'gravel + hard rock' : 'gravel only') : e.kind === 'ug' ? 'underground' : '';
              return (
                <div key={id} className="shop-row" title={e.desc} data-tut={`shop-${id}`}>
                  <div>
                    <b>{e.name}</b> {tag && <span className={`tag ${tag === 'gravel only' ? 'warn-tag' : ''}`}>{tag}</span>}
                    <div className="small muted">
                      {spec} {spec && '·'} opex {money(e.opexPerDay)}/d
                    </div>
                  </div>
                  <div className="shop-btns">
                    <button className="small-btn" disabled={s.cash < e.price} onClick={() => send({ type: 'buyEquipment', propId: p.id, equip: id, lease: false })}>
                      Buy {money(e.price)}
                    </button>
                    <button className="secondary small-btn" onClick={() => send({ type: 'buyEquipment', propId: p.id, equip: id, lease: true })}>
                      Lease {money(e.price * LEASE_RATE)}/d
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Revenue vs costs over the last 30 days, so it's obvious whether the operation pays. */
function RecentResults({ p }: { p: Property }) {
  const rows = p.pnl ?? [];
  if (rows.length === 0) return null;
  const rev = rows.reduce((s, r) => s + r.rev, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const net = rev - cost;
  return (
    <div className={`results ${net >= 0 ? 'up' : 'down'}`}>
      <span className="small muted">Last {rows.length} days</span>
      <span className="small">
        gold {money(rev)} − costs {money(cost)} = <b className={net >= 0 ? 'pos' : 'neg'}>{money(net)}</b>
      </span>
    </div>
  );
}

/** Feasibility study for the planned pit: what it should produce, cost, and what's missing. */
function ForecastBox({ s, p }: { s: GameState; p: Property }) {
  const f = pitForecast(p, s.goldPrice);
  const send = store.dispatch;
  if (!f) {
    return (
      <div className="forecast" data-tut="forecast">
        <b>Pit forecast</b>
        <div className="small muted">Paint a pit to see what it would produce and which equipment it needs.</div>
      </div>
    );
  }
  const days = (d: number) => (Number.isFinite(d) ? `${Math.ceil(d)} d` : '—');
  const ready = Number.isFinite(f.days);
  return (
    <div className="forecast" data-tut="forecast">
      <b>Pit forecast</b> <span className="small muted">(from your estimate; confidence {Math.round(f.confidence * 100)}%)</span>
      <div className="kv small">
        <span>Ore</span>
        <span>
          {Math.round(f.oreT / 1000).toLocaleString()}k t @ {f.avgGrade.toFixed(2)} g/t ({Math.round(f.gravelOreT / 1000)}k gravel ·{' '}
          {Math.round(f.rockOreT / 1000)}k hard rock)
        </span>
        <span>Waste</span>
        <span>{Math.round(f.wasteT / 1000).toLocaleString()}k t</span>
        <span>Gold</span>
        <span>
          {Math.round(f.containedOz).toLocaleString()} oz in the ground → {ready ? `${Math.round(f.recoveredOz).toLocaleString()} oz recovered` : 'needs equipment'}
        </span>
        <span>Time</span>
        <span>
          dig {days(f.digDays)} · mill {days(f.millDays)}
        </span>
        {ready && (
          <>
            <span>Profit</span>
            <span>
              {money(f.revenue)} − {money(f.costs)} = <b className={f.profit >= 0 ? 'pos' : 'neg'}>{money(f.profit)}</b>
            </span>
          </>
        )}
      </div>
      {f.warnings.map((w, i) => (
        <div key={i} className="fc-warn small">
          ⚠ {w}
        </div>
      ))}
      {f.tips.map((t, i) => (
        <div key={i} className="fc-tip small">
          💡 {t}
        </div>
      ))}
      {f.suggested.length > 0 && (
        <div className="fc-suggest" data-tut="suggested">
          <div className="small">
            <b>Suggested equipment for this pit:</b>
          </div>
          {f.suggested.map((id) => (
            <div key={id} className="equip-row">
              <span className="small">{EQUIPMENT[id].name}</span>
              <span className="row" style={{ margin: 0 }}>
                <button className="small-btn" onClick={() => send({ type: 'buyEquipment', propId: p.id, equip: id, lease: true })}>
                  Lease {money(EQUIPMENT[id].price * LEASE_RATE)}/d
                </button>
                <button className="secondary small-btn" disabled={s.cash < EQUIPMENT[id].price} onClick={() => send({ type: 'buyEquipment', propId: p.id, equip: id, lease: false })}>
                  Buy {money(EQUIPMENT[id].price)}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Underground({
  p,
  tool,
  setTool,
  stopeRange,
  setStopeRange,
}: Pick<Props, 'p' | 'tool' | 'setTool' | 'stopeRange' | 'setStopeRange'>) {
  const m = p.mine;
  const sh = m.shaft;
  const send = store.dispatch;
  const [sinkTo, setSinkTo] = useState(sh ? Math.max(sh.target, 10) : 10);
  const extra = sh ? Math.max(0, sinkTo - sh.target) : 0;
  const [from, to] = stopeRange;
  const hasCrew = p.equipment.some((e) => EQUIPMENT[e.type].kind === 'ug');
  const hasRockMill = p.equipment.some((e) => EQUIPMENT[e.type].kind === 'process' && EQUIPMENT[e.type].recovery!.rock > 0);
  const tooShallow = !!sh && m.stopes.some((i) => Math.floor(i / (GRID_W * GRID_H)) >= sh.depth);
  const steps: { done: boolean; text: string }[] = [
    { done: p.permit === 'granted', text: 'Get a mining permit (top of this tab).' },
    { done: !!sh, text: `Place a headframe beside the orebody (${money(UNDERGROUND.collarCost)}).` },
    {
      done: !!sh && sh.depth > UNDERGROUND.crownPillar && !tooShallow,
      text: tooShallow ? 'Sink the shaft deeper: some stopes sit below its bottom.' : 'Sink the shaft below the ore you want. Crews can only reach levels above the shaft bottom.',
    },
    { done: hasCrew, text: 'Hire an Underground Mining Crew (Digging Equipment, below).' },
    { done: m.stopes.length > 0 || m.ugOreT > 0, text: 'Paint stopes over the ore on the map, choosing a depth range.' },
    { done: hasRockMill, text: 'Have a hard-rock mill (Crusher + Gravity or CIL). Sluices and trommels cannot treat underground ore.' },
  ];
  const next = steps.findIndex((st) => !st.done);
  return (
    <>
      <h4>
        Underground
        <Help title="Underground mining">
          <p>
            A <b>stope</b> is the room left underground when a block of ore is blasted out. You sink a <b>shaft</b> (a vertical tunnel),
            drive <b>drifts</b> (horizontal tunnels) over to the ore, and the crew blasts each stope and hoists the ore up the shaft to
            your mill. Unlike a pit, there is no waste to strip: only the blocks you choose are mined. It costs more per tonne but works
            through winter.
          </p>
          <h4>Getting started</h4>
          <ol className="ug-steps">
            {steps.map((st, i) => (
              <li key={i} className={st.done ? 'done' : ''}>
                {st.done ? '✓ ' : ''}
                {st.text}
              </li>
            ))}
          </ol>
          <h4>Tips</h4>
          <ul>
            <li>Place the headframe near (not on) the orebody. Every cell of drift from the shaft adds {money(UNDERGROUND.driftCostPerCell)} per block.</li>
            <li>
              Painting stopes queues only blocks in the chosen depth range that your estimate puts above cutoff. A {UNDERGROUND.crownPillar * LAYER_M} m
              crown pillar is left under the pit.
            </li>
            <li>Stoping costs {money(UNDERGROUND.costPerT)}/t plus drift costs.</li>
            <li>
              <b>Follow the vein</b>: when a stope hits ore, the crew also queues the ground around it.
            </li>
          </ul>
        </Help>
      </h4>
      {next >= 0 && (
        <div className="small ug-next">
          <b>
            Step {next + 1}/{steps.length}:
          </b>{' '}
          {steps[next].text}
        </div>
      )}
      {!sh ? (
        <>
          <button className={`tool-sm ${tool === 'shaft' ? 'active' : ''}`} onClick={() => setTool(tool === 'shaft' ? 'inspect' : 'shaft')}>
            ⛫ Place headframe ({money(UNDERGROUND.collarCost)})
          </button>
          {tool === 'shaft' && <div className="small muted">Click a cell near (not on) the orebody.</div>}
        </>
      ) : (
        <>
          <div className="kv">
            <span>Shaft</span>
            <span>
              {sh.depth * LAYER_M} m{sh.target > sh.depth && <> sinking to {sh.target * LAYER_M} m</>}
            </span>
            <span>Status</span>
            <span>{m.ugStatus}</span>
            <span>Stopes queued</span>
            <span>{m.stopes.length} blocks</span>
            <span>Ore / waste</span>
            <span>
              {Math.round(m.ugOreT).toLocaleString()} t / {Math.round(m.ugWasteT).toLocaleString()} t
            </span>
          </div>
          <div className="row wrap">
            <label>
              Sink to <b>{sinkTo * LAYER_M} m</b>
              <input type="range" min={Math.max(1, sh.depth)} max={24} value={sinkTo} onChange={(e) => setSinkTo(Number(e.target.value))} />
            </label>
            <button className="small-btn" disabled={extra === 0} onClick={() => send({ type: 'setShaftDepth', propId: p.id, depth: sinkTo })}>
              Order {money(extra * UNDERGROUND.sinkCostPerLayer)} · {extra * UNDERGROUND.sinkDaysPerLayer}d
            </button>
          </div>
          <div className="row wrap">
            <button className={`tool-sm ${tool === 'stope' ? 'active' : ''}`} onClick={() => setTool(tool === 'stope' ? 'inspect' : 'stope')}>
              ⛏ Paint stopes
            </button>
            <button className="secondary small-btn" onClick={() => send({ type: 'clearStopes', propId: p.id })}>
              Clear stopes
            </button>
          </div>
          <label className="small">
            From <b>{from * LAYER_M} m</b>
            <input type="range" min={0} max={23} value={from} onChange={(e) => setStopeRange([Number(e.target.value), Math.max(Number(e.target.value), to)])} />
          </label>
          <label className="small">
            To <b>{(to + 1) * LAYER_M} m</b>
            <input type="range" min={0} max={23} value={to} onChange={(e) => setStopeRange([Math.min(from, Number(e.target.value)), Number(e.target.value)])} />
          </label>
          <label className="row small" title="When a stope hits ore, also queue the ground around it">
            <input type="checkbox" checked={m.followVein} onChange={(e) => send({ type: 'setFollowVein', propId: p.id, on: e.target.checked })} />
            Follow the vein
          </label>
        </>
      )}
    </>
  );
}
