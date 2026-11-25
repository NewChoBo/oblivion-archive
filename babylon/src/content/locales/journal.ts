import { defineMessages } from './locale.ts';
import { korean } from './ko/journal.ts';

const english = {
  'gear.wand.description':
    'Brass branches shaped like quills clasp a moonstone. A short stroke of your wrist leaves an afterglow on the first surface it strikes.',
  'gear.bow.description':
    'Draw an arrow from the quiver on your back and set it on the string. A full draw sends it farther and faster. Release sooner and it drops more sharply.',
  'gear.torch.description':
    'Lights the ramparts and dark passages. While holding the torch, left-click to light or extinguish it.',
  'record.photo.title': 'Faded Photograph',
  'record.photo.source': 'Reading Room · Central Desk',
  'record.photo.description':
    'You copied the framed photograph into your journal. A blank white figure stands beside the librarian.',
  'record.photo.inscription': 'My name is in the register in the sealed vault.',
  'record.mural.title': 'Mural Rubbing',
  'record.mural.source': 'Ruined Corridor · West Wall',
  'record.mural.description':
    'A hand with a lantern on the left, a scribe’s quill in the middle, a wave on the right.',
  'record.mural.inscription':
    'Find it by firelight, write it with a quill, send it away on a wave.',
  'record.ledger.title': 'Copy of the Signature Register',
  'record.ledger.source': 'Sealed Vault · Register Desk',
  'record.ledger.description':
    'You copied the name and promise from the last line. Ian is the name that belongs in the photograph.',
  'record.ledger.inscription': 'Ian — I will stay by your side until the last reading.',
  'record.restored-photo.title': 'Restored Photograph',
  'record.restored-photo.source': 'Reading Room · Central Desk',
  'record.restored-photo.description':
    'Ian stands in the empty space again, quill in hand. You keep the photograph of the two figures side by side in your journal.',
  'record.restored-photo.inscription': 'I’m late, but let me tell you the last story.',
  'error.inventory.fixed-gear': 'The torch stays equipped.',
  'error.inventory.unavailable-gear': 'There is no gear to move.',
  'error.inventory.storage-out-of-reach':
    'Stand by the east chest in the reading room to use storage.',
  'error.inventory.capacity-exceeded': 'There is no space left.',
  'error.progression.skill-unavailable': 'You cannot spend a point on this skill.',
  'growth.skills': 'Skills',
  'navigation.keys': 'Arrow keys to navigate · Enter to choose',
  'record.hidden': 'Undiscovered record',
  'location.equipped': 'Equipped slot',
  'location.bag': 'Pack',
  'location.storage': 'Personal storage',
  'gear.bonus': '{description} Base damage +{bonus}.',
  'gear.selected': 'Selected',
  'gear.draw': 'Draw',
  'gear.equip': 'Equip',
  'gear.unequip': 'Unequip to pack',
  'gear.retrieve': 'Move to pack',
  'gear.store': 'Move to storage',
  'storage.location': 'Use the east chest in the reading room to deposit or retrieve gear.',
  'stats.points': 'Skill points',
  'stats.level': 'Level',
  'stats.xp': 'Experience',
  'stats.health': 'Health',
  'stats.armor': 'Armor',
  'bag.capacity': 'Pack {count} / {limit}',
  'storage.capacity': 'Personal storage {count} / {limit}',
  'gear.slots': 'Equipped',
  'skill.spend': 'Spend 1 skill point',
  'skill.unavailable': 'You cannot spend skill points here.',
  'gear.unavailable': 'Unable to move gear.',
} as const;

export const journalText = defineMessages(english, korean);

const recordIds = ['photo', 'mural', 'ledger', 'restored-photo'] as const;
export function journalRecord(id: string) {
  const record = recordIds.find((value) => value === id);
  if (!record) return undefined;
  return {
    title: journalText(`record.${record}.title`),
    source: journalText(`record.${record}.source`),
    description: journalText(`record.${record}.description`),
    inscription: journalText(`record.${record}.inscription`),
  };
}

export function gearDescription(kind: 'wand' | 'bow' | 'torch', bonus: number) {
  const description = journalText(`gear.${kind}.description`);
  return bonus ? journalText('gear.bonus', { description, bonus }) : description;
}

export function journalError(code: string, fallback: 'gear.unavailable' | 'skill.unavailable') {
  // A newer session can send an error code this client does not yet translate.
  const key = `error.${code}`;
  return isJournalKey(key) ? journalText(key) : journalText(fallback);
}
function isJournalKey(key: string): key is keyof typeof english {
  return Object.hasOwn(english, key);
}
