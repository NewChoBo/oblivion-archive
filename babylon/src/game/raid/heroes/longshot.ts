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
  { ...projectile(scatter, { powerScale: 2 }), cooldownTicks: 8 * RAID_HZ },
  bolt({ powerScale: 3 }),
  field(
    { powerScale: 3 },
    { intervalTicks: 15, count: 2, effect: { kind: 'damageEnemies', hit: { powerScale: 1 } } },
  ),
  projectile(piercing, { powerScale: 7, piercesShield: true }),
]);
