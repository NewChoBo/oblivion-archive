// Mobile fullscreen and the orientation lock belong to the outer document. Each game
// still loads in a fresh document so its scene, input and audio have their usual lifetime.
type LandscapeFrame = HTMLIFrameElement & {
  requestGameLandscape(fromGesture: boolean): Promise<boolean>;
};

export function landscapeFrame(): LandscapeFrame | null {
  const frame = window.frameElement;
  return frame && 'requestGameLandscape' in frame ? (frame as LandscapeFrame) : null;
}

export function mountLandscapeFrame(request: LandscapeFrame['requestGameLandscape']) {
  const frame = document.createElement('iframe') as LandscapeFrame;
  frame.name = 'archive-game';
  frame.className = 'landscape-game';
  frame.title = document.title;
  frame.requestGameLandscape = request;
  frame.src = location.href;
  document.body.replaceChildren(frame);
  // Existing diagnostics in the tab console should follow the active game after navigation.
  for (const name of [
    '__ROOM_DEMO__',
    '__EXPEDITION__',
    '__FRAME_PROFILE__',
    '__LEVEL_DIAGNOSTICS__',
  ]) {
    Object.defineProperty(window, name, {
      get: () => frame.contentWindow && Reflect.get(frame.contentWindow, name),
    });
  }
}

export function syncGameUrl() {
  // Frame navigations already participate in the tab's back/forward history.
  // Mirror the active URL for sharing and reload without inserting a second entry.
  if (landscapeFrame() && window.parent.location.href !== location.href)
    window.parent.history.replaceState(window.parent.history.state, '', location.href);
}

export function replaceGameUrl(url: URL) {
  history.replaceState(history.state, '', url);
  syncGameUrl();
}
