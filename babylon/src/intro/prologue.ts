import { storyText } from '../content/locales/story.ts';
import { requireElement } from '../ui/dom.ts';
import nightWatch from './art/night-watch.webp';
import erasedName from './art/erased-name.webp';
import './prologue.css';

const passages = [
  [0, 'stars'],
  [0, 'suns'],
  [0, 'dark'],
  [0, 'why'],
  [1, 'cold'],
  [1, 'fear'],
  [1, 'forgotten'],
] as const;

export function createPrologue(dialog: HTMLDialogElement) {
  const frames = dialog.querySelectorAll('img');
  const text = requireElement(dialog, 'p', HTMLParagraphElement);
  const advance = requireElement(dialog, '[data-advance]', HTMLButtonElement);
  const pause = requireElement(dialog, '[data-pause]', HTMLButtonElement);
  const skip = requireElement(dialog, '[data-skip]', HTMLButtonElement);
  let current = 0;
  let automatic = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: (() => void) | null = null;

  // Each passage owns one timer. Background tabs wait for the player to return.
  function schedule() {
    clearTimeout(timer);
    if (dialog.open && automatic && !document.hidden && current < passages.length - 1) {
      timer = setTimeout(() => show(current + 1), current === 3 ? 3200 : 5700);
    }
  }
  function show(index: number) {
    current = index;
    const passage = passages[current];
    if (!passage) throw new RangeError(`Unknown prologue passage: ${current}`);
    const [frame, subtitle] = passage;
    frames.forEach((picture, i) => {
      picture.classList.toggle('visible', i === frame);
      picture.setAttribute('aria-hidden', String(i !== frame));
    });
    text.textContent = storyText(subtitle);
    const last = current === passages.length - 1;
    advance.textContent = last ? storyText('enter') : storyText('next');
    pause.hidden = skip.hidden = last;
    if (last && dialog.contains(document.activeElement)) advance.focus({ preventScroll: true });
    schedule();
  }
  function enter() {
    if (!dialog.open) return;
    clearTimeout(timer);
    dialog.close();
    const complete = finish;
    finish = null;
    complete?.();
  }
  function setAutomatic(value: boolean) {
    automatic = value;
    pause.textContent = automatic ? storyText('pause') : storyText('play');
    schedule();
  }
  advance.addEventListener('click', () =>
    current < passages.length - 1 ? show(current + 1) : enter(),
  );
  pause.addEventListener('click', () => setAutomatic(!automatic));
  skip.addEventListener('click', enter);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    enter();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) enter();
    }
  });
  document.addEventListener('visibilitychange', schedule);

  function illustrations() {
    const [first, second] = frames;
    if (!first || !second) throw new Error('Missing prologue illustrations');
    if (!first.hasAttribute('src')) {
      first.src = nightWatch;
      second.src = erasedName;
    }
    return [first, second];
  }
  return {
    prepare: () => Promise.allSettled(illustrations().map((image) => image.decode())),
    begin(onComplete: () => void) {
      if (dialog.open) return;
      finish = onComplete;
      illustrations();
      dialog.showModal();
      setAutomatic(!matchMedia('(prefers-reduced-motion: reduce)').matches);
      show(0);
      advance.focus({ preventScroll: true });
    },
  };
}
