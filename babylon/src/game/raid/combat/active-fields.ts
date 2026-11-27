import { distance, RAID_TARGETS } from '../raid-rules.ts';
import { raidGroundPointAfter } from '../runner-motion.ts';
import type { RaidPoint } from '../raid-view.ts';
import type { HeroCombat } from '../heroes/hero-definition.ts';
import type { SkillInfo } from '../skills/skill-rule.ts';

interface PlacedField {
  caster: number;
  started: number;
  origin: RaidPoint;
  radius: number;
  rule: SkillInfo;
}
/** The road moves under the runners. Each pulse samples its original tile and the current occupants. */
export class RaidFields {
  readonly #active: PlacedField[] = [];
  place(caster: number, started: number, point: RaidPoint, radius: number, rule: SkillInfo) {
    if (rule.onFieldAlly || rule.onFieldEnemy)
      this.#active.push({ caster, started, origin: { x: point.x, z: point.z }, radius, rule });
  }
  step(tick: number, participants: readonly HeroCombat[]) {
    for (const field of this.#active) {
      const age = tick - field.started;
      if (age !== 15 && age !== 30) continue;
      const combat = participants[field.caster]!;
      if (combat.self.respawn) continue;
      const center = raidGroundPointAfter(field.origin, age);
      for (const id of RAID_TARGETS) {
        const runner = id === 'wagon' ? undefined : participants[id]?.self;
        if (
          runner &&
          !runner.respawn &&
          runner.team === combat.self.team &&
          distance(runner, center) <= field.radius
        )
          field.rule.onFieldAlly?.(combat, runner.slot);
        const foe = combat.position(id);
        if (foe && distance(foe, center) <= field.radius)
          field.rule.onFieldEnemy?.(combat, id, runner);
      }
    }
    while (this.#active.length && tick - this.#active[0]!.started >= 30) this.#active.shift();
  }
}
