import { chapterLevel } from '../citadel-layout.ts';
import codexEntries from '../../../../shared/levels/chapter-1-codex.json' with { type: 'json' };

import type { ChapterTarget } from '../../game/chapter/chapter-progress.ts';

function positionOf(coordinates: readonly number[] | undefined): [number, number, number] {
  if (!coordinates) throw new Error('Missing chapter position');
  const [x, y, z] = coordinates;
  if (coordinates.length !== 3 || x === undefined || y === undefined || z === undefined) {
    throw new Error('Expected a three-dimensional chapter position');
  }
  return [x, y, z];
}

const desk = { id: 'photo', position: [0.4, 0, 0.85] as const, range: 1.55 };
export const chapterTargets: ChapterTarget[] = [
  { ...desk, phase: 0, action: 'inspect' },
  { id: 'mural', phase: 1, action: 'mural', position: [3.6, 0, 11.45], range: 1.6 },
  // Plinth order supplies the rune indices persisted in chapter checkpoints.
  ...chapterLevel.zones.corridor
    .filter((p) => p.prefab === 'rune-plinth')
    .map(({ position }, index): ChapterTarget => {
      if (index !== 0 && index !== 1 && index !== 2)
        throw new Error('Unexpected rune plinth index');
      const [x, , z] = positionOf(position);
      return {
        id: 'rune' + index,
        phase: 1,
        action: 'rune',
        index,
        position: [x, 0, z],
        range: 0.95,
      };
    }),
  { id: 'seal', phase: 1, action: 'seal', position: [11.9, 0, 10.3], range: 1.3 },
  { id: 'ledger', phase: 2, action: 'ledger', position: [15, 0, 10.3], range: 1.5 },
  { id: 'shortcut', phase: 3, action: 'shortcut', position: [15.4, 0, 8.5], range: 1.25 },
  { ...desk, phase: 4, action: 'restore' },
  ...codexEntries.map(({ id, phase, approach, range }): ChapterTarget => ({
    id,
    phase,
    action: 'lore',
    position: positionOf(approach),
    range,
  })),
];
