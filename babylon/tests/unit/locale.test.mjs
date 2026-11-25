import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCALE,
  defineMessages,
  getLocale,
  resolveLocale,
  setLocale,
} from '../../src/content/locales/locale.ts';
import { readLanguage } from '../../src/platform/browser/language.ts';
import { chapterWorldText } from '../../src/content/locales/chapter-world.ts';
import { expeditionWorldText } from '../../src/content/locales/expedition-world.ts';
import { equipmentText } from '../../src/content/locales/equipment.ts';
import { playText } from '../../src/content/locales/play.ts';
import { startupText } from '../../src/content/locales/startup.ts';

test('fresh installs and unsupported language tags use English, Korean regional tags select Korean', () => {
  assert.equal(getLocale(), 'en');
  for (const tag of [null, '', 'en-GB', 'es-MX', 'ko_not_valid'])
    assert.equal(resolveLocale(tag), 'en');
  assert.equal(resolveLocale('ko-KR'), 'ko');
});

test('Korean alpha falls back per message to the English template with the same arguments', () => {
  const t = defineMessages(
    { round: 'Round {n}', score: 'Score {n}', progress: '{step} / {total}' },
    { round: '{n}라운드', progress: '' },
  );
  try {
    setLocale('ko');
    assert.equal(t('round', { n: 3 }), '3라운드');
    assert.equal(t('score', { n: 0 }), 'Score 0');
    assert.equal(t('progress', { step: 0 }), '0 / {total}');
  } finally {
    setLocale(DEFAULT_LOCALE);
  }
  assert.equal(t('round', { n: 3 }), 'Round 3');
});

test('Korean world signs, equipment, menus and accessible play controls retain their named arguments', async (t) => {
  const previous = getLocale();
  t.after(() => setLocale(previous));
  const placeholders = (template) =>
    [...new Set(Array.from(template.matchAll(/\{(\w+)\}/g), ([, name]) => name))].sort();
  for (const [catalog, translate] of Object.entries({
    'chapter-world': chapterWorldText,
    'expedition-world': expeditionWorldText,
    equipment: equipmentText,
    play: playText,
    startup: startupText,
  })) {
    const { korean } = await import(`../../src/content/locales/ko/${catalog}.ts`);
    for (const [key, translation] of Object.entries(korean)) {
      setLocale('en');
      const english = translate(key);
      setLocale('ko');
      assert.equal(translate(key), translation || english, key);
      if (translation) assert.deepEqual(placeholders(translation), placeholders(english), key);
    }
  }
});

test('a language choice survives launch and shared links can select a locale without changing the save', () => {
  const url = new URL('https://archive.example/?play=chapter');
  const korean = { getItem: () => 'ko-KR' };
  assert.equal(readLanguage(url), 'en');
  assert.equal(
    readLanguage(url, {
      getItem() {
        throw new Error('storage unavailable');
      },
    }),
    'en',
  );
  assert.equal(readLanguage(url, korean), 'ko');
  url.searchParams.set('lang', 'en');
  assert.equal(readLanguage(url, korean), 'en');
  url.searchParams.set('lang', 'ko-KR');
  assert.equal(readLanguage(url), 'ko');
  url.searchParams.set('lang', 'fr');
  assert.equal(readLanguage(url, korean), 'en');
});
