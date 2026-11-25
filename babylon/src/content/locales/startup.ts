import { defineMessages } from './locale.ts';
import { korean } from './ko/startup.ts';

const english = {
  chooseMap: 'Choose a map',
  enter: 'Enter',
  chapter: 'Chapter 1',
  quarry: 'Ink Quarry',
  loadError: 'The game could not be loaded.',
  webgpuUnavailable: 'WebGPU could not start on this device.',
  useWebgl: 'Enter with WebGL',
  viewportMinimum: 'Minimum {width} × {height} CSS pixels',
} as const;

export const startupText = defineMessages(english, korean);
