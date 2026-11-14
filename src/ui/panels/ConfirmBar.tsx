// Phone only: a tapped cell waits here until the player confirms the paid action.
import { LAYER_M, cx, cy } from '../../sim/geology/types';
import { UNDERGROUND } from '../../sim/mining';
import { COSTS, drillCost, drillDays, trenchCells } from '../../sim/prospecting';
import { columnLabel } from '../../sim/market';
import { money } from '../format';
import type { Tool } from '../map/MapCanvas';

function describe(tool: Tool, c: number, trenchStart: number | null, drillDepth: number, rush: boolean): string | null {
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
      return `🛢 Drill ${drillDepth * LAYER_M} m${rush ? ' (rush)' : ''} · ${money(drillCost(drillDepth, rush))} · ${drillDays(drillDepth)}d`;
    case 'shaft':
      return `⛫ Collar shaft · ${money(UNDERGROUND.collarCost)}`;
    default:
      return null;
  }
}

export function ConfirmBar(p: {
  cell: number;
  tool: Tool;
  trenchStart: number | null;
  drillDepth: number;
  rush: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const text = describe(p.tool, p.cell, p.trenchStart, p.drillDepth, p.rush);
  if (!text) return null;
  return (
    <div className="confirm-bar">
      <div className="confirm-text">
        <span className="small muted">{columnLabel(p.cell)}</span>
        <span>{text}</span>
      </div>
      <button className="ghost" onClick={p.onCancel} aria-label="Cancel">
        ✕
      </button>
      <button data-tut="confirm-action" onClick={p.onConfirm}>
        Confirm
      </button>
    </div>
  );
}
