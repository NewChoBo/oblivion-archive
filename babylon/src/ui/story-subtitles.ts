import { storyText } from '../content/locales/story.ts';
import { requireElement } from './dom.ts';

export function createStorySubtitles(root: HTMLElement, erasedPhotoUrl: string) {
  const caption = requireElement(root, '#notice-text', HTMLElement);
  const source = requireElement(root, '#notice-detail', HTMLElement);
  let lines: string[] = [];
  let secondsLeft = 0;

  function clear() {
    lines = [];
    secondsLeft = 0;
    root.classList.remove('visible');
    root.querySelector('img')?.remove();
  }

  function nextLine() {
    const line = lines.shift();
    if (!line) {
      clear();
      return;
    }
    caption.textContent = line;
    // Count Unicode code points so a surrogate pair contributes one reading-time unit.
    secondsLeft = Math.max(3.2, 1.5 + Array.from(line).length * 0.105);
  }

  return {
    clear,
    show(text: string, detail = '', inspectPhoto = false) {
      clear();
      lines = text.split('\n');
      source.textContent = detail;
      source.hidden = !detail;
      if (inspectPhoto) {
        const print = new Image();
        print.src = erasedPhotoUrl;
        print.alt = storyText('photo.alt');
        root.prepend(print);
      }
      nextLine();
      if (secondsLeft > 0) root.classList.add('visible');
    },
    update(elapsed: number) {
      if (secondsLeft <= 0) return;
      secondsLeft -= elapsed;
      if (secondsLeft <= 0) nextLine();
    },
  };
}
