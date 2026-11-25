import { defineMessages } from './locale.ts';
import { korean } from './ko/chapter-world.ts';

const english = {
  'sign.corridor': 'East · Sealed Vault',
  'sign.mural': 'Mural · Examine closely',
  'sign.rune': '{position} · {symbol}',
  'sign.seal': 'Find by light. Write with a quill. Send on a wave.',
  'sign.ward': 'The ink retreats in the light of the seal',
  'sign.register': 'Signature Register · The Last Reading',
  'sign.latch': 'South latch · To the reading room',
  'sign.shortcut': 'West passage · Main reading room',
  'sign.relief': 'The Castle Remembers',
  'sign.ramparts': 'South · Ramparts',
  'sign.readingRoom': 'Reading Room',
  'shelf.memory': 'Memory',
  'shelf.promise': 'Promise',
  'shelf.name': 'Names',
  'shelf.oblivion': 'Oblivion',
  'shelf.reading': 'Readings',
  'shelf.return': 'Homecoming',
  'shadow.stunned': 'The shadow is stunned. Get past it now.',
  'shadow.active': 'Ink shadow · Memory {health}% · Evade it or bind it with magic',
} as const;

export const chapterWorldText = defineMessages(english, korean);

const shelfSubjects: Readonly<Partial<Record<string, keyof typeof english>>> = {
  'reading-shelf-1': 'shelf.memory',
  'reading-shelf-2': 'shelf.promise',
  'reading-shelf-3': 'shelf.name',
  'reading-shelf-4': 'shelf.oblivion',
  'reading-shelf-5': 'shelf.reading',
  'reading-shelf-6': 'shelf.return',
};

export function readingShelfSubject(id: string, authoredLabel = ''): string {
  const key = shelfSubjects[id];
  // A shelf added in level data can display its authored label before it has a message key.
  return key ? chapterWorldText(key) : authoredLabel;
}
