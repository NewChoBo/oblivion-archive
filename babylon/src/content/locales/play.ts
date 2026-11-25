import { defineMessages } from './locale.ts';
import { korean } from './ko/play.ts';

const english = {
  'play.chapter.complete': 'Chapter 1 complete',
  'play.checkpoint.saved': 'Checkpoint saved',
  'play.ending.title': 'The Person Missing from the Photograph',
  // The ending overlay renders this authored HTML. Keep the emphasis and line breaks in translations.
  'play.ending.description':
    'You restored the name of the scribe, <strong>Ian</strong>.<br>“Until the last reading, I will stay by your side.”<br>“I am late, but let me tell you the last story.”<br>The last light returns to the great archive’s star window.<br>End of Chapter 1',
  'play.ending.stay': 'Explore the reading room',
  'play.posture.standBlocked': 'There is too little headroom to stand.',
  'play.posture.crouchBlocked': 'There is too little headroom to crouch.',
  'play.camera.first': 'First person',
  'play.camera.third': 'Third person',
  'play.pointer.locked': 'Press Esc to release the mouse.',
  'play.pointer.denied': 'Mouse capture was denied. Try again or choose free look.',
  'play.pointer.free': 'Move the pointer to the edge of the screen to turn.',
  'play.pause.return': 'Back to the Archive',
  'play.pause.title': 'Paused',
  'play.pause.resume': 'Continue',
  'play.pause.location': 'Resume exploring from here.',
  'play.pause.help': 'Continue exploring, open your journal, or change your settings.',
  'play.fall.title': 'You fell into the sea of stars',
  'play.fall.saved': 'You can return to your last checkpoint.',
  'play.fall.unsaved': 'You have not reached a checkpoint yet.',
  'play.retry.checkpoint': 'Retry from checkpoint',
  'play.retry.start': 'Retry from the start',
  'play.defeat.title': 'Swallowed by ink',
  'play.defeat.description':
    'Your health will be restored. Ammunition and armor stay spent, and you keep the equipment and experience you gained.',
  'play.load.archive': 'Loading the archive and ramparts…',
  'play.load.equipment': 'Preparing the scribe and equipment…',
  'play.load.lights': 'Preparing lighting and display…',
  'play.chapter.progress': 'Chapter 1 · {step} / 5',
  'play.journal.entry': '{title} · Added to codex ({key})',
  'play.journal.saved': 'Added to journal ({key})',
  'play.camera.toggle': 'Press {key} to switch between first and third person',
  'play.controls.chapter':
    '{move} move · {sprint} sprint · {jump} jump / stand · {crouch} crouch · {prone} go prone\nMouse to look · right-click to focus / aim bow · left-click to cast / hold and release to shoot · {view} change view\n{interact} inspect · {slots} tools · {reload} recharge wand · {inventory} journal · Esc menu',
  'play.controls.arena':
    '{move} move · left-click to fire · right-click to aim · {reload} reload · {view} change view\n{pistol} pistol · {rifle} rifle · {interact} use objective · {shop} shop · Esc menu',
  'play.controls.canvas':
    'Oblivion Archive game view. {forward} move forward, {jump} jump or stand, {crouch} crouch, {prone} go prone, {view} change view, {interact} interact.',
  'play.load.level': 'Loading {level}…',
  'play.shelf.near': 'Shelf {number} · {label}',
} as const;

export const playText = defineMessages(english, korean);
