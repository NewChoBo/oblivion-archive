import { readPlayEntry } from '../../app/play-entry.ts';
import { getLocale, resolveLocale, setLocale, type Locale } from '../../content/locales/locale.ts';
import { koreanShell } from '../../content/locales/ko/shell.ts';
import { getStorage } from './storage.ts';

const preferenceKey = 'oblivion-archive.language';

export function readLanguage(url: URL, storage?: Pick<Storage, 'getItem'>): Locale {
  const override = url.searchParams.get('lang');
  if (override !== null) return resolveLocale(override);
  try {
    return resolveLocale(storage?.getItem(preferenceKey));
  } catch {
    return resolveLocale(null);
  }
}

function translateShell(): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-msg]')) {
    const translation = koreanShell[node.dataset.msg!];
    if (!translation) continue;
    // Preserve adjacent controls, keycaps, and their event handlers.
    const text = [...node.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
    );
    if (text?.textContent)
      text.textContent = text.textContent.replace(/\S[\s\S]*\S|\S/, translation);
  }
  for (const attribute of ['aria-label', 'alt', 'title', 'content']) {
    const marker = 'data-msg-' + attribute;
    for (const node of document.querySelectorAll('[' + marker + ']')) {
      const translation = koreanShell[node.getAttribute(marker)!];
      if (translation) node.setAttribute(attribute, translation);
    }
  }
}

export function initializeLanguage(): void {
  const url = new URL(location.href);
  const storage = getStorage('localStorage');
  setLocale(readLanguage(url, storage));
  document.documentElement.lang = getLocale();
  if (getLocale() === 'ko') translateShell();

  const select = document.querySelector<HTMLSelectElement>('#game-language');
  const detail = document.getElementById('game-language-detail');
  if (!select || !detail) return;
  const inLevel = readPlayEntry(url.searchParams) !== null;
  if (inLevel) {
    detail.hidden = false;
    select.setAttribute('aria-describedby', detail.id);
  }
  select.value = getLocale();
  select.addEventListener('change', () => {
    const locale = resolveLocale(select.value);
    try {
      storage?.setItem(preferenceKey, locale);
    } catch {
      /* The URL still carries the choice. */
    }
    const destination = new URL(location.href);
    destination.searchParams.set('lang', locale);
    // Level links inherit the current query. Keep the running world and match intact.
    if (inLevel) history.replaceState(history.state, '', destination);
    else location.replace(destination.href);
  });
}
