import { RAID_HZ } from '../../../game/raid/raid-rules.ts';

export const stats = { hp: 100, power: 9, reach: 3, cooldown: 23, radius: 3 } as const;
export const shadow = {
  comboLimit: 3,
  comboLifetime: 5 * RAID_HZ,
  comboDamage: 9,
  strikeCooldown: 4 * RAID_HZ,
  poisonCooldown: 10 * RAID_HZ,
  poisonCount: 3,
  poisonInterval: RAID_HZ,
  stepRange: 13,
  stepCooldown: 13 * RAID_HZ,
  bladeRange: 7,
  bladeHalfWidth: 1.05,
  bladeTravelTicks: 12,
  bladeInterval: 3 * RAID_HZ,
  bladeCasts: 3,
} as const;
