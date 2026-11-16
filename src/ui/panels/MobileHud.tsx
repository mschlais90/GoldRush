// Phone-only HUD pieces: bottom sheets, the tool strip, and the time bar.
import type { ReactNode } from 'react';
import { LAYER_M } from '../../sim/geology/types';
import { COSTS } from '../../sim/prospecting';
import { money } from '../format';
import type { Tool } from '../map/MapCanvas';
import { store } from '../store';
import { PanIcon } from '../icons';

/** A panel that slides up over the map, stopping above the time bar so time stays usable. */
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>{title}</b>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

const STRIP: { id: Tool; icon: ReactNode; label: string; title: string }[] = [
  { id: 'inspect', icon: '🔍', label: 'Inspect', title: 'Tap a cell to see what it is' },
  { id: 'walkover', icon: '🥾', label: 'Walk', title: `Walk-over ${money(COSTS.walkover.cost)}` },
  { id: 'pan', icon: <PanIcon />, label: 'Pan', title: `Pan the creek ${money(COSTS.pan.cost)}` },
  { id: 'soil', icon: '🧪', label: 'Soil', title: `Soil grid ${money(COSTS.soil.cost)}` },
  { id: 'trench', icon: '🚜', label: 'Trench', title: `Trench ${money(COSTS.trench.costPerCell)}/cell` },
  { id: 'drill', icon: '🛢', label: 'Drill', title: 'Core drill' },
];

const TOOL_NAMES: Partial<Record<Tool, string>> = { shaft: '⛫ Placing shaft' };

/** One row of tool icons under the map; mine tools (picked from the Mine sheet) show as a dismissible chip. */
export function ToolStrip(p: { tool: Tool; setTool: (t: Tool) => void; onWalkAll: () => void; onGeophys: () => void; walkDone: boolean; geoDone: boolean }) {
  const mineTool = TOOL_NAMES[p.tool];
  return (
    <div className="tool-strip">
      {mineTool ? (
        <button className="strip-chip active" onClick={() => p.setTool('inspect')}>
          {mineTool} ✕
        </button>
      ) : (
        <>
          {STRIP.map((t) => (
            <button key={t.id} data-tut={`tool-${t.id}`} className={p.tool === t.id ? 'active' : ''} onClick={() => p.setTool(t.id)} title={t.title}>
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
          {/* whole-claim surveys: once per claim, greyed out with a tick when done */}
          <button data-tut="walk-all" disabled={p.walkDone} onClick={p.onWalkAll} title={p.walkDone ? 'Already done for this claim' : `Full walk-over ${money(COSTS.walkoverAll.cost)}`}>
            <span>🗺</span>
            {p.walkDone ? '✓ Walked' : 'Walk all'}
          </button>
          <button disabled={p.geoDone} onClick={p.onGeophys} title={p.geoDone ? 'Already done for this claim' : `IP geophysics ${money(COSTS.geophys.cost)}`}>
            <span>📡</span>
            {p.geoDone ? '✓ IP' : 'IP'}
          </button>
        </>
      )}
    </div>
  );
}

export type DesignMode = 'move' | 'dig' | 'erase';

function Stepper(p: { label: string; value: string; onDown: () => void; onUp: () => void; downOff: boolean; upOff: boolean }) {
  return (
    <span className="stepper">
      <span className="small muted">{p.label}</span>
      <button className="secondary" onClick={p.onDown} disabled={p.downOff} aria-label={`${p.label} shallower`}>
        −
      </button>
      <b className="fixed-num">{p.value}</b>
      <button className="secondary" onClick={p.onUp} disabled={p.upOff} aria-label={`${p.label} deeper`}>
        +
      </button>
    </span>
  );
}

/** Replaces the tool strip while planning a pit or stopes: move/dig toggle, depth steppers and a live summary. */
export function DesignBar(p: {
  tool: 'pit' | 'stope';
  mode: DesignMode;
  setMode: (m: DesignMode) => void;
  hint: boolean;
  pitDepth: number;
  setPitDepth: (n: number) => void;
  stopeRange: [number, number];
  setStopeRange: (r: [number, number]) => void;
  summary: ReactNode;
  onForecast: () => void;
  onDone: () => void;
}) {
  const modes: [DesignMode, string][] = [
    ['move', '✋ Move'],
    ['dig', p.tool === 'pit' ? '✏ Dig' : '⛏ Stope'],
  ];
  if (p.tool === 'pit') modes.push(['erase', '⌫ Erase']);
  const [from, to] = p.stopeRange;
  return (
    <div className="design-bar">
      <div className="design-row">
        <div className="seg">
          {modes.map(([m, name]) => (
            <button key={m} className={p.mode === m ? 'active' : ''} onClick={() => p.setMode(m)}>
              {name}
            </button>
          ))}
        </div>
        <button className="done-btn" onClick={p.onDone}>
          Done ✓
        </button>
      </div>
      <div className="design-row">
        {p.tool === 'pit' ? (
          <Stepper
            label="Floor"
            value={`${p.pitDepth * LAYER_M} m`}
            onDown={() => p.setPitDepth(Math.max(1, p.pitDepth - 1))}
            onUp={() => p.setPitDepth(Math.min(24, p.pitDepth + 1))}
            downOff={p.pitDepth <= 1}
            upOff={p.pitDepth >= 24}
          />
        ) : (
          <>
            <Stepper
              label="From"
              value={`${from * LAYER_M} m`}
              onDown={() => p.setStopeRange([from - 1, to])}
              onUp={() => p.setStopeRange([from + 1, Math.max(from + 1, to)])}
              downOff={from <= 0}
              upOff={from >= 23}
            />
            <Stepper
              label="To"
              value={`${(to + 1) * LAYER_M} m`}
              onDown={() => p.setStopeRange([Math.min(from, to - 1), to - 1])}
              onUp={() => p.setStopeRange([from, to + 1])}
              downOff={to <= 0}
              upOff={to >= 23}
            />
          </>
        )}
        {p.hint && p.mode !== 'move' && <span className="small muted design-hint">Two fingers to move</span>}
      </div>
      <button className="design-summary small" onClick={p.onForecast}>
        <span>{p.summary}</span>
        <span className="muted">Forecast ›</span>
      </button>
    </div>
  );
}

/** Bottom bar: time controls where the thumb rests, plus the More menu. */
export function TimeBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const adv = (days: number) => store.dispatch({ type: 'advance', days });
  return (
    <nav className="mobile-nav time-bar">
      <button data-tut="advance-day" onClick={() => adv(1)}>
        +1 day
      </button>
      <button data-tut="advance-week" onClick={() => adv(7)}>
        +1 week
      </button>
      <button data-tut="advance-month" onClick={() => adv(30)}>
        +30 days
      </button>
      <button className={`more ${moreOpen ? 'active' : ''}`} data-tut-host="tab-" onClick={onMore}>
        ⋯ More
      </button>
    </nav>
  );
}
