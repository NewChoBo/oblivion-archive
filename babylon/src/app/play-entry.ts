import { getExperience } from '../content/catalogs/experiences.ts';

type PlayEntry =
  | { intent: 'chapter' | 'continue' | 'citadel' | 'expedition' | 'return' | 'run-and-raid' }
  | { intent: 'arena'; mode: string; level: string };

interface PlayParameters {
  get(name: string): string | null;
  set(name: string, value: string): void;
  delete(name: string): void;
}

export function readPlayEntry(params: Pick<PlayParameters, 'get'>): PlayEntry | null {
  const intent = params.get('play');
  if (
    intent === 'chapter' ||
    intent === 'run-and-raid' ||
    intent === 'continue' ||
    intent === 'citadel' ||
    intent === 'expedition' ||
    intent === 'return'
  )
    return { intent };
  if (intent !== 'arena') return null;
  const mode = params.get('mode'),
    level = params.get('level');
  if (!mode || !level || !getExperience(mode)?.levelIds.some((id) => id === level)) return null;
  return { intent, mode, level };
}

export function writePlayEntry(
  params: Pick<PlayParameters, 'set' | 'delete'>,
  entry: PlayEntry | null,
): void {
  // Shared links retain unrelated settings (such as language) when switching play modes.
  for (const name of ['play', 'mode', 'level']) params.delete(name);
  if (entry) params.set('play', entry.intent);
  if (entry?.intent === 'arena') {
    params.set('mode', entry.mode);
    params.set('level', entry.level);
  }
}
