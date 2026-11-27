import type { CombatRead, HeroCombat } from '../heroes/hero-definition.ts';
import type { RaidAim, RaidPoint, RaidTarget, Runner, Skill } from '../raid-view.ts';
import type { RaidDirection, ProjectileProfile } from '../raid-projectiles.ts';
import type { HitControl } from '../raid-control.ts';
export interface SkillInfo {
  readonly kind: RaidAim['kind'];
  readonly range?: number;
  readonly radius?: (read: CombatRead) => number;
  readonly targets?: (read: CombatRead, center: RaidPoint, radius: number) => RaidTarget[];
  readonly projectile?: ProjectileProfile;
  onProjectileHit?(combat: HeroCombat, target: RaidTarget, skill: Skill): void;
  readonly dash?: boolean;
  readonly recastDuringDash?: boolean;
  readonly healsField?: boolean;
  readonly piercesShield?: boolean;
  readonly control?: HitControl;
  onFieldEnemy?(combat: HeroCombat, id: RaidTarget, victim?: Runner): void;
  onFieldAlly?(combat: HeroCombat, id: number): void;
}
export interface ResolvedCast {
  skill: Skill;
  point: RaidPoint;
  target?: RaidTarget;
  direction?: RaidDirection;
  radius: number;
  enemies: readonly RaidTarget[];
}
type SkillKind = SkillInfo['kind'];
export type SkillCast<K extends SkillKind> = ResolvedCast &
  (K extends 'ward'
    ? { target: number }
    : K extends 'target'
      ? { target: RaidTarget }
      : K extends 'direction'
        ? { direction: RaidDirection }
        : {});
export type HeroSkill<S> = {
  [K in SkillKind]: SkillInfo & {
    readonly kind: K;
    apply(combat: HeroCombat, cast: SkillCast<K>, state: S): number | void;
  };
}[SkillKind];

// Carry the validated payload through to the matching handler. A malformed internal
// decision is a programming error; external commands are rejected before dispatch.
export function applySkill<S>(
  rule: HeroSkill<S>,
  combat: HeroCombat,
  cast: ResolvedCast,
  state: S,
) {
  switch (rule.kind) {
    case 'direction':
      if (cast.direction) return rule.apply(combat, { ...cast, direction: cast.direction }, state);
      break;
    case 'ward':
      if (typeof cast.target === 'number')
        return rule.apply(combat, { ...cast, target: cast.target }, state);
      break;
    case 'target':
      if (cast.target !== undefined)
        return rule.apply(combat, { ...cast, target: cast.target }, state);
      break;
    default:
      return rule.apply(combat, cast, state);
  }
  throw new Error('Missing resolved skill input: ' + rule.kind);
}
