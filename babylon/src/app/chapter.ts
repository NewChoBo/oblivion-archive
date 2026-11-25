import { chapterTargets } from '../content/catalogs/chapter-interactions.ts';
import { ChapterProgress } from '../game/chapter/chapter-progress.ts';
import { chapterSave } from '../platform/browser/chapter-save.ts';

/** Bind persistent checkpoint and codex storage at the edge of the chapter rules. */
export function createChapterState(storage?: Parameters<typeof chapterSave>[0]) {
  return new ChapterProgress(chapterTargets, chapterSave(storage));
}
