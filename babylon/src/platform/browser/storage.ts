// Some embedded or restricted origins throw when accessing the storage property itself.
export function getStorage(name: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return window[name];
  } catch {
    return undefined;
  }
}
