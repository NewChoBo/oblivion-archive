import { expeditionText } from '../content/locales/expedition.ts';
import type { AbstractMesh } from '@babylonjs/core';
import type { LevelId } from '../content/catalogs/experiences.ts';
import type { createExpeditionState } from './state.ts';
import { requireElement } from '../ui/dom.ts';
import { createMinimap, type MapExperience, type MapPoints } from './minimap.ts';

export function createExpeditionHud(
  state: Pick<ReturnType<typeof createExpeditionState>, 'revision' | 'readHud' | 'saved'>,
  points: MapPoints,
  doors: readonly AbstractMesh[],
  levelId?: LevelId | null,
) {
  const map = createMinimap(
    requireElement(document, '#minimap', HTMLElement),
    points,
    doors,
    levelId,
  );
  const chapterObjective = requireElement(document, '#objective', HTMLElement);
  const panel = requireElement(document, '#expedition-hud', HTMLElement);
  const quest = requireElement(document, '#expedition-quest', HTMLElement);
  panel.setAttribute('aria-label', expeditionText('hud.title'));
  for (const id of ['health', 'armor'] as const) {
    requireElement(panel, `[data-label="${id}"]`, HTMLElement).textContent = expeditionText(
      `hud.${id}`,
    );
  }
  requireElement(panel, '[data-expedition="saving"]', HTMLElement).textContent =
    expeditionText('hud.save');
  let lastRevision = -1;
  return {
    update(
      visible: boolean,
      position: { x: number; z: number },
      yaw: number,
      experience?: MapExperience | null,
    ) {
      const dungeon = Boolean(levelId);
      map.update(visible, position, yaw, dungeon, experience);
      const hideObjective = dungeon && !experience;
      if (chapterObjective.hidden !== hideObjective) chapterObjective.hidden = hideObjective;
      if (panel.hidden === visible) panel.hidden = !visible;
      if (!visible) {
        quest.hidden = true;
        lastRevision = -1;
        return;
      }
      // Movement refreshes the map independently of revisions to health, armor and quest state.
      if (lastRevision !== state.revision) {
        lastRevision = state.revision;
        const snapshot = state.readHud();
        for (const [id, max] of [
          ['health', snapshot.maxHealth],
          ['armor', snapshot.maxArmor],
        ] as const) {
          requireElement(panel, `[data-vital="${id}"]`, HTMLElement).textContent =
            `${Math.ceil(snapshot[id])} / ${max}`;
          const bar = requireElement(panel, `[data-bar="${id}"]`, HTMLProgressElement);
          bar.max = max;
          bar.value = snapshot[id];
        }
        const progress = dungeon
          ? expeditionText('hud.remaining', { count: snapshot.remainingEnemies })
          : snapshot.quest &&
            (snapshot.contractComplete
              ? expeditionText('hud.complete')
              : expeditionText('hud.contract', { count: Math.min(3, snapshot.kills) }));
        quest.textContent = [progress, snapshot.points > 0 && `SP ${snapshot.points}`]
          .filter(Boolean)
          .join(' · ');
        quest.hidden = Boolean(experience) || !quest.textContent;
        requireElement(panel, '[data-expedition="saving"]', HTMLElement).hidden =
          Boolean(experience) || state.saved;
      }
    },
  };
}
