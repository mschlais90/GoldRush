// The mine planner's feasibility study: using only what the player knows (their
// block model, known overburden and the equipment on site) it projects what the
// planned pit will produce, what it will cost, and what's wrong with the setup.
import { CLAIM_FEE_PER_DAY, modelKey } from './economy';
import { EQUIPMENT, LEASE_RATE, RESALE_FRACTION, type EquipTypeId } from './equipment';
import { estimateOverburden, getModel } from './estimate';
import { GRAMS_PER_OZ, GRID_H, GRID_W, LAYER_M, blockTonnes, ci, cx, cy, inBounds, vi } from './geology/types';
import { BLAST_COST_PER_T, HAUL_COST_PER_T_PER_LAYER, HAUL_SLOWDOWN_PER_LAYER } from './mining';
import { REGIONS } from './regions';
import type { Property } from './state';
import { getTruth } from './truth';

const N = GRID_W * GRID_H;

export interface PitForecast {
  blocks: number;
  oreT: number;
  wasteT: number;
  gravelOreT: number;
  rockOreT: number;
  avgGrade: number;
  containedOz: number;
  recoveredOz: number;
  digDays: number;
  millDays: number;
  days: number;
  revenue: number;
  costs: number;
  profit: number;
  confidence: number; // tonnage-weighted confidence of the ore, 0..1
  deepest: number; // layers
  obGuessed: boolean; // gravel depth assumed somewhere (no nearby drilling)
  wetRisk: boolean;
  warnings: string[];
  tips: string[];
  suggested: EquipTypeId[]; // equipment worth adding for this plan
}

const fmtT = (t: number) => `${Math.round(t / 1000).toLocaleString()}k t`;

