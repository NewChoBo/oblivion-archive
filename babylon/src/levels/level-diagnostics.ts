import { findSurfaceOverlaps } from './surface-overlaps.ts';

import type { Scene } from '@babylonjs/core';
import type { SurfaceFinding } from './surface-overlaps.ts';

interface WarningEntry {
  key: string;
  firstSeen?: string;
  occurrences?: number;
}
type WarningStore = Pick<Storage, 'getItem' | 'setItem'>;

export const WARNING_STORAGE_KEY = 'oblivion-archive.level-warnings.v1';
const historyLimit = 200;

export function createWarningHistory(
  storage?: WarningStore | null,
  now = () => new Date().toISOString(),
) {
  let entries: WarningEntry[] = [];
  try {
    const saved: unknown = JSON.parse(storage?.getItem(WARNING_STORAGE_KEY) ?? '[]');
    if (Array.isArray(saved))
      entries = saved
        .filter(
          (entry: unknown): entry is WarningEntry =>
            typeof entry === 'object' &&
            entry !== null &&
            'key' in entry &&
            typeof entry.key === 'string',
        )
        .slice(-historyLimit);
  } catch {
    /* A blocked or corrupt browser store leaves the in-memory log available. */
  }

  return {
    record(level: string, findings: readonly SurfaceFinding[]) {
      if (!findings.length) return [];
      const timestamp = now();
      const reported = [];
      for (const finding of findings) {
        const objects = finding.objects.map(({ zone, id, part }) => `${zone}/${id}/${part}`).sort();
        const key = JSON.stringify([level, finding.code, ...objects]);
        const index = entries.findIndex((entry) => entry.key === key);
        const previous = index < 0 ? null : entries.splice(index, 1)[0];
        const entry = {
          ...finding,
          level,
          key,
          firstSeen: previous?.firstSeen ?? timestamp,
          lastSeen: timestamp,
          occurrences: (previous?.occurrences ?? 0) + 1,
        };
        entries.push(entry);
        reported.push(entry);
      }
      entries = entries.slice(-historyLimit);
      try {
        storage?.setItem(WARNING_STORAGE_KEY, JSON.stringify(entries));
      } catch {
        /* Keep logging in memory. */
      }
      return reported;
    },
    list: () => structuredClone(entries),
  };
}

export function installLevelDiagnostics(scene: Scene, level: string) {
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    /* Access can be blocked by the browser. */
  }
  const history = createWarningHistory(storage);
  const announced = new Set();

  function scan() {
    const findings = history.record(level, findSurfaceOverlaps(scene.meshes));
    for (const finding of findings) {
      if (announced.has(finding.key)) continue;
      announced.add(finding.key);
      console.warn(
        `[Level diagnostics] Possible z-fighting: ${finding.objects.map((object) => object.name).join(' / ')}`,
        finding,
      );
    }
    return structuredClone(findings);
  }

  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(history.list(), null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${level}-surface-warnings.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  Object.assign(window, {
    __LEVEL_DIAGNOSTICS__: Object.freeze({ scan, history: history.list, download }),
  });
  scan();
}
