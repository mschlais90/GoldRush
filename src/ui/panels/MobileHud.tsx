// Phone-only HUD pieces: bottom sheets, the tool strip, and the time bar.
import type { ReactNode } from 'react';
import { COSTS } from '../../sim/prospecting';
import { money } from '../format';
import type { Tool } from '../map/MapCanvas';
import { store } from '../store';

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

const STRIP: { id: Tool; icon: string; label: string; title: string }[] = [
  { id: 'inspect', icon: '🔍', label: 'Inspect', title: 'Tap a cell to see what it is' },
  { id: 'walkover', icon: '🥾', label: 'Walk', title: `Walk-over ${money(COSTS.walkover.cost)}` },
  { id: 'pan', icon: '🥣', label: 'Pan', title: `Pan the creek ${money(COSTS.pan.cost)}` },
  { id: 'soil', icon: '🧪', label: 'Soil', title: `Soil grid ${money(COSTS.soil.cost)}` },
  { id: 'trench', icon: '🚜', label: 'Trench', title: `Trench ${money(COSTS.trench.costPerCell)}/cell` },
  { id: 'drill', icon: '🛢', label: 'Drill', title: 'Core drill' },
];

const TOOL_NAMES: Partial<Record<Tool, string>> = { pit: '⛏ Painting pit', stope: '⛫ Planning stopes', shaft: '⛫ Placing shaft' };

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
