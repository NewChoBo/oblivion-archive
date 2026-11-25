import { defineMessages } from './locale.ts';
import { korean } from './ko/controls.ts';

const english = {
  'action.forward': 'Move forward',
  'action.back': 'Move backward',
  'action.left': 'Strafe left',
  'action.right': 'Strafe right',
  'action.sprint': 'Sprint (hold)',
  'action.jump': 'Jump',
  'action.crouch': 'Toggle crouch',
  'action.prone': 'Toggle prone',
  'action.interact': 'Inspect / restore',
  'action.view': 'Switch first- or third-person view',
  'action.tool1': 'Select Afterglow',
  'action.tool2': 'Select Daybreak',
  'action.tool3': 'Select torch',
  'action.reload': 'Reload / ready tool',
  'action.inventory': 'Inventory / journal (Tab always opens it)',
  'action.shop': 'Arena shop',
  'shadow.performance': 'Show shadows from stationary lights only.',
  'shadow.balanced': 'The handheld torch casts moving shadows.',
  'shadow.sharp': 'Cast higher-resolution shadows from fixed lights and the handheld torch.',
  'bind.label': 'Change key for {action}',
  'bind.prompt': '{action}: press a new key. Press Esc to cancel.',
  'bind.listening': 'Press a key…',
  'bind.cancelled': 'Key change canceled.',
  'bind.conflict': '{key} is assigned to {action}. Choose another key or cancel.',
  'bind.reserved':
    'The menu or browser uses this key. Choose a letter, number, arrow key, or Shift.',
  'bind.done': 'Key changed. Resume from the menu to use it.',
  reset: 'Default settings restored.',
  'storage.disabled': 'Browser storage is unavailable. Changes apply only in this tab.',
  'storage.info': 'Changes are saved in this browser. Esc, Tab, and left click are fixed.',
  'performance.unknown': 'Unavailable',
  'performance.unknown-gpu': 'Unknown GPU',
  'performance.off': 'Off',
} as const;

export const controlText = defineMessages(english, korean);
