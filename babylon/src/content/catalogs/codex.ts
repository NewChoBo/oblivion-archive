import entries from '../../../../shared/levels/chapter-1-codex.json' with { type: 'json' };
import { defineMessages, getLocale } from '../locales/locale.ts';
import { koreanCodex } from '../locales/ko/codex.ts';

const readers = new Map(
  entries.map((entry) => {
    const { title, source, hint, description, inscription } = entry;
    const text = defineMessages(
      { title, source, hint, description, inscription },
      koreanCodex[entry.id],
    );
    // Saves and world props share the authored folio ID. Resolve its text when the journal reads it.
    const read = () =>
      getLocale() === 'en'
        ? { ...entry }
        : {
            ...entry,
            title: text('title'),
            source: text('source'),
            hint: text('hint'),
            description: text('description'),
            inscription: text('inscription'),
          };
    return [entry.id, read] as const;
  }),
);

export function getCodexEntry(id: string) {
  return readers.get(id)?.();
}

export function getCodexEntries() {
  return Array.from(readers.values(), (read) => read());
}
