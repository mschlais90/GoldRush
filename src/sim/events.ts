// Random world events: some luck on top of the strategy.
import type { Rng } from './rng';
import { REGIONS } from './regions';
import type { GameState, NoticeKind } from './state';

export interface EventOutcome {
  kind: NoticeKind;
  title: string;
  body: string;
  propId?: number;
}

type EventFn = (s: GameState, rng: Rng) => EventOutcome | null;

const activeMines = (s: GameState) => s.properties.filter((p) => p.mine.mined.some((v) => v > 0) && p.permit === 'granted');

const EVENTS: { weight: number; fn: EventFn }[] = [
  {
    weight: 3,
    fn: (s, rng) => {
      const pct = rng.range(4, 9);
      s.goldPrice *= 1 + pct / 100;
      return { kind: 'good', title: 'Gold rallies!', body: `Inflation fears send gold up ${pct.toFixed(1)}% overnight.` };
    },
  },
  {
    weight: 3,
    fn: (s, rng) => {
      const pct = rng.range(4, 9);
      s.goldPrice *= 1 - pct / 100;
      return { kind: 'warn', title: 'Gold slumps', body: `A strong dollar knocks gold down ${pct.toFixed(1)}%.` };
    },
  },
  {
    weight: 2,
    fn: (s, rng) => {
      const mines = activeMines(s);
      if (!mines.length) return null;
      const p = rng.pick(mines);
      const pumped = p.equipment.some((e) => e.type === 'pump');
      const days = pumped ? rng.int(1, 2) : rng.int(4, 9);
      p.mine.haltedUntil = Math.max(p.mine.haltedUntil, s.day + days);
      return {
        kind: 'warn',
        title: `Flash flood at ${p.name}`,
        body: `Storm water fills the pit. Mining halted ${days} day${days > 1 ? 's' : ''}${pumped ? ' (your pumps helped)' : ''}.`,
        propId: p.id,
      };
    },
  },
  {
    weight: 1.5,
    fn: (s, rng) => {
      const ug = s.properties.filter((p) => p.mine.shaft && Object.keys(p.mine.stoped).length > 2);
      if (!ug.length) return null;
      const p = rng.pick(ug);
      const days = rng.int(3, 8);
      const cost = rng.int(15, 60) * 1000;
      p.mine.ugHaltedUntil = Math.max(p.mine.ugHaltedUntil, s.day + days);
      s.cash -= cost;
      p.ledger.opex += cost;
      return {
        kind: 'warn',
        title: `Rockfall at ${p.name}`,
        body: `A stope back caved in. No one hurt, but underground work stops ${days} days and rehab costs $${cost.toLocaleString()}.`,
        propId: p.id,
      };
    },
  },
  {
    weight: 2,
    fn: (s, rng) => {
      if (s.goldOz < 20) return null;
      const guarded = s.properties.some((p) => p.equipment.some((e) => e.type === 'vault'));
      if (guarded) {
        return { kind: 'info', title: 'Attempted theft foiled', body: 'Thieves tried your gold store, but the vault guards ran them off.' };
      }
      const frac = rng.range(0.1, 0.3);
      const lost = s.goldOz * frac;
      s.goldOz -= lost;
      return { kind: 'warn', title: 'Gold stolen!', body: `Thieves made off with ${lost.toFixed(1)} oz of unsold gold. A vault would have stopped them.` };
    },
  },
  {
    weight: 1.5,
    fn: (s, rng) => {
      const mines = activeMines(s);
      if (!mines.length) return null;
      const p = rng.pick(mines);
      const days = rng.int(3, 7);
      p.mine.haltedUntil = Math.max(p.mine.haltedUntil, s.day + days);
      return { kind: 'warn', title: `Crew walkout at ${p.name}`, body: `The crew downs tools over pay. ${days} days lost.`, propId: p.id };
    },
  },
  {
    weight: 1.5,
    fn: (s, rng) => {
      const region = rng.pick(s.unlockedRegions);
      s.regionHype[region] = Math.min(2, (s.regionHype[region] ?? 1) * 1.25);
      for (const l of s.listings) if (l.region === region) l.ask = Math.round(l.ask * 1.25);
      return { kind: 'info', title: `Gold rush fever in ${REGIONS[region].name}`, body: 'A big strike nearby! Land prices there jump 25%.' };
    },
  },
  {
    weight: 1,
    fn: (s, rng) => {
      const region = rng.pick(s.unlockedRegions);
      s.regionHype[region] = Math.max(0.6, (s.regionHype[region] ?? 1) * 0.8);
      for (const l of s.listings) if (l.region === region) l.ask = Math.round(l.ask * 0.8);
      return { kind: 'good', title: `Buyer's market in ${REGIONS[region].name}`, body: 'A junior miner went bust. Claims there are selling at a 20% discount.' };
    },
  },
  {
    weight: 1,
    fn: (s, rng) => {
      if (!s.properties.length) return null;
      const p = rng.pick(s.properties);
      const fee = Math.round(rng.range(3, 12)) * 1000;
      s.cash -= fee;
      p.ledger.opex += fee;
      return { kind: 'warn', title: 'Surprise inspection', body: `Regulators fine ${p.name} $${fee.toLocaleString()} for paperwork lapses.`, propId: p.id };
    },
  },
];

export function rollEvent(s: GameState, rng: Rng): EventOutcome | null {
  if (!rng.chance(1 / 40)) return null;
  const total = EVENTS.reduce((a, e) => a + e.weight, 0);
  let r = rng.float() * total;
  for (const e of EVENTS) {
    r -= e.weight;
    if (r <= 0) return e.fn(s, rng);
  }
  return null;
}
