import { validRunes } from '../../game/chapter/chapter-progress.ts';
import type { ChapterStore, Checkpoint } from '../../game/chapter/chapter-progress.ts';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const checkpointKey = 'oblivion-archive.chapter1.v1';
const loreKey = (id: string) => 'oblivion-archive.codex.v1.' + id;
const traversalKey = 'oblivion-archive.chapter-traversal';

export function readChapterCheckpoint(storage?: StorageLike): Checkpoint | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(checkpointKey) ?? 'null');
    if (
      value &&
      typeof value === 'object' &&
      'phase' in value &&
      typeof value.phase === 'number' &&
      Number.isInteger(value.phase) &&
      value.phase >= 1 &&
      value.phase <= 5 &&
      'runes' in value &&
      validRunes(value.runes) &&
      'clue' in value &&
      typeof value.clue === 'boolean'
    ) {
      return { phase: value.phase, runes: value.runes, clue: value.clue };
    }
  } catch {
    /* Corrupt or unavailable storage starts a fresh chapter. */
  }
  return null;
}

export function chapterSave(storage?: StorageLike): ChapterStore {
  return {
    readCheckpoint: () => readChapterCheckpoint(storage),
    writeCheckpoint(value) {
      try {
        storage?.setItem(checkpointKey, JSON.stringify(value));
      } catch {}
    },
    clearCheckpoint() {
      try {
        storage?.removeItem(checkpointKey);
      } catch {}
    },
    hasLore(id) {
      try {
        return storage?.getItem(loreKey(id)) === '1';
      } catch {
        return false;
      }
    },
    discoverLore(id) {
      try {
        storage?.setItem(loreKey(id), '1');
      } catch {}
    },
  };
}

export function chapterTraversal(storage?: StorageLike) {
  return {
    remember({ phase, runes }: { phase: number; runes: readonly number[] }) {
      try {
        storage?.setItem(traversalKey, JSON.stringify({ phase, runes }));
      } catch {}
    },
    take(): unknown {
      try {
        const data = storage?.getItem(traversalKey);
        storage?.removeItem(traversalKey);
        return JSON.parse(data ?? 'null');
      } catch {
        return null;
      }
    },
    clear() {
      try {
        storage?.removeItem(traversalKey);
      } catch {}
    },
  };
}
