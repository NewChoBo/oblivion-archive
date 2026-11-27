import { shadow, stats } from '../../../content/raid/heroes/kali.ts';
import { defineHero, type HeroCombat, type HeroEvents, type Hit } from './hero-definition.ts';
import type { RaidTarget, Skill } from '../raid-view.ts';
import { sweep } from '../skills/skill-effects.ts';

class Kali implements HeroEvents {
  readonly view = { comboPoints: 0, ultimateRecasts: 0, poisonArmed: false };
  private comboUntil = 0;
  private credited = new Set<Skill>();
  private poison: { target: RaidTarget; next: number; remaining: number } | null = null;

  onCast(_combat: HeroCombat, skill: Skill) {
    this.credited.delete(skill);
  }
  private gainCombo(combat: HeroCombat, skill: Skill) {
    if (this.credited.has(skill)) return;
    this.credited.add(skill);
    this.view.comboPoints = Math.min(shadow.comboLimit, this.view.comboPoints + 1);
    this.comboUntil = combat.tick() + shadow.comboLifetime;
  }
  onOutgoingHit(combat: HeroCombat, hit: Hit) {
    if (combat.self.respawn) return hit.amount;
    if (hit.skill !== undefined) {
      if (hit.skill !== 1) this.gainCombo(combat, hit.skill);
      return hit.skill === 0 && hit.target === 'wagon' ? Math.ceil(hit.amount / 2) : hit.amount;
    }
    const empowered = this.view.comboPoints === shadow.comboLimit;
    if (empowered) this.view.comboPoints = 0;
    if (this.view.poisonArmed) {
      this.view.poisonArmed = false;
      this.poison = {
        target: hit.target,
        next: combat.tick() + shadow.poisonInterval,
        remaining: shadow.poisonCount,
      };
      this.gainCombo(combat, 1);
    }
    return hit.amount + (empowered ? shadow.comboDamage : 0);
  }
  onTimersAdvanced(combat: HeroCombat) {
    if (this.comboUntil <= combat.tick()) this.view.comboPoints = 0;
    const poison = this.poison;
    if (!poison) return;
    if (!combat.position(poison.target)) {
      this.poison = null;
    } else if (combat.tick() >= poison.next) {
      combat.strike(poison.target, { powerScale: 1 }, 1);
      poison.next += shadow.poisonInterval;
      if (!--poison.remaining) this.poison = null;
    }
  }
}
export const kali = defineHero(stats, () => new Kali(), [
  { ...sweep({ powerScale: 4 }), cooldownTicks: shadow.strikeCooldown },
  {
    kind: 'pulse',
    attack: { kind: 'none' },
    cooldownTicks: shadow.poisonCooldown,
    apply(combat, cast, state) {
      state.view.poisonArmed = true;
      combat.record(cast.skill, combat.self);
    },
  },
  {
    kind: 'target',
    range: shadow.stepRange,
    allowAlly: true,
    cooldownTicks: shadow.stepCooldown,
    attack: { kind: 'direct', on: 'cast', hit: { powerScale: 2 } },
    apply(combat, cast) {
      combat.record(cast.skill, cast.point);
      const facing = combat.facing(cast.target);
      combat.self.x = cast.point.x - Math.sin(facing) * 0.85;
      combat.self.z = cast.point.z - Math.cos(facing) * 0.85;
    },
  },
  {
    kind: 'direction',
    range: shadow.bladeRange,
    cooldownTicks: shadow.bladeInterval,
    attack: { kind: 'dashPath', halfWidth: shadow.bladeHalfWidth, hit: { powerScale: 4 } },
    apply(combat, cast, state) {
      state.view.ultimateRecasts = state.view.ultimateRecasts
        ? state.view.ultimateRecasts - 1
        : shadow.bladeCasts - 1;
      combat.dash(cast.skill, cast.point, shadow.bladeTravelTicks);
    },
  },
]);
