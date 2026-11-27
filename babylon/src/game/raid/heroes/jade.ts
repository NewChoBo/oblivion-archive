import { stats, thorn } from '../../../content/raid/heroes/jade.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, projectile } from '../skills/skill-effects.ts';
import { RAID_SKILL_RANGE } from '../raid-rules.ts';
export const jade = defineHero(stats, () => ({}), [
  {
    kind: 'ward',
    range: RAID_SKILL_RANGE.ward,
    apply(combat, cast) {
      const ally = cast.target;
      combat.shield(ally, 75, true);
      combat.self.lastWard = ally;
      combat.heal(ally, 2 * stats.power);
      combat.record(cast.skill, cast.point);
    },
  },
  projectile(thorn, 3),
  {
    ...field,
    healsField: true,
    onFieldAlly(combat, id) {
      combat.heal(id, stats.power);
    },
  },
  bolt(7, (combat) => {
    for (const id of combat.shieldRecipients()) combat.shield(id, 75);
  }),
]);
