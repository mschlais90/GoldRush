// Phone only: a paid action waits here until the player confirms it.
import type { ReactNode } from 'react';
import { GRID_D, LAYER_M, cx, cy } from '../../sim/geology/types';
import { UNDERGROUND } from '../../sim/mining';
import { COSTS, drillCost, drillDays, trenchCells } from '../../sim/prospecting';
import { money } from '../format';
import type { Tool } from '../map/MapCanvas';

/** What a tap with `tool` on cell `c` will do and cost, or null when it's free. */
export function describeTap(tool: Tool, c: number, trenchStart: number | null, drillDepth: number, rush: boolean): string | null {
  switch (tool) {
    case 'walkover':
      return `🥾 Walk-over · ${money(COSTS.walkover.cost)} · ${COSTS.walkover.days}d`;
    case 'pan':
      return `🥣 Pan here · ${money(COSTS.pan.cost)} · ${COSTS.pan.days}d`;
    case 'soil':
      return `🧪 Soil grid · ${money(COSTS.soil.cost)} · ${COSTS.soil.days}d`;
    case 'trench': {
      if (trenchStart === null) return null;
      const n = trenchCells(cx(trenchStart), cy(trenchStart), cx(c), cy(c)).length;
      return `🚜 Trench ${n} cells · ${money(n * COSTS.trench.costPerCell)}`;
    }
    case 'drill':
      return `🛢 Drill ${drillDepth * LAYER_M} m · ${money(drillCost(drillDepth, rush))} · ${drillDays(drillDepth)}d`;
    case 'shaft':
      return `⛫ Collar shaft · ${money(UNDERGROUND.collarCost)}`;
    default:
      return null;
  }
}

export function ConfirmBar(p: { label?: string; text: string; onConfirm: () => void; onCancel: () => void; children?: ReactNode }) {
  return (
    <div className="confirm-bar">
      <div className="confirm-main">
        <div className="confirm-text">
          {p.label && <span className="small muted">{p.label}</span>}
          <span>{p.text}</span>
        </div>
        <button className="ghost" onClick={p.onCancel} aria-label="Cancel">
          ✕
        </button>
        <button data-tut="confirm-action" onClick={p.onConfirm}>
          Confirm
        </button>
      </div>
      {p.children}
    </div>
  );
}

/** Drill depth and rush, adjustable right in the confirm bar. */
export function DrillOptions(p: { depth: number; setDepth: (n: number) => void; rush: boolean; setRush: (b: boolean) => void }) {
  return (
    <div className="confirm-opts">
      <span className="small">Depth</span>
      <button className="small-btn secondary" onClick={() => p.setDepth(Math.max(2, p.depth - 1))} disabled={p.depth <= 2}>
        −
      </button>
      <b className="small">{p.depth * LAYER_M} m</b>
      <button className="small-btn secondary" onClick={() => p.setDepth(Math.min(GRID_D, p.depth + 1))} disabled={p.depth >= GRID_D}>
        +
      </button>
      <label className="row small" style={{ margin: 0 }}>
        <input type="checkbox" checked={p.rush} onChange={(e) => p.setRush(e.target.checked)} /> Rush assays
      </label>
    </div>
  );
}
