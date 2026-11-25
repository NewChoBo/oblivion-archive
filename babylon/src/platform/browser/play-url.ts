import { writePlayEntry } from '../../app/play-entry.ts';

export function playUrl(current: string | URL, entry: Parameters<typeof writePlayEntry>[1]) {
  // Work on a copy so constructing a destination cannot change the caller's current URL.
  const url = new URL(current);
  writePlayEntry(url.searchParams, entry);
  return url.href;
}
