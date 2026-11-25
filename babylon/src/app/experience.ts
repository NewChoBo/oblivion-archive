import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_RULES,
  getExperience,
} from '../content/catalogs/experiences.ts';
import type { LevelId } from '../content/catalogs/experiences.ts';
import { ExperienceMatch } from '../game/experiences/experience-match.ts';

import { ArenaArmory } from '../game/experiences/armory.ts';
import { ARENA_PISTOL, ARENA_RIFLE } from '../content/catalogs/firearms.ts';

export function createExperience(id: string, requestedLevel: string) {
  const experience = getExperience(id);
  if (!experience) return undefined;
  // A level ID is valid for a launch only if the selected mode offers that map.
  const levelId = (experience.levelIds as readonly LevelId[]).find(
    (level) => level === requestedLevel,
  );
  if (!levelId) return undefined;
  const { ruleId } = experience;
  const level = EXPERIENCE_LEVELS[levelId],
    rules = EXPERIENCE_RULES[ruleId];
  const objectives = 'objectives' in level ? level.objectives : undefined;
  const match = new ExperienceMatch(
    rules,
    (rules.kind === 'bomb' ? (objectives?.bombSites ?? []) : level.wards).map((site) => site.id),
  );
  const armory =
    'firearms' in experience ? new ArenaArmory(ARENA_PISTOL, [ARENA_RIFLE]) : undefined;
  return { id, levelId, level, match, armory };
}
