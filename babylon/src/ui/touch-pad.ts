import './styles/touch-pad.css';

export type PadAxis = -1 | 0 | 1;
type PadLayout = { shape: 'disc' } | { shape: 'semicircle'; brakeLabel: string };

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
  let pointer: number | null = null;
  let rect: DOMRect,
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
    const x = (e.clientX - rect.left - rect.width / 2) / (semicircle ? travelX : rect.width * 0.39);
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
    if (id !== null && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
    puck.style.transform = '';
    pad.classList.remove('held');
    axes(0, 0);
  }
  pad.onpointerdown = (e) => {
    if (pointer !== null || e.button !== 0) return;
    e.preventDefault();
    rect = pad.getBoundingClientRect();
    const rest = puck.getBoundingClientRect();
    neutralY = rest.top + rest.height / 2;
    pointer = e.pointerId;
    pad.setPointerCapture(pointer);
    pad.classList.add('held');
    track(e);
  };
  pad.onpointermove = track;
  pad.onpointerup =
    pad.onpointercancel =
    pad.onlostpointercapture =
      (e) => {
        if (e.pointerId === pointer) reset();
      };
  return { pad, reset };
}
