import { defineMessages } from './locale.ts';
import { korean } from './ko/equipment.ts';

const english = {
  'gear.name.wand': 'Afterglow · Crystal Wand of Sealing',
  'gear.name.bow': 'Daybreak · Lightbow',
  'gear.name.torch': 'Rampart Torch',
  'gear.name.survey-wand': 'Surveyor’s Crystal Wand',
  'gear.name.hunter-bow': 'Sentinel’s Runebow',
  'gear.equipping': 'Equipping',
  'gear.ready': 'Ready',
  'gear.wand.reserve': 'Reserve crystals · {reserve}',
  'gear.wand.depleted': 'Out of crystals',
  'gear.wand.charging': 'Charging crystal',
  'gear.wand.waiting': 'Awaiting charge',
  'gear.wand.inventory': 'Wand charge {loaded} / {capacity} · Reserve crystals {reserve}',
  'gear.wand.prompt': 'Reserve crystals · {reserve}. Press {key} to recharge.',
  'gear.wand.empty': 'Out of crystals. Switch tools or return to Mira for supplies.',
  'gear.bow.hold': 'Hold to draw',
  'gear.bow.equipping': 'Equipping bow',
  'gear.bow.release': 'String released',
  'gear.bow.depleted': 'Out of arrows',
  'gear.bow.nock': 'Nocking arrow',
  'gear.bow.withdraw': 'Taking an arrow',
  'gear.bow.full': 'Full draw · release to shoot',
  'gear.bow.draw': 'Drawing',
  'gear.bow.quiver': 'Quiver',
  'gear.bow.arrow': 'arrow',
  'gear.bow.arrows': 'arrows',
  'gear.bow.nocked': '1 arrow nocked',
  'gear.bow.inventory': 'Quiver · {count}',
  'gear.bow.inventoryNocked': 'Quiver · {count} · 1 arrow nocked',
  'gear.bow.empty': 'Quiver empty. Switch tools or return to Mira for supplies.',
  'gear.torch.lit': 'Lit · click to extinguish',
  'gear.torch.unlit': 'Unlit · click to light',
} as const;

export const equipmentText = defineMessages(english, korean);
