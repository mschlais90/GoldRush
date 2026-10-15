import type { GameState } from './state';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  test: (s: GameState, netWorth: number) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_claim', name: 'Staked a Claim', desc: 'Buy your first property.', test: (s) => s.stats.propertiesBought >= 1 },
  { id: 'first_hole', name: 'Turning the Bit', desc: 'Drill your first hole.', test: (s) => s.stats.holesDrilled >= 1 },
  { id: 'ore_grade', name: 'Ore Grade', desc: 'Hit an intercept above 5 g/t.', test: (s) => (s.stats.bestIntercept?.grade ?? 0) >= 5 },
  { id: 'bonanza', name: 'Bonanza!', desc: 'Hit an intercept above 30 g/t.', test: (s) => (s.stats.bestIntercept?.grade ?? 0) >= 30 },
  { id: 'first_pour', name: 'First Pour', desc: 'Produce your first ounce of gold.', test: (s) => s.stats.ozProduced >= 1 },
  { id: 'oz_1k', name: 'Thousand Ounces', desc: 'Produce 1,000 oz of gold.', test: (s) => s.stats.ozProduced >= 1000 },
  { id: 'oz_25k', name: 'Major Producer', desc: 'Produce 25,000 oz of gold.', test: (s) => s.stats.ozProduced >= 25000 },
  { id: 'half_million', name: 'Half a Million', desc: 'Reach a net worth of $500k.', test: (_s, w) => w >= 500_000 },
  { id: 'millionaire', name: 'Millionaire', desc: 'Reach a net worth of $1M.', test: (_s, w) => w >= 1_000_000 },
  { id: 'ten_million', name: 'Gold Baron', desc: 'Reach a net worth of $10M.', test: (_s, w) => w >= 10_000_000 },
  { id: 'deep', name: 'Going Deep', desc: 'Sink a shaft to 100 m.', test: (s) => s.properties.some((p) => (p.mine.shaft?.depth ?? 0) >= 20) },
  { id: 'stoper', name: 'Hard-Rock Miner', desc: 'Stope 10,000 t of ore underground.', test: (s) => s.properties.some((p) => p.mine.ugOreT >= 10_000) },
  { id: 'empire', name: 'Mining Empire', desc: 'Own 3 properties at once.', test: (s) => s.properties.length >= 3 },
  { id: 'flipper', name: 'Proven Up', desc: 'Sell a property you explored.', test: (s) => s.stats.propertiesSold >= 1 },
  { id: 'debt_free', name: 'Debt Free', desc: 'Pay off a loan of $100k or more.', test: () => false },
  { id: 'salt_sniffer', name: 'Salt Sniffer', desc: 'Expose a salted drill report with due diligence.', test: () => false },
];

export function checkAchievements(s: GameState, netWorth: number): string[] {
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && a.test(s, netWorth)) {
      s.achievements.push(a.id);
      got.push(a.id);
    }
  }
  return got;
}

export function grant(s: GameState, id: string): boolean {
  if (s.achievements.includes(id)) return false;
  s.achievements.push(id);
  return true;
}
