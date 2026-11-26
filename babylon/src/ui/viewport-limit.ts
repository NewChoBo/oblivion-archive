import { startupText } from '../content/locales/startup.ts';
import { canRequestLandscape, requestLandscape } from '../platform/browser/landscape.ts';

const minimumWidth = 568;
const minimumHeight = 320;

// The startup gate and the resize dialog share the same landscape viewport threshold.
export const playableViewport = matchMedia(
  `(min-width: ${minimumWidth}px) and (min-height: ${minimumHeight}px)`,
);

export function installViewportLimit(dialog: HTMLDialogElement) {
  const minimum = dialog.querySelector<HTMLElement>('#viewport-minimum');
  const rotate = dialog.querySelector<HTMLButtonElement>('#viewport-rotate');
  const message = dialog.querySelector<HTMLElement>('#viewport-orientation-status');
  if (!minimum || !rotate || !message) throw new Error('Missing viewport controls');
  minimum.textContent = startupText('viewportMinimum', {
    width: minimumWidth,
    height: minimumHeight,
  });

  const portraitTouch = matchMedia('(pointer: coarse) and (orientation: portrait)');
  const update = () => {
    rotate.hidden = !portraitTouch.matches || !canRequestLandscape();
    if (!portraitTouch.matches || playableViewport.matches) message.textContent = '';
    if (playableViewport.matches) dialog.close();
    else if (!dialog.open) dialog.showModal();
  };

  rotate.onclick = async () => {
    rotate.disabled = true;
    message.textContent = '';
    const accepted = await requestLandscape(true);
    rotate.disabled = false;
    if (!accepted && dialog.open && portraitTouch.matches)
      message.textContent = startupText('rotateManually');
  };

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  playableViewport.addEventListener('change', update);
  portraitTouch.addEventListener('change', update);
  update();
  // Installed apps and some tabs can rotate on launch without a fullscreen gesture.
  // The resize event, not a resolved API promise, decides when the game fits.
  if (portraitTouch.matches) void requestLandscape(false);
}
