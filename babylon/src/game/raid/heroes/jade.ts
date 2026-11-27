import { stats, thorn } from '../../../content/raid/heroes/jade.ts';
import { defineHero } from './hero-definition.ts';
import { bolt, field, projectile } from '../skills/skill-effects.ts';
import { RAID_SKILL_RANGE } from '../raid-rules.ts';
import { noAttack } from '../skills/attack-rule.ts';
export const jade = defineHero(stats, () => ({}), [
  {
    kind: 'ward',
    attack: noAttack,
    range: RAID_SKILL_RANGE.ward,
    apply(combat, cast) {
      const ally = cast.target;
      combat.shield(ally, 75, true);
      combat.self.lastWard = ally;
      combat.heal(ally, 2 * stats.power);
      combat.record(cast.skill, cast.point);
    },
  },
  projectile(thorn, { powerScale: 3 }),
  field(
    { powerScale: 3 },
    { intervalTicks: 15, count: 2, effect: { kind: 'healAllies', powerScale: 1 } },
  ),
  bolt(
    { powerScale: 7 },
    {
      onCast(combat) {
        for (const id of combat.shieldRecipients()) combat.shield(id, 75);
      },
    },
  ),
]);
