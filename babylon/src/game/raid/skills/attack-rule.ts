import type { CrowdControlEffect } from '../raid-control.ts';
import type { AttackArea, CircleArea } from './attack-area.ts';

/** Resolve base damage against the attacker's power at impact, then apply the defender's rules. */
export interface HitRule {
  readonly powerScale: number;
  readonly control?: readonly CrowdControlEffect[];
  readonly piercesShield?: true;
}
export interface AreaHit {
  readonly area: AttackArea;
  readonly hit: HitRule;
}
export interface DirectAttack {
  readonly kind: 'direct';
  readonly on: 'cast';
  readonly hit: HitRule;
  readonly splash?: AreaHit;
}
export interface DashStrike {
  readonly kind: 'direct';
  readonly on: 'dashEnd';
  readonly contactRange: number;
  readonly hit: HitRule;
}
export interface DashPathAttack {
  readonly kind: 'dashPath';
  readonly halfWidth: number;
  readonly hit: HitRule;
}
export type AreaTrigger = 'cast' | 'land' | 'spinPulse' | 'counter' | 'dashEnd';
export interface AreaAttack<T extends AreaTrigger = AreaTrigger> extends AreaHit {
  readonly kind: 'area';
  readonly on: T;
}
// Ellipse axes are in metres, in the frame of the moving projectile. A height limit is inclusive.
export interface ProjectileContact {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly maxHeight?: number;
}
export interface ProjectileProfile {
  readonly reach: number;
  readonly speed: number;
  readonly angles: readonly number[];
  readonly pierces: boolean;
  readonly contact: ProjectileContact;
}
export interface ProjectileAttack {
  readonly kind: 'projectile';
  readonly flight: ProjectileProfile;
  readonly hit: HitRule;
}
export type FieldEffect =
  | { readonly kind: 'damageEnemies'; readonly hit: HitRule }
  | { readonly kind: 'controlEnemies'; readonly control: readonly CrowdControlEffect[] }
  | { readonly kind: 'healAllies'; readonly powerScale: number };
export interface FieldPulse {
  readonly intervalTicks: number;
  readonly count: number;
  readonly effect: FieldEffect;
}
export interface FieldAttack {
  readonly kind: 'field';
  readonly area: CircleArea;
  readonly hit: HitRule;
  readonly pulse?: FieldPulse;
}
export interface NonAttacking {
  readonly kind: 'none';
}
export type SkillAttack =
  | NonAttacking
  | DirectAttack
  | DashStrike
  | DashPathAttack
  | AreaAttack
  | ProjectileAttack
  | FieldAttack;
export const noAttack: NonAttacking = { kind: 'none' };

export function attackArea(attack: SkillAttack) {
  switch (attack.kind) {
    case 'area':
    case 'field':
      return attack.area;
    case 'direct':
      return attack.on === 'cast' ? attack.splash?.area : undefined;
    default:
      return undefined;
  }
}
