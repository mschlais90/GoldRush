import { useState } from 'react';
import { modelKey } from '../../sim/economy';
import { getModel } from '../../sim/estimate';
import { CLUE_NAMES, GRID_D, LAYER_M, cx, cy, vi } from '../../sim/geology/types';
import { columnLabel } from '../../sim/market';
import { COSTS, bestIntercept, drillCost, drillDays, geophysDone, sampleAt, walkAllDone } from '../../sim/prospecting';
import type { GameState, Hole, Property } from '../../sim/state';
import { getTruth } from '../../sim/truth';
import { grade, gradeColor, money, rgb } from '../format';
import { ClueIcon, type Overlay, type Tool } from '../map/MapCanvas';

interface ToolDef {
  id: Tool;
  name: string;
  cost: string;
  desc: string;
}

const TOOLS: ToolDef[] = [
  { id: 'inspect', name: '🔍 Inspect', cost: '', desc: 'Hover or tap a cell to see what it is and what you know. Click a drill hole for its core log.' },
  { id: 'walkover', name: '🥾 Walk-over', cost: `${money(COSTS.walkover.cost)} · ${COSTS.walkover.days}d`, desc: 'Geologist maps outcrops & surface clues in a radius.' },
  { id: 'pan', name: '🥣 Pan creek', cost: `${money(COSTS.pan.cost)} · ${COSTS.pan.days}d`, desc: 'Count gold colors in stream gravel. Gold travels downstream: follow the trail up to its source.' },
  { id: 'soil', name: '🧪 Soil grid', cost: `${money(COSTS.soil.cost)} · ${COSTS.soil.days}d + ${COSTS.soil.labDays}d lab`, desc: '49 soil samples on a grid. Picks up near-surface gold; deep cover masks it.' },
  { id: 'trench', name: '🚜 Trench', cost: `${money(COSTS.trench.costPerCell)}/cell · lab ${COSTS.trench.labDays}d`, desc: `Click start, then end (max ${COSTS.trench.maxLen} cells). Exact grades of the top ${COSTS.trench.layers * LAYER_M} m.` },
  { id: 'drill', name: '🛢 Core drill', cost: 'see below', desc: 'Exact grade every 5 m down the hole. Expensive, and deeper costs more.' },
];

export const OVERLAYS: { id: Overlay; name: string }[] = [
  { id: 'none', name: 'Surface' },
  { id: 'estimate', name: 'Grade estimate' },
  { id: 'confidence', name: 'Confidence' },
  { id: 'soil', name: 'Soil' },
  { id: 'geophys', name: 'Geophysics' },
  { id: 'pit', name: 'Pit plan' },
];

interface Props {
  s: GameState;
  p: Property;
  tool: Tool;
  setTool: (t: Tool) => void;
  drillDepth: number;
  setDrillDepth: (n: number) => void;
  rush: boolean;
  setRush: (b: boolean) => void;
  onGeophys: () => void;
  onWalkAll: () => void;
}

export function ExplorePanel(props: Props) {
  const { p, tool, setTool, drillDepth, rush } = props;
  const geoDone = geophysDone(p);
  const walkDone = walkAllDone(p);
  const busy = (lane: keyof Property['lanes']) => Math.max(0, p.lanes[lane] - props.s.day);
  return (
    <div className="panel">
      <h3>Prospecting</h3>
      <div className="tools">
        {TOOLS.map((t) => (
          <button key={t.id} data-tut={`tool-${t.id}`} className={`tool ${tool === t.id ? 'active' : ''}`} onClick={() => setTool(t.id)} title={t.desc}>
            <span>{t.name}</span>
            <span className="small muted">{t.cost}</span>
          </button>
        ))}
      </div>
      <p className="small muted">{TOOLS.find((t) => t.id === tool)?.desc}</p>
      {tool === 'drill' && (
        <div className="drill-opts">
          <label>
            Depth: <b>{drillDepth * LAYER_M} m</b>
            <input type="range" min={2} max={GRID_D} value={drillDepth} onChange={(e) => props.setDrillDepth(Number(e.target.value))} />
          </label>
          <label className="row">
            <input type="checkbox" checked={rush} onChange={(e) => props.setRush(e.target.checked)} /> Rush assays (
            {COSTS.drill.rushLabDays}d instead of {COSTS.drill.labDays}d, ×{COSTS.drill.rushMult} cost)
          </label>
          <div className="small">
            Cost <b>{money(drillCost(drillDepth, rush), false)}</b> · {drillDays(drillDepth)} days drilling
          </div>
        </div>
      )}
      <div className="row wrap">
        <button
          className="secondary small-btn"
          data-tut="walk-all"
          disabled={walkDone}
          onClick={props.onWalkAll}
          title={walkDone ? 'Already done for this claim' : 'Map every clue on the claim (once per claim)'}
        >
          {walkDone ? '✓ Full walk-over done' : `Full walk-over ${money(COSTS.walkoverAll.cost)} · ${COSTS.walkoverAll.days}d`}
        </button>
        <button
          className="secondary small-btn"
          disabled={geoDone}
          onClick={props.onGeophys}
          title={geoDone ? 'Already done for this claim' : 'Induced-polarization survey of the whole claim (once per claim)'}
        >
          {geoDone ? '✓ IP geophysics done' : `IP geophysics ${money(COSTS.geophys.cost)} · ${COSTS.geophys.days}d`}
        </button>
      </div>
      <div className="small muted">
        Crews busy: field {busy('field')}d · drill rig {busy('drill')}d · contractor {busy('contractor')}d
      </div>
    </div>
  );
}

