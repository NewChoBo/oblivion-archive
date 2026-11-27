import type { RaidHeroDefinition, HeroStats } from './hero-definition.ts';
import { HERO_IDS, type RaidHero } from './hero-id.ts';
import type { Skill, RaidRunner } from '../raid-view.ts';
import { hammer } from './hammer.ts';
import { abyss } from './abyss.ts';
import { longshot } from './longshot.ts';
import { jade } from './jade.ts';
import { rend } from './rend.ts';
import { bastion } from './bastion.ts';
import { rime } from './rime.ts';
import { rildin } from './rildin.ts';
import { kaiken } from './kaiken.ts';
import { swift } from './swift.ts';
export const heroCatalog = {
  hammer,
  abyss,
  longshot,
  jade,
  rend,
  bastion,
  rime,
  rildin,
  kaiken,
  swift,
} satisfies Record<RaidHero, RaidHeroDefinition>;
export const HEROES = Object.fromEntries(
  HERO_IDS.map((id) => [id, heroCatalog[id].stats]),
) as Record<RaidHero, HeroStats>;
export const raidSkill = (hero: RaidHero, skill: Skill) => heroCatalog[hero].skills[skill];
export const raidBasicReach = (runner: RaidRunner, tick: number) =>
  heroCatalog[runner.hero].basicReach(runner, tick);
export const raidAimKind = (hero: RaidHero, skill: Skill) => raidSkill(hero, skill).kind;
export const raidProjectileProfile = (hero: RaidHero, skill: Skill) =>
  raidSkill(hero, skill).projectile;
export const raidRunnerAimKind = (runner: RaidRunner, skill: Skill) =>
  raidAimKind(runner.hero, skill);
export const isRaidLeap = (hero: RaidHero, skill: Skill) => raidAimKind(hero, skill) === 'leap';
export function canUseRaidSkill(runner: RaidRunner, skill: Skill) {
  if (runner.respawn || runner.silenced || runner.staggered || runner.leap || runner.spinTicks)
    return false;
  const rule = raidSkill(runner.hero, skill);
  if (runner.dash) return !!rule.recastDuringDash;
  return (
    !runner.cooldowns[skill] &&
    !(rule.kind === 'leap' && runner.jumping) &&
    (skill !== 3 || runner.rage >= 100)
  );
}
