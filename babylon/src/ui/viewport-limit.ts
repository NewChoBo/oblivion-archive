import { startupText } from '../content/locales/startup.ts';

const minimumWidth = 568;
const minimumHeight = 320;

// The startup gate and the resize dialog share the same landscape viewport threshold.
export const playableViewport = matchMedia(
  `(min-width: ${minimumWidth}px) and (min-height: ${minimumHeight}px)`,
);

export function installViewportLimit(dialog: HTMLDialogElement) {
  const minimum = dialog.querySelector<HTMLElement>('#viewport-minimum');
  if (!minimum) throw new Error('Missing viewport minimum label');
  minimum.textContent = startupText('viewportMinimum', {
    width: minimumWidth,
    height: minimumHeight,
  });

  function update() {
    if (playableViewport.matches) dialog.close();
    else if (!dialog.open) dialog.showModal();
  }

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  playableViewport.addEventListener('change', update);
  update();
}
