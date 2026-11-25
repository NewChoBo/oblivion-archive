import { defineMessages } from './locale.ts';
import { korean } from './ko/story.ts';

const english = {
  stars: 'The cold stars kept watch over me.\nI used to look back at them in peace.',
  suns: 'I did not fear the cold light falling from the stars,\nnor the heat of suns that burned like fire,',
  dark: 'nor even the dark that swallowed every light.\nI feared none of it.',
  why: 'Then why?',
  cold: 'What is this terrible chill,\nthis cold that could freeze the world?',
  fear: 'Why am I only now afraid?\nThe universe has not changed.',
  forgotten: 'What is it that I am forgetting?',
  enter: 'Enter the reading room',
  next: 'Next',
  pause: 'Pause auto-advance',
  play: 'Resume auto-advance',
  'photo.alt':
    'In the faded photograph, the figure on the right has been erased, leaving a white silhouette.',
} as const;

export const storyText = defineMessages(english, korean);
