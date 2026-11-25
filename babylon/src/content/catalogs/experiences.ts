type Point3 = readonly [x: number, y: number, z: number];
// A modelSurface wall keeps its collision box while the imported level supplies the visible face.
type Obstacle = readonly [name: string, position: Point3, size: Point3, modelSurface?: boolean];

interface ArenaLevel {
  readonly floor: { readonly position: Point3; readonly size: Point3 };
  readonly walls: readonly Obstacle[];
  readonly cover: readonly Obstacle[];
  readonly model?: {
    readonly file: string;
    readonly origin: Point3;
    readonly horizontalScale: number;
  };
  readonly enemyKind?: 'humanoid';
  readonly objectives?: {
    readonly bombSites: readonly { readonly id: string; readonly position: Point3 }[];
    readonly hostage: Point3;
    readonly extraction: Point3;
  };
  readonly spawn: Point3;
  readonly heading: number;
  readonly enemySpawns: readonly Point3[];
  readonly wards: readonly {
    readonly id: 'west-ward' | 'east-ward';
    readonly position: Point3;
    readonly contestRadius: number;
  }[];
}

export const EXPERIENCE_LEVELS = {
  'ink-quarry': {
    floor: { position: [0, -0.12, 0.5], size: [16, 0.24, 21] },
    walls: [
      ['west rock wall', [-8.1, 1.8, 0.5], [0.3, 3.6, 21]],
      ['east rock wall', [8.1, 1.8, 0.5], [0.3, 3.6, 21]],
      ['north rock wall', [0, 1.8, 11], [16, 3.6, 0.3]],
      ['south rock wall', [0, 1.8, -10], [16, 3.6, 0.3]],
    ],
    cover: [
      ['west stone pile', [-6.8, 0.65, 3], [1.8, 1.3, 2.2]],
      ['east stone pile', [6.6, 0.5, 6], [1.4, 1, 2]],
    ],
    spawn: [0, 0.86, -4],
    heading: 0,
    enemySpawns: [
      [-3, 0, 1.8],
      [3, 0, 4.2],
      [0, 0, 8],
    ],
    wards: [
      { id: 'west-ward', position: [-4, 0, 0.7], contestRadius: 2.15 },
      { id: 'east-ward', position: [4, 0, 0.7], contestRadius: 2.15 },
    ],
  },
  'gothic-arena': {
    model: {
      file: './assets/arenas/gothic-arena.glb',
      origin: [0, -0.225, 0],
      horizontalScale: 1.5,
    },
    enemyKind: 'humanoid',
    objectives: {
      bombSites: [
        { id: 'site-a', position: [-3.8, 0, 1.35] },
        { id: 'site-b', position: [3.8, 0, 1.35] },
      ],
      hostage: [0, 0, 3.35],
      extraction: [0, 0, -4.45],
    },
    floor: { position: [0, -0.12, 0], size: [12, 0.24, 12] },
    walls: [
      ['west railing', [-6, 0.47, 0], [0.32, 0.94, 12]],
      ['north railing', [0, 0.47, 6], [12, 0.94, 0.32]],
      ['east outer wall', [6.2, 2, 0], [0.77, 4, 12], true],
      ['south outer wall', [0, 2, -6], [12, 4, 0.57], true],
    ],
    cover: [
      ['west cover', [-1.5, 0.45, 0], [1.8, 0.9, 1.03]],
      ['east cover', [1.5, 0.45, 0], [1.8, 0.9, 1.03]],
      ['southwest pillar', [-4.5, 2, -4.5], [1.35, 4, 1.35]],
      ['southeast pillar', [4.5, 2, -4.5], [1.35, 4, 1.35]],
      ['northwest pillar', [-4.5, 2, 4.5], [1.35, 4, 1.35]],
      ['northeast pillar', [4.5, 2, 4.5], [1.35, 4, 1.35]],
    ],
    spawn: [0, 0.86, -4.5],
    heading: 0,
    enemySpawns: [
      [-3, 0, 3.4],
      [3, 0, 3.4],
      [0, 0, 4.8],
    ],
    wards: [
      { id: 'west-ward', position: [-3.8, 0, 1.35], contestRadius: 2.15 },
      { id: 'east-ward', position: [3.8, 0, 1.35], contestRadius: 2.15 },
    ],
  },
} as const satisfies Readonly<Record<string, ArenaLevel>>;

export type LevelId = keyof typeof EXPERIENCE_LEVELS;

export const EXPERIENCE_RULES = {
  deathmatch: { kind: 'score', timeLimit: 120, target: 6 },
  bomb: { kind: 'bomb', timeLimit: 80, fuseSeconds: 15, defuseSeconds: 4, roundsToWin: 2 },
  rescue: { kind: 'rescue', timeLimit: 100, roundsToWin: 2 },
  elimination: {
    kind: 'elimination',
    timeLimit: 90,
    roundsToWin: 2,
    enemies: EXPERIENCE_LEVELS['gothic-arena'].enemySpawns.length,
  },
  'ink-hunt': { kind: 'score', timeLimit: 90, target: 6 },
  'ward-defense': { kind: 'ward', timeLimit: 65, holdSeconds: 8, roundsToWin: 2 },
} as const;

const tacticalLevels = ['gothic-arena'] as const satisfies readonly LevelId[];
const arenaIds = ['gothic-arena', 'ink-quarry'] as const satisfies readonly LevelId[];

export const EXPERIENCES = {
  deathmatch: { levelIds: tacticalLevels, ruleId: 'deathmatch', firearms: true },
  bomb: { levelIds: tacticalLevels, ruleId: 'bomb', firearms: true },
  hostage: { levelIds: tacticalLevels, ruleId: 'rescue', firearms: true },
  elimination: { levelIds: tacticalLevels, ruleId: 'elimination', firearms: true },
  'specter-hunt': { levelIds: arenaIds, ruleId: 'ink-hunt' },
  'ward-defense': { levelIds: arenaIds, ruleId: 'ward-defense' },
} as const;
export type ExperienceId = keyof typeof EXPERIENCES;

export function getExperience(id: string) {
  if (!Object.hasOwn(EXPERIENCES, id)) return undefined;
  return EXPERIENCES[id as ExperienceId];
}