export function CellInfo({ p, c, slice, compact, onOpenHole }: { p: Property; c: number | null; slice: number; compact?: boolean; onOpenHole?: (id: number) => void }) {
  if (c === null)
    return compact ? (
      <div className="cell-caption muted small">Tap a cell to see what's there.</div>
    ) : (
      <div className="panel cellinfo muted small">Hover over or tap a cell on the map to see what's there.</div>
    );
  const k = p.knowledge;
  const surface = getTruth(p.seed, p.region); // public: stream only
  const model = getModel(modelKey(p), k);
  const x = cx(c);
  const y = cy(c);
  const rows: React.ReactNode[] = [];
  if (surface.stream[c]) rows.push('Creek');
  if (k.clues[c] >= 0)
    rows.push(
      <>
        <ClueIcon clue={k.clues[c]} size={16} /> {CLUE_NAMES[k.clues[c]]}
      </>,
    );
  else rows.push('Not yet walked');
  // things the player has put on this cell (what the old map legend used to explain)
  for (const h of k.holes.filter((hh) => hh.c === c)) {
    const grades = Array.from({ length: h.depth }, (_, z) => sampleAt(k, vi(x, y, z)) ?? 0);
    const bi = h.status === 'done' ? bestIntercept(grades) : null;
    rows.push(
      `Drill hole ${h.name}: ${
        h.status === 'done' ? (bi ? `best ${bi.metres} m @ ${grade(bi.grade)}` : 'assayed, no significant gold') : h.status === 'lab' ? 'assays at the lab' : 'drilling'
      }`,
    );
  }
  for (const t of k.trenches.filter((tt) => tt.cells.includes(c))) rows.push(`Trench ${t.name}${t.status === 'done' ? '' : t.status === 'lab' ? ': assays at the lab' : ': digging'}`);
  if (p.mine.shaft?.c === c) rows.push(`Shaft collar: sunk to ${p.mine.shaft.depth * LAYER_M} m`);
  if (k.pans[c] !== undefined) rows.push(`Pan: ${k.pans[c]} colors`);
  if (k.soil[c] !== undefined) rows.push(`Soil: ${k.soil[c]} ppb Au`);
  if (k.geophys) rows.push(`Chargeability: ${k.geophys[c].toFixed(2)}`);
  let best = 0;
  let bestConf = 0;
  const z0 = slice < 0 ? p.mine.mined[c] : slice;
  const z1 = slice < 0 ? GRID_D : slice + 1;
  for (let z = z0; z < z1; z++) {
    const i = vi(x, y, z);
    if (model.est[i] > best && model.conf[i] > 0.15) {
      best = model.est[i];
      bestConf = model.conf[i];
    }
  }
  if (bestConf > 0) rows.push(`Estimate${slice < 0 ? ' (best in column)' : ''}: ${grade(best)} · ${Math.round(bestConf * 100)}% confidence`);
  if (p.mine.mined[c] > 0) rows.push(`Mined to ${p.mine.mined[c] * LAYER_M} m`);
  if (p.mine.target[c] > p.mine.mined[c]) rows.push(`Pit planned to ${p.mine.target[c] * LAYER_M} m`);
  if (compact) {
    const hole = k.holes.find((h) => h.c === c);
    return <CellCaption label={columnLabel(c)} rows={rows} onOpenHole={hole && onOpenHole ? () => onOpenHole(hole.id) : undefined} />;
  }
  return (
    <div className="panel cellinfo">
      <b>Cell {columnLabel(c)}</b>
      {rows.map((r, i) => (
        <div key={i} className="small">
          {r}
        </div>
      ))}
    </div>
  );
}

