import { defineMessages } from './locale.ts';
import { korean } from './ko/expedition.ts';

const english = {
  'skill.power.title': 'Precise Recitation',
  'skill.power.description': 'Spell and arrow damage +25% per rank',
  'skill.vitality.title': 'Vessel of Memory',
  'skill.vitality.description': 'Maximum health +20 and restore 20 health per rank',
  'skill.ward.title': 'Brass Ward',
  'skill.ward.description': 'Armor absorbs 10% more damage and gains 15 maximum armor per rank',
  'mira.contract':
    'Apprentice scribe Mira: From the photograph on the central desk, follow the north arch to the sealed vault in the east. You can solve its puzzle with the gear you have.\nThe turquoise portal behind me leads to the Ink Quarry. Defeat three ink specters and come back. The chest in the southeast corner holds your gear.',
  'mira.reward':
    'Mira: The quarry’s quiet now. You’ve earned a skill point, and I’ve repaired your armor. Open the Growth tab in your journal to spend the point.',
  'mira.progress':
    'Mira: Quarry contract: {kills}/3. You can travel through the portal whenever you like. The photograph to the north has a story of its own.\nI’ve restored your health. The specters return with every expedition, but a chest gives its reward only once.',
  'mira.supplies':
    'Mira: No crystals or arrows left? Take six crystals and six arrows from the emergency supplies.',
  'area.readingRoom': 'Reading Room',
  'area.corridor': 'North Corridor',
  'area.vault': 'Sealed Vault',
  'area.shortcut': 'Return Passage',
  'area.ramparts': 'Ramparts',
  'hud.title': 'Expedition status',
  'hud.health': 'Health',
  'hud.armor': 'Armor',
  'hud.save': 'Expedition progress can only be kept in this tab.',
  'hud.remaining': 'Specters remaining: {count}',
  'hud.complete': 'Contract complete',
  'hud.contract': 'Specters {count}/3',
} as const;

export const expeditionText = defineMessages(english, korean);
