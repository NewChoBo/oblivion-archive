import assert from 'node:assert/strict';
import test from 'node:test';
import { createChapterState } from '../../src/app/chapter.ts';
import { createLocalSession } from '../../src/app/local-session.ts';
import {
  BAG_LIMIT,
  STORAGE_LIMIT,
  GEAR,
  createExpeditionState,
} from '../../src/expedition/state.ts';
import {
  chapterTraversal,
  readChapterCheckpoint,
} from '../../src/platform/browser/chapter-save.ts';

function memory() {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
}

test('chapter interactions require the bound player to see and reach the target in the current phase', () => {
  const storage = memory(),
    progress = createChapterState(storage);
  let focus = 'photo',
    position = { x: 15, y: 0.86, z: 10.3 };
  const options = {
    expedition: createExpeditionState(storage),
    readPosition: () => position,
    inventoryRules: {
      gear: GEAR,
      bagLimit: BAG_LIMIT,
      storageLimit: STORAGE_LIMIT,
      storagePosition: [3, 0, -5],
    },
  };
  const session = createLocalSession({
    ...options,
    chapter: { progress, focusedTargetId: () => focus },
  });
  const inspect = (targetId) => ({
    kind: 'chapter.interact',
    payload: { targetId, position: { x: 0.4, y: 0.86, z: 0.85 } },
  });
  assert.equal(
    createLocalSession(options).dispatch(inspect('photo')).error,
    'session.unknown-command',
  );
  assert.equal(session.dispatch(inspect('photo')).ok, false);
  position = { x: 0.4, y: 0.86, z: 0.85 };
  focus = 'mural';
  assert.equal(session.dispatch(inspect('photo')).ok, false);
  assert.equal(readChapterCheckpoint(storage), null);
  focus = 'photo';
  assert.deepEqual(session.dispatch(inspect('photo')), {
    ok: true,
    event: { kind: 'photo-found' },
  });
  assert.equal(session.dispatch(inspect('photo')).ok, false);
  assert.equal(readChapterCheckpoint(storage).phase, 1);
});

test('legacy checkpoints validate runes, phase and clue, and tab traversal is consumed once', () => {
  const store = memory(),
    valid = { phase: 1, runes: [2, 2, 2], clue: false };
  for (const invalid of [
    { phase: 0 },
    { phase: 6 },
    { runes: [0, 1] },
    { runes: [0, 1, 3] },
    { clue: 'true' },
  ]) {
    store.setItem('oblivion-archive.chapter1.v1', JSON.stringify({ ...valid, ...invalid }));
    assert.equal(readChapterCheckpoint(store), null);
  }
  store.setItem('oblivion-archive.chapter1.v1', JSON.stringify(valid));
  const progress = createChapterState(store),
    traversal = chapterTraversal(store);
  assert.equal(progress.completed, 0);
  progress.continue();
  traversal.remember({ phase: 1, runes: [0, 1, 1] });
  progress.restoreTraversal(traversal.take());
  assert.deepEqual(progress.snapshot().runes, [0, 1, 1]);
  assert.equal(traversal.take(), null);
  progress.retry();
  assert.deepEqual(progress.snapshot().runes, [2, 2, 2]);
  assert.equal(progress.snapshot().deaths, 1);
  assert.deepEqual(readChapterCheckpoint(store), valid);
});
