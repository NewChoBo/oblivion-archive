import { landscapeFrame } from './game-navigation.ts';

// Some mobile browsers expose ScreenOrientation without the optional locking API.
type LockableOrientation = ScreenOrientation & { lock?(direction: 'landscape'): Promise<void> };

let locked: 'window' | 'fullscreen' | null = null;
let wanted = false;
let pending: { gesture: boolean; promise: Promise<boolean> } | null = null;

export function canRequestLandscape() {
  return (
    matchMedia('(any-pointer: coarse)').matches &&
    typeof (screen.orientation as LockableOrientation | undefined)?.lock === 'function'
  );
}

async function acquire(fromGesture: boolean) {
  try {
    // Regular mobile tabs may require fullscreen. Only an actual tap can enter it.
    if (
      fromGesture &&
      !document.fullscreenElement &&
      !matchMedia('(display-mode: fullscreen)').matches &&
      document.fullscreenEnabled
    ) {
      // An embedded browser may allow a windowed lock even when it denies fullscreen.
      await document.documentElement.requestFullscreen().catch(() => {});
    }
    await (screen.orientation as LockableOrientation).lock!('landscape');
    return true;
  } catch {
    // Even without an orientation lock, fullscreen keeps the hand-rotated game playable.
    return false;
  }
}

export function requestLandscape(fromGesture: boolean): Promise<boolean> {
  const frame = landscapeFrame();
  if (frame) return frame.requestGameLandscape(fromGesture);
  if (!canRequestLandscape() || document.hidden) return Promise.resolve(false);
  if (fromGesture) wanted = true;
  if (locked === 'window' || (locked === 'fullscreen' && document.fullscreenElement))
    return Promise.resolve(true);
  if (pending && (!fromGesture || pending.gesture)) return pending.promise;

  // A real tap can enter fullscreen while a windowed attempt is still waiting for permission.
  const promise = acquire(fromGesture).then((accepted) => {
    if (pending?.promise === promise) {
      pending = null;
      if (accepted) {
        locked = document.fullscreenElement ? 'fullscreen' : 'window';
        wanted = true;
      }
    }
    return accepted;
  });
  pending = { gesture: fromGesture, promise };
  return promise;
}

export function installLandscapeRecovery() {
  if (!canRequestLandscape()) return;
  const restore = () => {
    locked = null;
    if (wanted && !document.hidden) void requestLandscape(false);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      locked = null;
      pending = null;
    } else restore();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) restore();
  });
  screen.orientation.addEventListener('change', () => {
    if (screen.orientation.type.startsWith('portrait')) restore();
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) locked = null;
  });
}
