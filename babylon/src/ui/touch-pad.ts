import './styles/touch-pad.css';

export type PadAxis = -1 | 0 | 1;
type PadLayout =
  { shape: 'disc' } | { shape: 'semicircle'; brakeLabel: string; surface: HTMLElement };

// Capture one thumb independently of any look or skill gesture on the other side.
export function createTouchPad(
  label: string,
  layout: PadLayout,
  move: (x: PadAxis, y: PadAxis, sprint: boolean) => void,
) {
  const pad = document.createElement('div');
  pad.className = 'touch-pad';
  pad.dataset.shape = layout.shape;
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', label);
  const puck = document.createElement('i');
  const legend = document.createElement('span');
  legend.textContent = layout.shape === 'semicircle' ? layout.brakeLabel : '⌄';
  pad.append(puck, legend);
  const surface = layout.shape === 'semicircle' ? layout.surface : pad;
  let pointer: number | null = null;
  let rect: DOMRect,
    neutralX = 0,
    neutralY = 0,
    lastX = 0,
    lastY = 0,
    lastSprint = false;
  function axes(x: PadAxis, y: PadAxis, sprint = false) {
    if (x === lastX && y === lastY && sprint === lastSprint) return;
    lastSprint = sprint;
    lastX = x;
    lastY = y;
    move(x, y, sprint);
  }
  function track(e: PointerEvent) {
    if (e.pointerId !== pointer) return;
    // On the chase pad the flat edge is full speed. A captured thumb can cross it to steer.
    const semicircle = layout.shape === 'semicircle';
    const travelX = rect.width * (semicircle ? 0.38 : 0.31);
    const travelY = rect.height * (semicircle ? 0.54 : 0.31);
    const x = (e.clientX - neutralX) / (semicircle ? travelX : rect.width * 0.39);
    const dy = e.clientY - neutralY;
    const y = semicircle ? Math.max(0, dy) / travelY : dy / (rect.height * 0.39);
    const length = Math.max(1, Math.hypot(x, y));
    puck.style.transform = `translate(calc(-50% + ${(x / length) * travelX}px), calc(-50% + ${(y / length) * travelY}px))`;
    const axis = (v: number): PadAxis => (v < -0.3 ? -1 : v > 0.3 ? 1 : 0);
    axes(axis(x), axis(y), y < -0.9);
  }
  function reset() {
    const id = pointer;
    pointer = null;
    if (id !== null && surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    puck.style.transform = '';
    pad.classList.remove('held');
    axes(0, 0);
  }
  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (layout.shape === 'semicircle') {
      const bounds = surface.getBoundingClientRect();
      if (e.pointerType !== 'touch' || e.clientX >= bounds.left + bounds.width / 2) return;
      e.preventDefault();
      if (pointer !== null) return;
      // The HUD covers the viewport. Anchor its puck at the contact, even at a screen edge.
      pad.style.left = e.clientX + 'px';
      pad.style.top = e.clientY + 'px';
    } else {
      if (pointer !== null) return;
      e.preventDefault();
    }
    pad.classList.add('held');
    rect = pad.getBoundingClientRect();
    if (layout.shape === 'semicircle') {
      neutralX = e.clientX;
      neutralY = e.clientY;
    } else {
      neutralX = rect.left + rect.width / 2;
      neutralY = rect.top + rect.height / 2;
    }
    pointer = e.pointerId;
    surface.setPointerCapture(pointer);
    track(e);
  });
  surface.addEventListener('pointermove', track);
  function release(e: PointerEvent) {
    if (e.pointerId === pointer) reset();
  }
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);
  surface.addEventListener('lostpointercapture', release);
  return { pad, reset };
}