/** Phone HUD: cell info as a caption over the map's bottom edge. Two lines; tap to expand. */
function CellCaption({ label, rows, onOpenHole }: { label: string; rows: React.ReactNode[]; onOpenHole?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`cell-caption small ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
      <div className="cell-caption-rows">
        <b>{label}</b>
        {rows.map((r, i) => (
          <span key={i}> · {r}</span>
        ))}
      </div>
      {onOpenHole && (
        <button
          className="small-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenHole();
          }}
        >
          Core log ›
        </button>
      )}
    </div>
  );
}

export function CoreLog({ p, hole, revealCount }: { p: Property; hole: Hole; revealCount?: number }) {
  const k = p.knowledge;
  const grades: number[] = [];
  for (let z = 0; z < hole.depth; z++) grades.push(sampleAt(k, vi(cx(hole.c), cy(hole.c), z)) ?? 0);
  const shown = revealCount ?? grades.length;
  const bi = shown >= grades.length ? bestIntercept(grades) : null;
  return (
    <div className="corelog">
      <div className="small">
        <b>{hole.name}</b> at {columnLabel(hole.c)} · {hole.depth * LAYER_M} m ·{' '}
        {hole.status === 'done' ? 'assayed' : hole.status === 'lab' ? `at the lab (back day ${hole.assayDay})` : `drilling (done day ${hole.endDay})`}
      </div>
      {hole.status === 'done' &&
        grades.map((g, z) => (
          <div key={z} className={`core-row ${z < shown ? 'shown' : ''}`}>
            <span className="depth">{z * LAYER_M}–{(z + 1) * LAYER_M} m</span>
            <span className="bar" style={{ width: z < shown ? `${Math.min(100, 12 + Math.log10(1 + g * 10) * 40)}%` : 0, background: rgb(gradeColor(g)) }} />
            <span className={`val ${g >= 5 ? 'hot' : ''}`}>{z < shown ? grade(g) : ''}</span>
          </div>
        ))}
      {bi && (
        <div className="intercept">
          Best: <b>{bi.metres} m @ {grade(bi.grade)}</b> from {bi.from} m
        </div>
      )}
      {hole.status === 'done' && shown >= grades.length && k.ob?.[hole.c] !== undefined && (
        <div className="small muted">
          {k.ob[hole.c] === 0 ? 'Bedrock from surface.' : `Gravel to ${k.ob[hole.c] * LAYER_M} m, then hard rock.`} Gravel washes in a sluice or
          trommel; rock needs crushing.
        </div>
      )}
      {hole.name.startsWith('Hist') && <div className="small muted">Historical data supplied by the seller. Trust, but verify.</div>}
    </div>
  );
}

/** Every hole on the claim, newest first; click one to open its core log. */
export function DrillHoleList({ p, selected, onSelect }: { p: Property; selected: number | null; onSelect: (id: number) => void }) {
  const k = p.knowledge;
  const holes = [...k.holes].reverse();
  return (
    <div className="panel holes-list">
      <h3>
        Drill holes <span className="muted small">· {p.name}</span>
      </h3>
      {holes.length === 0 && <div className="small muted">No holes drilled on this claim yet. Pick the Drill tool and click the map.</div>}
      {holes.map((h) => {
        let summary: string;
        let best = 0;
        if (h.status === 'done') {
          const grades: number[] = [];
          for (let z = 0; z < h.depth; z++) grades.push(sampleAt(k, vi(cx(h.c), cy(h.c), z)) ?? 0);
          const bi = bestIntercept(grades);
          best = bi?.grade ?? 0;
          summary = bi ? `${bi.metres} m @ ${grade(bi.grade)} from ${bi.from} m` : 'No significant intercepts';
        } else summary = h.status === 'lab' ? `At the lab · back day ${h.assayDay}` : `Drilling · done day ${h.endDay}`;
        return (
          <div key={h.id} className={`hole-item ${h.status} ${selected === h.id ? 'sel' : ''}`} onClick={() => onSelect(h.id)}>
            <span className="hole-dot" style={{ background: h.status === 'done' ? rgb(gradeColor(best)) : undefined }} />
            <div>
              <b>{h.name}</b> <span className="muted small">{columnLabel(h.c)} · {h.depth * LAYER_M} m</span>
              <div className={`small ${best >= 5 ? 'gold' : ''}`}>{summary}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
