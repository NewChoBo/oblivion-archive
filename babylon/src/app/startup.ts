import { startupText } from '../content/locales/startup.ts';
import { installViewportLimit, playableViewport } from '../ui/viewport-limit.ts';
import { readChapterCheckpoint } from '../platform/browser/chapter-save.ts';
import { createExpeditionState } from '../expedition/state.ts';
import { createPreferences } from '../platform/browser/preferences.ts';
import { createSettingsPanel } from '../ui/settings-panel.ts';
import { readPlayEntry } from './play-entry.ts';
import { getStorage } from '../platform/browser/storage.ts';
import { playUrl } from '../platform/browser/play-url.ts';
import { EXPERIENCE_RULES, getExperience } from '../content/catalogs/experiences.ts';
import { experienceText } from '../content/locales/experience.ts';
import { raidText } from '../content/locales/run-and-raid.ts';

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing startup element #${id}`);
  return element;
}

function control<T extends HTMLElement>(id: string, elementType: { new (): T }): T {
  const element = $(id);
  if (!(element instanceof elementType))
    throw new Error(`Unexpected startup control type for #${id}`);
  return element;
}

const start = control('start', HTMLButtonElement);
const status = $('loading');
const meter = control('loading-meter', HTMLProgressElement);
const retry = control('startup-retry', HTMLButtonElement);
const entry = readPlayEntry(new URLSearchParams(location.search));
const navigate = (next: NonNullable<ReturnType<typeof readPlayEntry>>) =>
  location.assign(playUrl(location.href, next));

function showLoadingStep(completedSteps: number, message: string) {
  meter.value = completedSteps;
  status.textContent = message;
}

async function startGame() {
  try {
    // Load the shared font before the game paints text into its sign textures.
    await document.fonts.load('600 32px Pretendard').catch(() => []);
    if (entry?.intent === 'run-and-raid') {
      const { prepareRaid } = await import('./run-and-raid.ts');
      await prepareRaid();
    } else {
      const { prepareLevel } = await import('./main.ts');
      await prepareLevel(showLoadingStep);
    }
    $('startup-progress').hidden = true;
    $('menu-actions').hidden = false;
    start.disabled = false;
    if (playableViewport.matches) start.focus({ preventScroll: true });
  } catch (error) {
    console.error('Game startup failed', error);
    if (error instanceof Error && error.name === 'WebGPUInitializationError') {
      status.textContent = startupText('webgpuUnavailable');
      retry.textContent = startupText('useWebgl');
      retry.dataset.renderer = 'webgl';
    } else status.textContent = startupText('loadError');
    meter.hidden = true;
    retry.hidden = false;
  }
}

