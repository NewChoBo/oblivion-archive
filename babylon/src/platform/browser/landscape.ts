// Some mobile browsers expose ScreenOrientation without the optional locking API.
type LockableOrientation = ScreenOrientation & { lock?(direction: 'landscape'): Promise<void> };

// A browser that already granted a windowed lock does not need a fullscreen entry tap.
let lockedOutsideFullscreen = false;

export function canRequestLandscape() {
  return (
    matchMedia('(pointer: coarse)').matches &&
    typeof (screen.orientation as LockableOrientation | undefined)?.lock === 'function'
  );
}

export async function requestLandscape(fromGesture: boolean): Promise<boolean> {
  if (!canRequestLandscape()) return false;
  if (lockedOutsideFullscreen && screen.orientation.type.startsWith('landscape')) return true;
  const root = document.documentElement;
  let enteredFullscreen = false;
  try {
    // Regular mobile tabs may require fullscreen. Only an actual tap can enter it.
    if (
      fromGesture &&
      !document.fullscreenElement &&
      !matchMedia('(display-mode: fullscreen)').matches &&
      document.fullscreenEnabled
    ) {
      // An embedded browser may allow a windowed lock even when it denies fullscreen.
      await root.requestFullscreen().catch(() => {});
      enteredFullscreen = document.fullscreenElement === root;
    }
    await (screen.orientation as LockableOrientation).lock!('landscape');
    lockedOutsideFullscreen = !document.fullscreenElement;
    return true;
  } catch {
    if (enteredFullscreen && document.fullscreenElement === root) {
      await document.exitFullscreen().catch(() => {});
    }
    return false;
  }
}