export function pitForecast(p: Property, goldPrice: number): PitForecast | null {
  const m = p.mine;
  const k = p.knowledge;
  const model = getModel(modelKey(p), k);
  const surface = getTruth(p.seed, p.region); // public creek locations only

  let blocks = 0;
  let gravelT = 0;
  let rockT = 0;
  let gravelOreT = 0;
  let rockOreT = 0;
  let gravelG = 0;
  let rockG = 0;
  let confW = 0;
  let haulCost = 0;
  let depthSum = 0;
  let deepest = 0;
  let obGuessed = false;
  let wetRisk = false;
  for (let c = 0; c < N; c++) {
    if (m.target[c] <= m.mined[c]) continue;
    const { ob, known } = estimateOverburden(k, c);
    if (!known) obGuessed = true;
    // creek gravels are waterlogged; elsewhere the water table is usually a few benches down
    const nearCreek = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => inBounds(cx(c) + dx, cy(c) + dy) && surface.stream[ci(cx(c) + dx, cy(c) + dy)]));
    if (nearCreek || m.target[c] > 4) wetRisk = true;
    deepest = Math.max(deepest, m.target[c]);
    for (let z = m.mined[c]; z < m.target[c]; z++) {
      const i = vi(cx(c), cy(c), z);
      if (m.stoped[i]) continue;
      blocks++;
      const gravel = z < ob;
      const t = blockTonnes(gravel ? 0 : 1);
      const est = model.conf[i] > 0.15 ? model.est[i] : 0;
      if (gravel) gravelT += t;
      else rockT += t;
      haulCost += t * HAUL_COST_PER_T_PER_LAYER * z;
      depthSum += t * z;
      if (est >= m.cutoff) {
        if (gravel) {
          gravelOreT += t;
          gravelG += t * est;
        } else {
          rockOreT += t;
          rockG += t * est;
        }
        confW += t * model.conf[i];
      }
    }
  }
  if (blocks === 0) return null;

  const oreT = gravelOreT + rockOreT;
  const totalT = gravelT + rockT;
  const wasteT = totalT - oreT;
  const avgZ = depthSum / totalT;

  // --- equipment on site ---------------------------------------------------
  const units = p.equipment.map((u) => ({ u, e: EQUIPMENT[u.type] }));
  const diggers = units.filter((x) => x.e.kind === 'dig');
  const mills = units.filter((x) => x.e.kind === 'process');
  const hasPump = units.some((x) => x.e.kind === 'pump');
  const capGravel = diggers.reduce((s, x) => s + x.e.capacity, 0);
  const capRock = diggers.reduce((s, x) => s + x.e.capacity / (x.u.type === 'shovel' ? 5 : 1), 0);
  const reach = diggers.reduce((s, x) => Math.max(s, x.e.maxDepth ?? 0), 0);
  const millAll = mills.reduce((s, x) => s + x.e.capacity, 0);
  const millRock = mills.filter((x) => x.e.recovery!.rock > 0).reduce((s, x) => s + x.e.capacity, 0);
  const recGravel = mills.reduce((s, x) => Math.max(s, x.e.recovery!.gravel), 0);
  const recRock = mills.reduce((s, x) => Math.max(s, x.e.recovery!.rock), 0);

  const slow = 1 + HAUL_SLOWDOWN_PER_LAYER * avgZ;
  const digDays = capGravel > 0 ? ((gravelT * 0.3) / capGravel + (rockT * 1.0) / capRock) * slow : Infinity;
  const millDays = oreT === 0 ? 0 : Math.max(millAll > 0 ? gravelOreT / millAll : Infinity, rockOreT > 0 ? (millRock > 0 ? rockOreT / millRock : Infinity) : 0);
  const days = Math.max(digDays, millDays);

  const recoveredG = gravelG * recGravel + rockG * recRock;
  const recoveredOz = recoveredG / GRAMS_PER_OZ;
  const containedOz = (gravelG + rockG) / GRAMS_PER_OZ;
  const revenue = recoveredOz * goldPrice;
  const finite = (d: number) => (Number.isFinite(d) ? d : 0);
  const lease = units.filter((x) => x.u.leased).reduce((s, x) => s + x.e.price * LEASE_RATE, 0);
  const costs =
    diggers.reduce((s, x) => s + x.e.opexPerDay, 0) * finite(digDays) +
    mills.reduce((s, x) => s + x.e.opexPerDay, 0) * finite(millDays) +
    (hasPump && wetRisk ? EQUIPMENT.pump.opexPerDay * finite(days) : 0) +
    rockT * BLAST_COST_PER_T +
    haulCost +
    (lease + CLAIM_FEE_PER_DAY) * finite(days);

  // --- what to buy ------------------------------------------------------------
  const suggested: EquipTypeId[] = [];
  const have = (id: EquipTypeId) => p.equipment.some((u) => u.type === id);
  const haveKind = (pred: (id: EquipTypeId) => boolean) => p.equipment.some((u) => pred(u.type));
  if (diggers.length === 0 || reach < deepest) {
    const want: EquipTypeId = totalT > 1_500_000 || deepest > (EQUIPMENT.backhoe.maxDepth ?? 0) ? 'fleet' : 'backhoe';
    if (!have(want)) suggested.push(want);
  }
  if (gravelOreT > 0 && !haveKind((id) => EQUIPMENT[id].kind === 'process')) {
    suggested.push(gravelOreT > 40_000 ? 'trommel' : 'sluice');
  }
  if (rockOreT > 0 && millRock === 0) suggested.push(rockOreT > 400_000 ? 'cil' : 'gravity');
  if (wetRisk && !hasPump) suggested.push('pump');

  // --- warnings ----------------------------------------------------------------
  const warnings: string[] = [];
  if (p.permit === 'none') warnings.push(`No mining permit yet. Apply on this tab; approval takes ${REGIONS[p.region].permitDays} days.`);
  if (oreT === 0) warnings.push('Your estimate shows no ore above cutoff inside this pit. Move the pit over gold-coloured ground on the Grade estimate map, or drill more first.');
  if (diggers.length === 0) {
    warnings.push(
      units.some((x) => x.e.kind === 'ug')
        ? 'No open-pit diggers on site. Your Underground Mining Crew only works stopes from a shaft; a pit needs a shovel crew, backhoe or fleet.'
        : 'No open-pit diggers on site (shovel crew, backhoe or fleet).',
    );
  }
  else if (reach < deepest) warnings.push(`Your diggers only reach ${reach * LAYER_M} m but the pit goes to ${deepest * LAYER_M} m.`);
  if (mills.length === 0 && oreT > 0) warnings.push('No mill or wash plant: ore will just pile up on the stockpile.');
  if (rockOreT > 0 && millRock === 0) {
    warnings.push(
      `${fmtT(rockOreT)} of the ore is hard rock. Sluices and trommels only wash gravel; rock needs a Crusher + Gravity Circuit or a CIL Mill.`,
    );
  }
  if (diggers.length > 0 && diggers.every((x) => x.u.type === 'shovel') && rockT > 0) warnings.push('Pick & shovel crews barely scratch hard rock.');
  if (wetRisk && !hasPump) warnings.push('This pit will probably hit groundwater (creek gravels or deeper than 20 m): have Dewatering Pumps ready.');
  if (oreT > 0 && confW / oreT < 0.5) warnings.push('Most of this ore is interpolated guesswork (low confidence). Drill inside the pit before committing big money.');
  if (oreT > 0 && wasteT / oreT > 8) warnings.push(`Strip ratio ${(wasteT / oreT).toFixed(0)}:1. You will move a lot of waste for each tonne of ore.`);
  const profit = revenue - costs;
  if (Number.isFinite(days) && oreT > 0 && profit < 0) warnings.push('At current estimates this plan loses money.');

  // --- tips ----------------------------------------------------------------------
  const tips: string[] = [];
  if (obGuessed) tips.push("Gravel depth is a guess where you haven't drilled; a hole nearby shows exactly where bedrock starts.");
  if (Number.isFinite(digDays) && Number.isFinite(millDays) && oreT > 0) {
    if (millDays > digDays * 2) tips.push('The mill is the bottleneck: a second plant, or a bigger one, would finish sooner.');
    else if (digDays > millDays * 3) tips.push('Digging is the bottleneck: the mill will sit idle much of the time.');
  }
  if (Number.isFinite(days) && units.some((x) => x.u.leased)) {
    const breakEven = Math.round((1 - RESALE_FRACTION) / LEASE_RATE);
    if (days > breakEven) tips.push(`This plan runs ~${Math.round(days)} days. Buying beats leasing after about ${breakEven} days of use.`);
  }
  if (oreT > 0 && m.cutoff < 0.3) tips.push('A very low cutoff sends marginal rock to the mill. Raising it can lift profit per tonne.');

  return {
    blocks,
    oreT,
    wasteT,
    gravelOreT,
    rockOreT,
    avgGrade: oreT > 0 ? (gravelG + rockG) / oreT : 0,
    containedOz,
    recoveredOz,
    digDays,
    millDays,
    days,
    revenue,
    costs,
    profit,
    confidence: oreT > 0 ? confW / oreT : 0,
    deepest,
    obGuessed,
    wetRisk,
    warnings,
    tips,
    suggested,
  };
}
