import './styles/touch-pad.css';

export type PadAxis = -1 | 0 | 1;

// Capture one thumb independently of any look or skill gesture on the other side.
export function createTouchPad(
  label: string,
  brake: string | null,
  move: (x: PadAxis, y: PadAxis, sprint: boolean) => void,
) {
  const pad = document.createElement('div');
  pad.className = 'touch-pad';
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', label);
  const puck = document.createElement('i');
  const legend = document.createElement('span');
  legend.textContent = brake ?? '⌄';
  pad.append(puck, legend);
  let pointer: number | null = null;
  let rect: DOMRect,
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
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width * 0.39);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height * 0.39);
    const length = Math.max(1, Math.hypot(x, y));
    puck.style.transform = `translate(calc(-50% + ${(x / length) * rect.width * 0.31}px), calc(-50% + ${(y / length) * rect.height * 0.31}px))`;
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
