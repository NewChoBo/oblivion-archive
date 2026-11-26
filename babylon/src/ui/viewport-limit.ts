import { startupText } from '../content/locales/startup.ts';
import { canRequestLandscape, requestLandscape } from '../platform/browser/landscape.ts';

const regular = { width: 568, height: 320 };
const compact = { width: 480, height: 216 };
const touch = matchMedia('(any-pointer: coarse)');
const portrait = matchMedia('(orientation: portrait)');
const sizeQuery = ({ width, height }: typeof regular) =>
  `(min-width: ${width}px) and (min-height: ${height}px)`;

// Browser chrome can leave landscape phones with less than 320 CSS pixels of height.
// Gate gameplay on the layout viewport, the same space used by the canvas and HUD.
export const playableViewport = matchMedia(
  `${sizeQuery(regular)}, (any-pointer: coarse) and (orientation: landscape) and ${sizeQuery(compact)}`,
);

export function installViewportLimit(dialog: HTMLDialogElement) {
  const minimum = dialog.querySelector<HTMLElement>('#viewport-minimum');
  const rotate = dialog.querySelector<HTMLButtonElement>('#viewport-rotate');
  const expand = dialog.querySelector<HTMLButtonElement>('#viewport-expand');
  const instructions = dialog.querySelector<HTMLElement>('#viewport-instructions');
  const heading = dialog.querySelector<HTMLElement>('#viewport-heading');
  const message = dialog.querySelector<HTMLElement>('#viewport-orientation-status');
  if (!minimum || !rotate || !expand || !message || !heading || !instructions)
    throw new Error('Missing viewport controls');
  const regularHeading = heading.textContent;
  const portraitHelp = instructions.textContent;

  const update = () => {
    if (playableViewport.matches) {
      if (dialog.open) dialog.close();
      message.textContent = '';
      return;
    }
    const mobilePortrait = touch.matches && portrait.matches;
    const target = touch.matches ? compact : regular;
    minimum.textContent = startupText('viewportMinimum', {
      width: innerWidth,
      height: innerHeight,
      minWidth: target.width,
      minHeight: target.height,
    });
    heading.textContent = mobilePortrait ? startupText('turnToPlay') : regularHeading;
    instructions.textContent = mobilePortrait
      ? portraitHelp
      : startupText(touch.matches ? 'landscapeRoom' : 'windowRoom');
    rotate.hidden = !mobilePortrait || !canRequestLandscape();
    expand.hidden =
      !touch.matches ||
      portrait.matches ||
      !document.fullscreenEnabled ||
      !!document.fullscreenElement;
    if (!dialog.open) dialog.showModal();
  };

  rotate.onclick = async () => {
    rotate.disabled = true;
    message.textContent = '';
    const accepted = await requestLandscape(true);
    rotate.disabled = false;
    if (!accepted && dialog.open && portrait.matches)
      message.textContent = startupText('rotateManually');
  };
  expand.onclick = async () => {
    expand.disabled = true;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      message.textContent = startupText('fullscreenUnavailable');
    } finally {
      expand.disabled = false;
      update();
    }
  };

  dialog.addEventListener('cancel', (event) => event.preventDefault());
  playableViewport.addEventListener('change', update);
  portrait.addEventListener('change', () => {
    message.textContent = '';
    update();
  });
  touch.addEventListener('change', update);
  document.addEventListener('fullscreenchange', update);
  window.addEventListener('resize', update);
  update();
  // Installed apps and some tabs can rotate on launch without a fullscreen gesture.
  if (portrait.matches && touch.matches) void requestLandscape(false);
}
