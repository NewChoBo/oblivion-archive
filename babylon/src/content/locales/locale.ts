export type Locale = 'en' | 'ko';
export const DEFAULT_LOCALE: Locale = 'en';
let locale: Locale = DEFAULT_LOCALE;

export function resolveLocale(value: string | null | undefined): Locale {
  if (value) {
    try {
      if (new Intl.Locale(value).language === 'ko') return 'ko';
    } catch {
      /* Invalid locale tags use the source language. */
    }
  }
  return DEFAULT_LOCALE;
}

export const getLocale = (): Locale => locale;
export function setLocale(value: Locale): void {
  locale = value;
}

export type MessageArguments = Readonly<Record<string, string | number>>;
type Translation<K extends string> = Readonly<Partial<Record<K, string>>>;

/** English defines the keys. Korean may omit a key or leave its translation empty. */
export function defineMessages<
  K extends string,
  T extends Translation<NoInfer<K>> = Translation<K>,
>(
  english: Readonly<Record<K, string>>,
  // Check extra keys even when a translation is imported from its own module.
  korean?: T & Record<Exclude<keyof T, K>, never>,
) {
  return (key: K, args: MessageArguments = {}): string => {
    const template = (locale === 'ko' && korean?.[key]) || english[key];
    if (template === undefined) throw new Error('Unknown message key: ' + key);
    // Translations can reorder named arguments. Keep an unbound placeholder visible.
    return template.replace(/\{(\w+)\}/g, (token, name: string) =>
      Object.hasOwn(args, name) ? String(args[name]) : token,
    );
  };
}
