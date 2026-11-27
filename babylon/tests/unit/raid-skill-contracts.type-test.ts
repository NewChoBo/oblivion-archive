import type { CrowdControlEffect } from '../../src/game/raid/raid-control.ts';
import type { AreaAttack, ProjectileAttack } from '../../src/game/raid/skills/attack-rule.ts';
import type { SectorArea } from '../../src/game/raid/skills/attack-area.ts';
import type { SkillInfo } from '../../src/game/raid/skills/skill-rule.ts';

declare function register(skill: SkillInfo): void;
declare function sector(shape: SectorArea): void;
declare function control(effect: CrowdControlEffect): void;
declare const shot: ProjectileAttack;
declare const immediate: AreaAttack<'cast'>;
declare const landing: AreaAttack<'land'>;

register({ kind: 'leap', range: 10, attack: landing });
register({ kind: 'direction', attack: shot });
// @ts-expect-error The impact of a leap runs at touchdown.
register({ kind: 'leap', range: 10, attack: immediate });
// @ts-expect-error Ground placement needs an explicit cast range.
register({ kind: 'leap', attack: landing });
// @ts-expect-error A ward cannot launch an enemy projectile.
register({ kind: 'ward', range: 10, attack: shot });
// @ts-expect-error A sector must specify its angular boundary.
sector({ kind: 'sector', radius: 5 });
// @ts-expect-error The duration of a crowd control effect is required.
control({ kind: 'silence' });
