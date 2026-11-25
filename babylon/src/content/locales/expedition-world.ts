import { defineMessages } from './locale.ts';
import { korean } from './ko/expedition-world.ts';

const english = {
  'expedition.portal.enter': 'Travel to the Ink Quarry',
  'expedition.portal.leave': 'Return to the reading room',
  'expedition.cache.readingAction': 'Inspect supply chest · crystals, arrows and wand',
  'expedition.storage.action': 'Open personal storage',
  'expedition.cache.readingSign': 'Supplies · collect once',
  'expedition.storage.sign': 'Personal storage · deposit / withdraw',
  'expedition.mira.sign': 'Mira · guidance and healing',
  'expedition.mira.action': 'Talk to Mira · quest and healing',
  'expedition.portal.readingSign': 'Ink Quarry ↔ Reading Room',
  'expedition.portal.quarrySign': 'Return to reading room · safe zone',
  'expedition.quarry.sign': '3 ink wraiths · rewards collected automatically',
  'expedition.cache.fieldAction': 'Inspect expedition chest · sentinel’s bow',
  'expedition.cache.fieldSign': 'Expedition chest · collect once',
  'expedition.cache.emptySign': 'Empty chest · collected',
  'expedition.cache.emptyAction': 'Inspect empty chest · collected',
  'expedition.cache.claimed':
    'Collected equipment, 12 crystals, 10 arrows and 25 armor.\nEquip your new weapon in the bag.',
  'expedition.cache.alreadyClaimed':
    'This chest is empty. Defeat enemies in the quarry for supplies.',
  'expedition.combat.reward': 'Ink wraith defeated · 30 XP, 5 crystals, 4 arrows and 8 armor',
  'expedition.combat.guardHit': 'Sentinel took {damage} damage',
  'expedition.combat.headshot': 'Headshot · {outcome}',
  'expedition.combat.wraithHit': 'Ink wraith took {damage} damage',
  'expedition.combat.inkHit': 'Ink strike · health −{damage} · armor absorbed {absorbed}',
} as const;

export const expeditionWorldText = defineMessages(english, korean);
