// Pointer Lock is requested only by the explicit entry/resume button. The
// unlocked fallback also looks without holding a mouse button, within canvas.
import { ACTIONS, canonicalKey, type InputSettings, type InputAction } from './preferences.ts';
export function lookPitch(pitch: number, delta: number) {
  return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + delta));
}
type InputMode = 'idle' | 'locked' | 'requesting' | 'free-look';
interface PlayerInputOptions {
  canvas: HTMLCanvasElement;
  preferences: {
    get(): InputSettings;
    subscribe(listener: (value: InputSettings) => void): unknown;
  };
  canPlay(): boolean;
  onLook(dx: number, dy: number): void;
  onAction(action: InputAction): void;
  onPause(reason: 'menu' | 'unlock' | 'blur'): void;
  onMode(mode: InputMode): void;
  onFire(): void;
  onRelease(): void;
  onCancel(): void;
  onAim(aiming: boolean): void;
}

export function createPlayerInput({
  canvas,
  preferences,
  canPlay,
  onLook,
  onAction,
  onPause,
  onMode,
  onFire,
  onRelease,
  onCancel,
  onAim,
}: PlayerInputOptions) {
  const keys = new Set<string>(),
    stats = { lockAttempts: 0, lockSuccesses: 0, lockFailures: 0, lookEvents: 0 };
  let mode: InputMode = 'idle',
    previous: [number, number] | null = null,
    ignoreFireUntil = 0,
    request = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    lastError = '',
    lastErrorMessage = '',
    outside = false,
    sessionFree = false,
    canvasRetryUsed = false;
  let edgeX = 0,
    edgeY = 0;
  // Free look has finite screen coordinates. Ramp up only in the outer strip.
  function edgeSpeed(position: number, size: number, delta: number | undefined, last: number) {
    const band = Math.min(48, size * 0.09);
    if (!band) return 0;
    const edge =
      position < band
        ? -(band - position) / band
        : position > size - band
          ? (position - size + band) / band
          : 0;
    // Pulling inward releases the turn; moving parallel to the edge keeps
    // the current state until the pointer moves outward again.
    if (!edge) return 0;
    if (delta === 0) return last;
    if (delta !== undefined && Math.sign(delta) !== Math.sign(edge)) return 0;
    return Math.max(-1, Math.min(1, edge));
  }
  function resetLook() {
    previous = null;
    edgeX = 0;
    edgeY = 0;
  }
  const lockDocument = () => canvas.ownerDocument,
    locked = () => lockDocument().pointerLockElement === canvas;
  const setMode = (value: InputMode) => {
    mode = value;
    canvas.dataset.input = value;
    resetLook();
    onMode(value);
  };
  function clear() {
    keys.clear();
    resetLook();
    onCancel();
    onAim(false);
  }
  function fallback(error: unknown, token = request) {
    const reason = typeof error === 'object' && error !== null ? error : {};
    const name = 'name' in reason && typeof reason.name === 'string' ? reason.name : '';
    const message = 'message' in reason && typeof reason.message === 'string' ? reason.message : '';
    if (token !== request || !canPlay() || locked()) return;
    if (message) {
      lastErrorMessage = message;
      lastError = name;
    }
    if (mode !== 'requesting') return;
    stats.lockFailures++;
    lastError = name || 'PointerLockUnavailable';
    clearTimeout(timer);
    setMode('free-look');
  }
  const api = {
    keys,
    activate(retrying = false) {
      clear();
      outside = false;
      lastError = '';
      lastErrorMessage = '';
      if (!retrying) canvasRetryUsed = false;
      ignoreFireUntil = performance.now() + 180;
      canvas.focus({ preventScroll: true });
      const token = ++request;
      if (!preferences.get().pointerLock || sessionFree) {
        setMode('free-look');
        return;
      }
      setMode('requesting');
      stats.lockAttempts++;
      try {
        if (!canvas.requestPointerLock) {
          fallback({ name: 'Unsupported' }, token);
          return;
        }
        const pending = canvas.requestPointerLock();
        pending?.catch((error) => fallback(error, token));
        timer = setTimeout(() => fallback({ name: 'NoLockGranted' }, token), 1600);
      } catch (error) {
        fallback(error, token);
      }
    },
    deactivate() {
      request++;
      clearTimeout(timer);
      clear();
      setMode('idle');
      if (locked()) lockDocument().exitPointerLock();
    },
    retry() {
      if (canPlay()) {
        sessionFree = false;
        canvasRetryUsed = true;
        api.activate(true);
      }
    },
    chooseFree() {
      sessionFree = true;
      outside = false;
      clear();
      ignoreFireUntil = performance.now() + 180;
      setMode('free-look');
      canvas.focus({ preventScroll: true });
    },
    clear,
    updateLook(seconds: number) {
      if (mode !== 'free-look' || !canPlay() || (!edgeX && !edgeY)) return;
      const pixels = 650 * Math.min(seconds, 0.1);
      onLook(edgeX * pixels, edgeY * pixels);
    },
    down: (action: InputAction) => keys.has(preferences.get().bindings[action]),
    snapshot: () => ({
      mode,
      locked: locked(),
      outside,
      captureChoice: locked()
        ? 'locked'
        : !preferences.get().pointerLock
          ? 'explicit-free-setting'
          : sessionFree
            ? 'explicit-free-session'
            : lastError
              ? 'denied'
              : mode,
      attached: canvas.isConnected,
      ownerDocumentIsCurrent: canvas.ownerDocument === document,
      documentFocused: lockDocument().hasFocus(),
      heldKeys: [...keys],
      lastError,
      lastErrorMessage,
      ...stats,
    }),
  };
  document.addEventListener('pointerlockchange', () => {
    if (locked()) {
      if (!canPlay()) {
        lockDocument().exitPointerLock();
        return;
      }
      clearTimeout(timer);
      if (mode !== 'locked') stats.lockSuccesses++;
      clear();
      setMode('locked');
    } else if (mode === 'locked' && canPlay()) {
      clear();
      onPause('unlock');
    }
  });
  document.addEventListener('pointerlockerror', () => {
    if (mode === 'requesting') fallback({ name: 'PointerLockDenied' });
  });
  document.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse' || !canPlay() || !['locked', 'free-look'].includes(mode))
      return;
    let dx, dy;
    if (mode === 'locked') {
      dx = event.movementX;
      dy = event.movementY;
    } else {
      if (event.target !== canvas) {
        resetLook();
        return;
      }
      const rect = canvas.getBoundingClientRect();
      if (previous) {
        dx = event.clientX - previous[0];
        dy = event.clientY - previous[1];
      }
      previous = [event.clientX, event.clientY];
      edgeX = edgeSpeed(event.clientX - rect.left, rect.width, dx, edgeX);
      edgeY = edgeSpeed(event.clientY - rect.top, rect.height, dy, edgeY);
    }
    if (
      dx !== undefined &&
      dy !== undefined &&
      Number.isFinite(dx) &&
      Number.isFinite(dy) &&
      (dx || dy)
    ) {
      onLook(dx, dy);
      stats.lookEvents++;
    }
  });
  canvas.addEventListener('pointerenter', resetLook);
  window.addEventListener('resize', resetLook);
  canvas.addEventListener('pointerleave', () => {
    if (mode === 'free-look') {
      outside = true;
      clear();
    }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  function pressButton(event: PointerEvent) {
    if ((event.button !== 0 && event.button !== 2) || !canPlay()) return;
    if (
      mode === 'free-look' &&
      lastError &&
      !sessionFree &&
      preferences.get().pointerLock &&
      !canvasRetryUsed
    ) {
      api.retry();
      return;
    }
    if (mode === 'free-look' && outside) {
      outside = false;
      clear();
      ignoreFireUntil = performance.now() + 180;
      canvas.focus({ preventScroll: true });
      return;
    }
    if (['locked', 'free-look'].includes(mode) && performance.now() >= ignoreFireUntil) {
      canvas.focus();
      if (event.button === 2) onAim(true);
      else onFire();
    }
  }
  function releaseButton(event: PointerEvent) {
    if (event.button === 0) onRelease();
    if (event.button === 2) onAim(false);
  }
  canvas.addEventListener('pointerdown', pressButton);
  document.addEventListener('pointerup', releaseButton, true);
  // With one button already held, Pointer Events delivers the next button
  // transition as pointermove, even if the mouse has not moved a pixel.
  document.addEventListener(
    'pointermove',
    (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      const flag = event.button === 0 ? 1 : 2;
      if (!(event.buttons & flag)) releaseButton(event);
      else if (event.target === canvas) pressButton(event);
    },
    true,
  );
  document.addEventListener('pointercancel', clear);
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.target instanceof Element && event.target.closest('button')) clear();
    },
    true,
  );
  window.addEventListener('keydown', (event) => {
    if (
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest('dialog[open]')) ||
      document.querySelector('dialog[open]')
    )
      return;
    if (event.code === 'Escape' || event.code === 'Tab') {
      if (canPlay()) {
        event.preventDefault();
        if (event.repeat) return;
        clear();
        if (event.code === 'Tab') onAction('inventory');
        else onPause('menu');
      }
      return;
    }
    if (
      !canPlay() ||
      (event.target instanceof Element && event.target.closest('button,input,textarea,select'))
    )
      return;
    const code = canonicalKey(event.code),
      action = ACTIONS.find(([id]) => preferences.get().bindings[id] === code)?.[0];
    if (!action) return;
    event.preventDefault();
    keys.add(code);
    if (!event.repeat) onAction(action);
  });
  window.addEventListener('keyup', (event) => keys.delete(canonicalKey(event.code)));
  window.addEventListener('blur', () => {
    clear();
    if (canPlay()) onPause('blur');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clear();
      if (canPlay()) onPause('blur');
    }
  });
  let requestedLock = preferences.get().pointerLock;
  preferences.subscribe((value) => {
    if (value.pointerLock !== requestedLock) {
      sessionFree = false;
      requestedLock = value.pointerLock;
    }
  });
  return api;
}
