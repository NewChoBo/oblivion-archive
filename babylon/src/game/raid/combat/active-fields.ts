import { distance } from '../raid-rules.ts';
import { raidGroundPointAfter } from '../runner-motion.ts';
import type { RaidPoint } from '../raid-view.ts';
import type { HeroCombat } from '../heroes/hero-definition.ts';
import type { FieldPulse } from '../skills/attack-rule.ts';
import type { Skill } from '../raid-view.ts';
import { applyCrowdControl } from '../raid-control.ts';

interface PlacedField {
  caster: number;
  started: number;
  origin: RaidPoint;
  radius: number;
  pulse: FieldPulse;
  skill: Skill;
}
/** The road moves under the runners. Each pulse samples its original tile and the current occupants. */
export class RaidFields {
  #active: PlacedField[] = [];
  place(
    caster: number,
    skill: Skill,
    started: number,
    point: RaidPoint,
    radius: number,
    pulse: FieldPulse,
  ) {
    this.#active.push({
      caster,
      skill,
      started,
      origin: { x: point.x, z: point.z },
      radius,
      pulse,
    });
  }
  step(tick: number, participants: readonly HeroCombat[]) {
    if (!this.#active.length) return;
    // Fields may have different lifetimes. Preserve cast order when several pulse in the same tick.
    this.#active = this.#active.filter((field) => {
      const age = tick - field.started;
      const { intervalTicks, count, effect } = field.pulse;
      const finalAge = intervalTicks * count;
      const combat = participants[field.caster]!;
      if (age > 0 && age <= finalAge && age % intervalTicks === 0 && !combat.self.respawn) {
        const center = raidGroundPointAfter(field.origin, age);
        if (effect.kind === 'healAllies') {
          for (const { self: ally } of participants) {
            if (
              ally.team === combat.self.team &&
              !ally.respawn &&
              distance(ally, center) <= field.radius
            )
              combat.heal(ally.slot, combat.stats.power * effect.powerScale);
          }
        } else {
          for (const id of combat.enemies(center, field.radius)) {
            if (effect.kind === 'damageEnemies') combat.strike(id, effect.hit, field.skill);
            else if (id !== 'wagon') applyCrowdControl(participants[id]!.self, effect.control);
          }
        }
      }
      return age < finalAge;
    });
  }
}
