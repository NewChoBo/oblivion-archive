import { stats } from '../../../content/raid/heroes/bastion.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, sweep } from '../skills/skill-effects.ts';
import type { HeroEvents } from './hero-definition.ts';
import { RAID_HZ } from '../raid-rules.ts';
const armor: HeroEvents = {
  onCast(combat, skill) {
    if (skill === 0) combat.self.shield = Math.max(combat.self.shield, 2 * RAID_HZ);
  },
  onDamageDealt(combat, hit) {
    if (hit.skill === 3) combat.self.shield = Math.max(combat.self.shield, 3 * RAID_HZ);
  },
};
export const bastion = defineHero(stats, () => armor, [
  { ...sweep(2), control: { staggered: 12 } },
  bolt(3),
  field,
  bolt(7),
]);
