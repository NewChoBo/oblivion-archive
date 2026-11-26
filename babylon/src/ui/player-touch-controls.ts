import { playText } from '../content/locales/play.ts';
import { createTouchPad, type PadAxis } from './touch-pad.ts';
import './styles/player-touch.css';

interface TouchActions {
  move(x: PadAxis, y: PadAxis, sprint: boolean): void;
  look(dx: number, dy: number): void;
  jump(): void;
  reload(): void;
  aim(value: boolean): void;
  fire(): void;
  release(): void;
  cancel(): void;
}

// One thumb can drag the trigger to keep aiming while drawing a bow or firing.
export function createPlayerTouchControls(actions: TouchActions) {
  const controls = document.createElement('div');
  controls.className = 'player-touch';
  const stick = createTouchPad(playText('play.touch.move'), { shape: 'disc' }, actions.move);
  controls.append(stick.pad);
  function button(action: 'fire' | 'jump' | 'reload' | 'aim') {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.action = action;
    b.textContent = playText(`play.touch.${action}`);
    controls.append(b);
    return b;
  }
  button('jump').onclick = actions.jump;
  button('reload').onclick = actions.reload;
  const aim = button('aim');
  aim.setAttribute('aria-pressed', 'false');
  aim.onclick = () => {
    const active = aim.getAttribute('aria-pressed') === 'false';
    aim.setAttribute('aria-pressed', String(active));
    actions.aim(active);
  };
  const fire = button('fire');
  let thumb: { id: number; x: number; y: number } | null = null;
  fire.onpointerdown = (e) => {
    if (thumb || e.button !== 0) return;
    e.preventDefault();
    thumb = { id: e.pointerId, x: e.clientX, y: e.clientY };
    fire.setPointerCapture(e.pointerId);
    fire.classList.add('held');
    actions.fire();
  };
  fire.onpointermove = (e) => {
    if (!thumb || thumb.id !== e.pointerId) return;
    actions.look(e.clientX - thumb.x, e.clientY - thumb.y);
    thumb.x = e.clientX;
    thumb.y = e.clientY;
  };
  function end(onEnd?: () => void) {
    if (!thumb) return;
    const { id } = thumb;
    thumb = null;
    if (fire.hasPointerCapture(id)) fire.releasePointerCapture(id);
    fire.classList.remove('held');
    onEnd?.();
  }
  fire.onpointerup = (e) => {
    if (thumb?.id === e.pointerId) end(actions.release);
  };
  fire.onpointercancel = fire.onlostpointercapture = (e) => {
    if (thumb?.id === e.pointerId) end(actions.cancel);
  };
  fire.onclick = (e) => {
    if (e.detail === 0) {
      actions.fire();
      actions.release();
    }
  };
  document.body.append(controls);
  return {
    reset() {
      stick.reset();
      // The input owner cancels the weapon once when clearing all input sources.
      end();
      aim.setAttribute('aria-pressed', 'false');
    },
  };
}
