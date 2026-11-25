import { defineMessages } from './locale.ts';
import { getCodexEntry } from '../catalogs/codex.ts';
import type { ChapterEvent, ChapterTarget } from '../../game/chapter/chapter-progress.ts';
import { korean } from './ko/chapter.ts';

const english = {
  'rune.left': 'left',
  'rune.middle': 'middle',
  'rune.right': 'right',
  'rune.lantern': 'Lantern',
  'rune.quill': 'Quill',
  'rune.wave': 'Wave',
  'objective.photo.title': 'The Missing Face',
  'objective.photo.text': 'Examine the faded photograph on the central reading desk.',
  'objective.corridor.title': 'The Ruined Corridor',
  'objective.corridor.text':
    'Study the mural and the records, then align the seals on the three plinths.',
  'objective.vault.title': 'The Sealed Vault',
  'objective.vault.text': 'Find the erased name in the vault’s signature register.',
  'objective.return.title': 'The Way Back',
  'objective.return.text':
    'Unfasten the latch south of the manuscript archive to open the way back to the main hall.',
  'objective.restoration.title': 'The Empty Place in the Photograph',
  'objective.restoration.text':
    'Take the shortcut back to the central reading desk and restore the name.',
  'objective.complete.title': 'A Name Restored',
  'objective.complete.text': 'Scribe Ian’s name and his last promise have returned.',
  'action.inspect': 'Examine the photograph',
  'action.mural': 'Read the marks on the mural',
  'action.seal': 'Examine the sealed door',
  'action.ledger': 'Read the signature register',
  'action.shortcut': 'Unfasten the return passage latch',
  'action.restore': 'Restore Ian’s name',
  'action.rune': 'Turn the {position} seal',
  'action.lore': 'Collect {title}',
  'event.rune-turned': '{position} plinth: {symbol}',
  // Each newline advances the chapter subtitles to a separately timed line.
  'event.photo-found':
    'Someone has been erased from the photograph. There are words on the back.\n“My name is in the register in the sealed vault.”\nBeyond the northern arch, the corridor to the eastern manuscript archive opens. Lanterns flare on the twin gate towers.',
  'event.mural-read':
    'A hand bearing a flame on the left. A scribe’s quill in the middle. A wave on the right.\n“Find it by firelight, write it with a quill, send it away on a wave.”',
  'event.seal-closed':
    'The seal trembles, then falls still.\nLook again at the positions on the mural and the marks on the plinths.',
  'event.seal-opened':
    'The three marks join and the vault door opens.\nIn the western workshop, freshly folded sheets hang on the drying rack.',
  'event.ledger-read':
    'The name in the signature register is Ian.\nBook spines return, one by one, to the empty manuscript shelves.\n“I will stay by your side until the last reading.”\nThe ink wakes behind you. Find the latch to the south.',
  'event.shortcut-opened':
    'The latch slides free. The pulley at the freight landing starts hoisting book crates again.\nFollow the passage south of the manuscript archive through the western door to the familiar reading room.',
  'event.name-restored':
    'Ian. As you write the name beneath the photograph, the missing figure returns. “I’m late, but let me tell you the last story.”',
} as const;

const chapterText = defineMessages(english, korean);

const positions = ['left', 'middle', 'right'] as const;
const symbols = ['lantern', 'quill', 'wave'] as const;
const objectives = ['photo', 'corridor', 'vault', 'return', 'restoration', 'complete'] as const;

// World signs are assembled after startup selects a language.
export const runePositions = positions.map((id) => chapterText(`rune.${id}`));
export const SYMBOLS = symbols.map((id) => chapterText(`rune.${id}`));

export function chapterObjective(phase: number) {
  const id = objectives[phase];
  if (!id) throw new RangeError(`Unknown chapter phase: ${phase}`);
  return {
    title: chapterText(`objective.${id}.title`),
    objective: chapterText(`objective.${id}.text`),
  };
}

function folio(id: string) {
  const entry = getCodexEntry(id);
  if (!entry) throw new Error(`Unknown folio: ${id}`);
  return entry;
}

export function chapterAction(target: ChapterTarget) {
  if (target.action === 'lore')
    return chapterText('action.lore', { title: folio(target.id).title });
  if (target.action === 'rune')
    return chapterText('action.rune', { position: chapterText(`rune.${positions[target.index]}`) });
  return chapterText(`action.${target.action}`);
}

export function describeChapterEvent(event: ChapterEvent): { text: string; inscription?: string } {
  if (event.kind === 'lore-collected') {
    const { title, inscription } = folio(event.id);
    return { text: title, inscription };
  }
  if (event.kind === 'rune-turned') {
    const position = positions[event.index],
      symbol = symbols[event.symbol];
    if (!position || !symbol) throw new RangeError('Unknown chapter rune');
    return {
      text: chapterText('event.rune-turned', {
        position: chapterText(`rune.${position}`),
        symbol: chapterText(`rune.${symbol}`),
      }),
    };
  }
  return { text: chapterText(`event.${event.kind}`) };
}
