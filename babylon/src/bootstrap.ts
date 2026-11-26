import { startupText } from './content/locales/startup.ts';
import { initializeLanguage } from './platform/browser/language.ts';
import {
  landscapeFrame,
  mountLandscapeFrame,
  syncGameUrl,
} from './platform/browser/game-navigation.ts';
import {
  canRequestLandscape,
  installLandscapeRecovery,
  requestLandscape,
} from './platform/browser/landscape.ts';

// Startup constructs menus during import, so resolve the language before loading it.
initializeLanguage();
const frame = landscapeFrame();
if (!frame) installLandscapeRecovery();
if (
  window === window.top &&
  matchMedia('(any-pointer: coarse)').matches &&
  (document.fullscreenEnabled || canRequestLandscape())
) {
  mountLandscapeFrame(requestLandscape);
} else {
  if (frame) {
    syncGameUrl();
    window.addEventListener('pageshow', syncGameUrl);
    frame.title = frame.ownerDocument.title = document.title;
    frame.ownerDocument.documentElement.lang = document.documentElement.lang;
  }
  void import('./app/startup.ts').catch((error) => {
    console.error('Startup module failed to load', error);
    const status = document.getElementById('loading');
    const retry = document.getElementById('startup-retry');
    if (status) status.textContent = startupText('loadError');
    if (retry) {
      retry.hidden = false;
      retry.onclick = () => location.reload();
    }
  });
}
