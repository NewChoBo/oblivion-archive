import { stats, scatter, piercing } from '../../../content/raid/heroes/longshot.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, projectile } from '../skills/skill-effects.ts';
import type { HeroEvents } from './hero-definition.ts';
import { RAID_HZ } from '../raid-rules.ts';
const mark: HeroEvents = {
  onOutgoingHit(_c, hit, victim) {
    if (hit.skill === undefined && victim && victim.marked > 0) {
      victim.marked = 0;
      return hit.amount + stats.power;
    }
    return hit.amount;
  },
  onDamageDealt(_c, hit, victim) {
    if (hit.skill === 1) victim.marked = 3 * RAID_HZ;
  },
};
export const longshot = defineHero(stats, () => mark, [
  projectile(scatter, 2),
  bolt(3),
  {
    ...field,
    onFieldEnemy(combat, id) {
      combat.strike(id, stats.power, 2);
    },
  },
  { ...projectile(piercing, 7), piercesShield: true },
]);
