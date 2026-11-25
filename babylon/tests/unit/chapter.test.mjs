import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChapterState } from '../../src/app/chapter.ts';
import {
  chapterAction,
  chapterObjective,
  describeChapterEvent,
} from '../../src/content/locales/chapter.ts';
import { getCodexEntry, getCodexEntries } from '../../src/content/catalogs/codex.ts';
import { DEFAULT_LOCALE, setLocale } from '../../src/content/locales/locale.ts';
import { experienceText } from '../../src/content/locales/experience.ts';
import codexEntries from '../../../shared/levels/chapter-1-codex.json' with { type: 'json' };
const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k),
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
};
const use = (s, id, x, z) => s.use(id, { x, y: 0.86, z });
test('a chapter requires evidence, spatial puzzle, name, shortcut and return in order', () => {
  const s = createChapterState(memory());
  assert.equal(use(s, 'ledger', 15, 10.3), null);
  assert.equal(use(s, 'photo', 0, -4.5), null);
  assert.equal(use(s, 'photo', 0.4, 0.85).kind, 'photo-found');
  assert.equal(use(s, 'seal', 11.9, 10.3).kind, 'seal-closed');
  use(s, 'mural', 3.6, 11.45);
  use(s, 'rune0', 9.4, 11.35);
  use(s, 'rune1', 9.4, 10.3);
  use(s, 'rune1', 9.4, 10.3);
  assert.equal(use(s, 'seal', 11.9, 10.3).kind, 'seal-opened');
  assert.equal(use(s, 'photo', 0.4, 0.85), null);
  assert.equal(use(s, 'ledger', 15, 10.3).kind, 'ledger-read');
  assert.equal(use(s, 'shortcut', 15.4, 8.5).kind, 'shortcut-opened');
  assert.equal(use(s, 'photo', 0.4, 0.85).kind, 'name-restored');
  assert.equal(s.done, true);
  assert.equal(use(s, 'photo', 0.4, 0.85), null);
});
test('checkpoint retry discards unfinished puzzle changes and survives a new session', () => {
  const storage = memory(),
    s = createChapterState(storage);
  use(s, 'photo', 0.4, 0.85);
  use(s, 'rune0', 9.4, 11.35);
  assert.deepEqual(s.retry(), [1.7, 0.86, 10.3]);
  assert.deepEqual(s.snapshot().runes, [2, 2, 2]);
  const fresh = createChapterState(storage);
  assert.equal(fresh.completed, 0);
  assert.equal(fresh.hasSave, true);
  assert.deepEqual(fresh.continue(), [1.7, 0.86, 10.3]);
  assert.equal(fresh.completed, 1);
  fresh.reset();
  assert.equal(createChapterState(storage).hasSave, false);
});
test('returning through an expedition portal keeps unfinished runes without changing the checkpoint', () => {
  const storage = memory(),
    chapter = createChapterState(storage);
  use(chapter, 'photo', 0.4, 0.85);
  use(chapter, 'rune0', 9.4, 11.35);
  const traversal = chapter.snapshot();
  const returned = createChapterState(storage);
  returned.continue();
  returned.restoreTraversal({ ...traversal, phase: 2 });
  assert.deepEqual(returned.snapshot().runes, [2, 2, 2]);
  returned.restoreTraversal(traversal);
  assert.deepEqual(returned.snapshot().runes, traversal.runes);
  returned.retry();
  assert.deepEqual(returned.snapshot().runes, [2, 2, 2]);
});
test('corrupt or unavailable storage preserves a playable new chapter', () => {
  const storage = {
    getItem: () => '{bad',
    setItem: () => {
      throw Error('quota');
    },
    removeItem: () => {
      throw Error('denied');
    },
  };
  const s = createChapterState(storage);
  assert.equal(s.hasSave, false);
  assert.equal(use(s, 'photo', 0.4, 0.85).kind, 'photo-found');
  s.reset();
});

test('the journal keeps discoveries without saving an unfinished rune or duplicating the restored photo', () => {
  const storage = memory(),
    s = createChapterState(storage);
  assert.deepEqual(s.records, []);
  use(s, 'photo', 0.4, 0.85);
  use(s, 'rune0', 9.4, 11.35);
  use(s, 'mural', 3.6, 11.45);
  use(s, 'mural', 3.6, 11.45);
  assert.deepEqual(s.records, ['photo', 'mural']);
  s.retry();
  assert.deepEqual(s.snapshot().runes, [2, 2, 2]);
  const loaded = createChapterState(storage);
  loaded.continue();
  assert.deepEqual(loaded.records, ['photo', 'mural']);
  use(loaded, 'rune0', 9.4, 11.35);
  use(loaded, 'rune1', 9.4, 10.3);
  use(loaded, 'rune1', 9.4, 10.3);
  use(loaded, 'seal', 11.9, 10.3);
  use(loaded, 'ledger', 15, 10.3);
  assert.deepEqual(loaded.records, ['photo', 'mural', 'ledger']);
  use(loaded, 'shortcut', 15.4, 8.5);
  use(loaded, 'photo', 0.4, 0.85);
  assert.deepEqual(loaded.records, ['restored-photo', 'mural', 'ledger']);
  loaded.reset();
  assert.deepEqual(loaded.records, []);
  storage.setItem(
    'oblivion-archive.chapter1.v1',
    JSON.stringify({ phase: 3, clue: false, runes: [0, 1, 2] }),
  );
  const legacy = createChapterState(storage);
  legacy.continue();
  assert.deepEqual(legacy.records, ['photo', 'ledger']);
});

