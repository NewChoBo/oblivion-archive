import { stats, crossSlash } from '../../../content/raid/heroes/swift.ts';
import { defineHero } from './hero-definition.ts';

import { bolt, projectile } from '../skills/skill-effects.ts';
import type { HeroCombat, HeroEvents, Hit } from './hero-definition.ts';
import type { RaidTarget } from '../raid-view.ts';
import { distance } from '../raid-rules.ts';
import { unitDirection } from '../raid-projectiles.ts';
import { slow } from '../raid-control.ts';
import type { DirectAttack, DashStrike } from '../skills/attack-rule.ts';
const lunge = {
  kind: 'direct',
  on: 'dashEnd',
  contactRange: stats.reach,
  hit: { powerScale: 3 },
} as const satisfies DashStrike;
const execution = {
  kind: 'direct',
  on: 'cast',
  hit: { powerScale: 7, control: [slow(30)] },
} as const satisfies DirectAttack;
class Swift implements HeroEvents {
  readonly view = { quarry: null as RaidTarget | null, guardUntil: 0 };
  private quarryUntil = 0;
  private vengeance = 0;
  onBasicAttack(combat: HeroCombat) {
    this.vengeance += 4 * Math.floor((10 * (stats.hp - combat.self.hp)) / stats.hp);
    let amount = stats.power;
    if (this.vengeance >= 100) {
      amount *= 2;
      this.vengeance -= 100;
    }
    const target = this.view.quarry !== null && combat.position(this.view.quarry);
    const haste =
      target && this.quarryUntil > combat.tick()
        ? Math.max(0, 1.05 - 0.105 * Math.max(0, distance(combat.self, target) - 1))
        : 0;
    return { amount, cooldown: Math.ceil(stats.cooldown / (1 + haste)) };
  }
  onIncomingHit(combat: HeroCombat) {
    return this.view.guardUntil >= combat.tick();
  }
  onOutgoingHit(combat: HeroCombat, hit: Hit) {
    if (!combat.self.respawn && hit.skill === 2) {
      this.view.quarry = hit.target;
      this.quarryUntil = combat.tick() + 150;
    }
    return hit.amount;
  }
  onTickEnd(combat: HeroCombat) {
    if (
      this.view.quarry !== null &&
      (this.quarryUntil <= combat.tick() || !combat.position(this.view.quarry))
    )
      this.view.quarry = null;
  }
}
export const swift = defineHero(stats, () => new Swift(), [
  projectile(crossSlash, { powerScale: 2, control: [slow(30)] }),
  {
    kind: 'target',
    range: 12,
    attack: lunge,
    apply(combat, cast) {
      const point = cast.point;
      const d = unitDirection(point.x - combat.self.x, point.z - combat.self.z);
      const gap = Math.min(distance(combat.self, point), 0.85);
      combat.dash(
        1,
        { x: point.x - (d?.dx ?? 0) * gap, z: point.z - (d?.dz ?? 1) * gap },
        6,
        cast.target,
      );
    },
  },
  bolt({ powerScale: 1 }, { range: 12 }),
  {
    kind: 'target',
    range: 8,
    attack: execution,
    apply(combat, cast, state) {
      combat.record(3, cast.point);
      combat.self.x = cast.point.x;
      combat.self.z = cast.point.z - 1.1;
      state.view.guardUntil = combat.tick() + 7;
    },
  },
]);
