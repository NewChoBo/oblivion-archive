import { startupText } from './content/locales/startup.ts';
import { initializeLanguage } from './platform/browser/language.ts';

// Startup constructs menus during import, so resolve the language before loading it.
initializeLanguage();
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