function showMainMenu() {
  const storage = getStorage('localStorage');
  const checkpoint = readChapterCheckpoint(storage);
  const expedition = createExpeditionState(storage);
  const hasSave = Boolean(checkpoint || expedition.hasSave);
  const stage = $('title-stage');
  const chapterTitle = stage.textContent;
  const arenas = control('open-arenas', HTMLButtonElement);
  const choices = $('experience-choices');
  const raid = control('open-raid', HTMLButtonElement);
  raid.textContent = raidText('mode');
  raid.addEventListener(
    'click',
    () => playableViewport.matches && navigate({ intent: 'run-and-raid' }),
  );
  const continueSave = control('continue-save', HTMLButtonElement);
  const settingsButton = control('settings-open', HTMLButtonElement);
  let selected: { button: HTMLButtonElement; mode: string } | null = null;
  const actions = $('menu-actions'),
    level = control('experience-level', HTMLSelectElement);
  const updateLevel = () =>
    ($('experience-level-detail').textContent = experienceText(`level.${level.value}`));
  const showScreen = (screen: 'home' | 'modes' | 'setup') => {
    const home = screen === 'home';
    $('experience-setup').hidden = screen !== 'setup';
    choices.hidden = screen !== 'modes';
    $('back-to-title').hidden = choices.hidden;
    start.hidden = !home;
    continueSave.hidden = !home || !hasSave;
    $('chapter-entries').hidden = !home;
    settingsButton.hidden = !home;
    stage.textContent = home
      ? chapterTitle
      : screen === 'modes'
        ? arenas.textContent
        : startupText('chooseMap');
    $('overlay').scrollTop = 0;
  };
  const openModes = () => {
    showScreen('modes');
    (selected?.button ?? choices.querySelector('button'))?.focus({ preventScroll: true });
    selected = null;
  };
  const returnHome = () => {
    showScreen('home');
    arenas.focus({ preventScroll: true });
  };
  arenas.addEventListener('click', openModes);
  $('back-to-title').addEventListener('click', returnHome);
  const choose = (button: HTMLButtonElement, id: string) => {
    const choice = getExperience(id);
    if (!choice) return;
    selected = { button, mode: id };
    $('experience-name').textContent = experienceText(id);
    const rules = EXPERIENCE_RULES[choice.ruleId];
    $('experience-conditions').textContent = experienceText(`setup.${id}`, {
      time: rules.timeLimit,
      target: rules.kind === 'score' ? rules.target : rules.roundsToWin,
    });
    level.replaceChildren(...choice.levelIds.map((id) => new Option(experienceText(id), id)));
    updateLevel();
    showScreen('setup');
    level.focus({ preventScroll: true });
  };
  for (const button of choices.querySelectorAll('button')) {
    const id = button.dataset.experience;
    if (!id) continue;
    button.textContent = experienceText(id);
    button.addEventListener('click', () => choose(button, id));
  }
  level.addEventListener('change', updateLevel);
  $('back-to-modes').addEventListener('click', openModes);
  $('overlay').addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.repeat || (choices.hidden && !selected)) return;
    event.preventDefault();
    if (selected) openModes();
    else returnHome();
  });
  $('enter-experience').addEventListener('click', () => {
    if (selected && playableViewport.matches)
      navigate({ intent: 'arena', mode: selected.mode, level: level.value });
  });
  start.addEventListener(
    'click',
    () => playableViewport.matches && navigate({ intent: 'chapter' }),
  );
  $('start-citadel').addEventListener(
    'click',
    () => playableViewport.matches && navigate({ intent: 'citadel' }),
  );
  continueSave.addEventListener('click', () => {
    if (playableViewport.matches)
      navigate({
        intent: expedition.area === 'dungeon' && !expedition.dead ? 'expedition' : 'continue',
      });
  });
  const preferences = createPreferences();
  const settings = createSettingsPanel(preferences, {
    onOpen() {
      $('overlay').hidden = true;
    },
    onClose() {
      $('overlay').hidden = false;
      settingsButton.focus();
    },
  });
  settingsButton.addEventListener('click', () => settings.open());
  Object.defineProperty(window, '__ROOM_DEMO__', {
    value: Object.freeze({
      snapshot: () => ({
        ready: true,
        started: false,
        paused: true,
        levelId: null,
        loadedAssets: [],
        meshCount: 0,
        preferences: preferences.get(),
      }),
    }),
  });
  $('startup-progress').hidden = true;
  actions.hidden = false;
  start.disabled = false;
  showScreen('home');
  if (playableViewport.matches) (hasSave ? continueSave : start).focus({ preventScroll: true });
}

retry.addEventListener('click', () => {
  if (retry.dataset.renderer === 'webgl') {
    const url = new URL(location.href);
    url.searchParams.set('renderer', 'webgl');
    location.replace(url);
  } else location.reload();
});
installViewportLimit(control('viewport-limit', HTMLDialogElement));
if (entry) {
  $('experience-choices').hidden = true;
  $('chapter-entries').hidden = true;
  $('title-stage').textContent =
    entry.intent === 'run-and-raid'
      ? raidText('mode')
      : entry.intent === 'arena'
        ? experienceText(entry.level)
        : entry.intent === 'expedition'
          ? startupText('quarry')
          : startupText('chapter');
  start.textContent = startupText('enter');
  requestAnimationFrame(() => requestAnimationFrame(startGame));
} else showMainMenu();
