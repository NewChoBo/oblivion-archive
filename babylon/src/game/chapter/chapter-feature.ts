import type { GameFeature } from '../session/game-feature.ts';
import type { ChapterEvent, ChapterProgress, Position } from './chapter-progress.ts';

export interface ChapterPlayer {
  readPosition(): Position;
  focusedTargetId(): string | undefined;
}

export type ChapterCommand = {
  readonly kind: 'chapter.interact';
  readonly payload: { readonly targetId: string };
};

export function createChapterFeature(
  progress: ChapterProgress,
): GameFeature<ChapterPlayer, ChapterEvent> {
  return {
    id: 'chapter',
    commands: {
      interact(player, payload) {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('targetId' in payload) ||
          typeof payload.targetId !== 'string'
        ) {
          return { ok: false, error: 'chapter.invalid-target' };
        }
        // Focus comes from the bound player; progress.use also checks phase and reach.
        if (player.focusedTargetId() === payload.targetId) {
          const event = progress.use(payload.targetId, player.readPosition());
          if (event) return { ok: true, event };
        }
        return { ok: false, error: 'chapter.target-unavailable' };
      },
    },
  };
}