test('optional codex pages are unique, persist across runs and leave the chapter checkpoint alone', () => {
  const storage = memory(),
    s = createChapterState(storage),
    other = createChapterState(storage);
  const [first, second] = codexEntries;
  const at = { x: first.approach[0], y: 0.86, z: first.approach[2] };
  assert.deepEqual(
    s.inReach(at).map((target) => target.id),
    [first.id],
  );
  assert.equal(s.use(first.id, { x: 0, y: 0.86, z: 0 }), null);
  const event = s.use(first.id, at);
  assert.deepEqual(event, { kind: 'lore-collected', id: first.id });
  assert.deepEqual(describeChapterEvent(event), {
    text: first.title,
    inscription: first.inscription,
  });
  assert.equal(s.use(first.id, at), null);
  assert.equal(s.hasSave, false);
  assert.deepEqual(s.records, []);
  use(other, second.id, second.approach[0], second.approach[2]);

  s.reset();
  assert.deepEqual(s.lore, [first.id]);
  const reloaded = createChapterState(storage);
  assert.deepEqual(reloaded.lore, [first.id, second.id]);
  assert.equal(
    reloaded.targets().some((target) => target.id === first.id),
    false,
  );
  assert.equal(reloaded.hasSave, false);
});

test('later codex pages follow the room unlocks and collecting leaves unfinished runes transient', () => {
  const storage = memory(),
    s = createChapterState(storage);
  const ink = codexEntries.find((entry) => entry.id === 'folio-ink');
  const vault = codexEntries.find((entry) => entry.id === 'folio-unreturned');
  const collect = (entry) => use(s, entry.id, entry.approach[0], entry.approach[2]);
  assert.equal(collect(ink), null);
  assert.equal(collect(vault), null);
  use(s, 'photo', 0.4, 0.85);
  use(s, 'rune0', 9.4, 11.35);
  assert.equal(collect(ink).kind, 'lore-collected');
  assert.equal(s.completed, 1);
  assert.equal(collect(vault), null);
  assert.deepEqual(s.snapshot().runes, [0, 2, 2]);
  assert.deepEqual(s.retry(), [1.7, 0.86, 10.3]);
  assert.deepEqual(s.snapshot().runes, [2, 2, 2]);
  assert.deepEqual(s.lore, [ink.id]);
  const fresh = createChapterState(storage);
  fresh.continue();
  assert.deepEqual(fresh.lore, [ink.id]);
  assert.deepEqual(fresh.records, ['photo']);
});

test('chapter prompts, collected folios and arena messages use the selected language and keep content IDs', () => {
  const first = codexEntries[0];
  assert.equal(chapterObjective(0).title, 'The Missing Face');
  assert.equal(getCodexEntry(first.id).title, 'The First Catalog');
  assert.equal(chapterAction({ id: first.id, action: 'lore' }), 'Collect The First Catalog');
  assert.equal(experienceText('shop.balance', { credits: 0 }), '0 credits');
  try {
    setLocale('ko');
    assert.equal(chapterObjective(0).title, '사진에서 지워진 사람');
    assert.equal(chapterAction({ id: first.id, action: 'lore' }), '첫 도서목록 수집하기');
    const translated = getCodexEntries();
    assert.deepEqual(
      translated.map((entry) => entry.id),
      codexEntries.map((entry) => entry.id),
    );
    for (const [i, entry] of translated.entries()) {
      for (const field of ['title', 'source', 'description', 'inscription', 'hint'])
        assert.match(entry[field], /[가-힣]/);
      for (const field of ['approach', 'position', 'rotation', 'phase', 'range', 'zone'])
        assert.deepEqual(entry[field], codexEntries[i][field]);
      assert.deepEqual(describeChapterEvent({ kind: 'lore-collected', id: entry.id }), {
        text: entry.title,
        inscription: entry.inscription,
      });
    }
    assert.equal(experienceText('shop.balance', { credits: 0 }), '0 크레딧');
  } finally {
    setLocale(DEFAULT_LOCALE);
  }
  assert.deepEqual(getCodexEntries(), codexEntries);
  assert.equal(getCodexEntry('missing'), undefined);
});
