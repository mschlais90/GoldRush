export type EquipTypeId =
  | 'shovel'
  | 'backhoe'
  | 'fleet'
  | 'pump'
  | 'ugcrew'
  | 'rocker'
  | 'sluice'
  | 'trommel'
  | 'gravity'
  | 'cil'
  | 'vault';

export type EquipKind = 'dig' | 'ug' | 'process' | 'pump' | 'support';

export interface EquipType {
  id: EquipTypeId;
  name: string;
  kind: EquipKind;
  price: number;
  opexPerDay: number;
  /** dig: effort-tonnes/day; ug: tonnes/day underground; process: tonnes/day */
  capacity: number;
  /** dig only: deepest layer it can reach */
  maxDepth?: number;
  /** process only: fraction recovered from gravel vs hard rock */
  recovery?: { gravel: number; rock: number };
  desc: string;
}

export const EQUIPMENT: Record<EquipTypeId, EquipType> = {
  shovel: {
    id: 'shovel',
    name: 'Pick & Shovel Crew',
    kind: 'dig',
    price: 3_000,
    opexPerDay: 450,
    capacity: 35,
    maxDepth: 3,
    desc: 'Three strong backs. Fine for shallow gravels; hopeless in hard rock.',
  },
  backhoe: {
    id: 'backhoe',
    name: 'Backhoe Excavator',
    kind: 'dig',
    price: 95_000,
    opexPerDay: 1_600,
    capacity: 650,
    maxDepth: 10,
    desc: 'Digs gravel easily and rock with blasting. Reaches 50 m.',
  },
  fleet: {
    id: 'fleet',
    name: 'Excavator + Haul Truck Fleet',
    kind: 'dig',
    price: 780_000,
    opexPerDay: 9_500,
    capacity: 5_200,
    maxDepth: 24,
    desc: 'Open-pit scale. Moves mountains, to the bottom of the claim.',
  },
  ugcrew: {
    id: 'ugcrew',
    name: 'Underground Mining Crew',
    kind: 'ug',
    price: 280_000,
    opexPerDay: 3_800,
    capacity: 400,
    desc: 'Jumbo drill, LHD loader and miners. Stopes ore from a shaft and works through winter.',
  },
  pump: {
    id: 'pump',
    name: 'Dewatering Pumps',
    kind: 'pump',
    price: 38_000,
    opexPerDay: 350,
    capacity: 0,
    desc: 'Required to dig below the water table. Also reduces flood downtime.',
  },
  rocker: {
    id: 'rocker',
    name: 'Gold Pans & Rocker Box',
    kind: 'process',
    price: 600,
    opexPerDay: 120,
    capacity: 6,
    recovery: { gravel: 0.6, rock: 0 },
    desc: 'Old-timer tech. Washes a few tonnes of gravel a day.',
  },
  sluice: {
    id: 'sluice',
    name: 'Sluice Box',
    kind: 'process',
    price: 9_500,
    opexPerDay: 300,
    capacity: 90,
    recovery: { gravel: 0.7, rock: 0 },
    desc: 'Gravity concentration for placer gravels.',
  },
  trommel: {
    id: 'trommel',
    name: 'Trommel Wash Plant',
    kind: 'process',
    price: 170_000,
    opexPerDay: 2_100,
    capacity: 1_300,
    recovery: { gravel: 0.88, rock: 0 },
    desc: 'High-volume placer processing.',
  },
  gravity: {
    id: 'gravity',
    name: 'Crusher + Gravity Circuit',
    kind: 'process',
    price: 450_000,
    opexPerDay: 4_200,
    capacity: 750,
    recovery: { gravel: 0.75, rock: 0.55 },
    desc: 'Crushes hard rock and catches the coarse gold. Misses the fine stuff.',
  },
  cil: {
    id: 'cil',
    name: 'Carbon-in-Leach Mill',
    kind: 'process',
    price: 2_900_000,
    opexPerDay: 19_000,
    capacity: 3_200,
    recovery: { gravel: 0.9, rock: 0.93 },
    desc: 'Industrial cyanide leach plant. Recovers almost everything.',
  },
  vault: {
    id: 'vault',
    name: 'Secure Gold Vault',
    kind: 'support',
    price: 25_000,
    opexPerDay: 60,
    capacity: 0,
    desc: 'Guards and a safe. Protects your unsold gold from theft.',
  },
};

export const EQUIP_ORDER: EquipTypeId[] = [
  'shovel',
  'backhoe',
  'fleet',
  'ugcrew',
  'pump',
  'rocker',
  'sluice',
  'trommel',
  'gravity',
  'cil',
  'vault',
];

/** Daily lease fee as a fraction of the purchase price. */
export const LEASE_RATE = 0.003;
export const RESALE_FRACTION = 0.6;
export const BREAKDOWN_CHANCE = 0.004;

export function resaleValue(type: EquipTypeId): number {
  return Math.round(EQUIPMENT[type].price * RESALE_FRACTION);
}
