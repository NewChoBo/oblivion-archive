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
  viewportMinimum: 'Game area {width} × {height} · Minimum {minWidth} × {minHeight} CSS pixels',
  turnToPlay: 'Play in landscape',
  landscapeRoom: 'Hide the address bar or leave split screen to give the game more room.',
  windowRoom: 'Enlarge this window to continue.',
  fullscreenUnavailable: 'Fullscreen is unavailable in this browser.',
  rotateManually: 'Your browser could not rotate the screen. Turn your device sideways.',
} as const;

export const startupText = defineMessages(english, korean);
