import assert from 'node:assert/strict';
import test from 'node:test';
import { NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { EXPERIENCE_LEVELS } from '../../src/content/catalogs/experiences.ts';
import { getLocale, setLocale } from '../../src/content/locales/locale.ts';
import { createArenaObjectives } from '../../src/platform/babylon/arena/arena-objectives.ts';

test('changing language translates objective plaques and prompts while preserving scene and interaction IDs', (t) => {
  const previous = getLocale();
  t.after(() => setLocale(previous));
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const level = EXPERIENCE_LEVELS['gothic-arena'];
  function readMarkers(locale) {
    setLocale(locale);
    const scene = new Scene(engine);
    const signs = [];
    const targets = [];
    createArenaObjectives(scene, {
      level,
      kind: 'bomb',
      match: { bombSite: null, escorting: false },
      material: (name) => new PBRMaterial(name, scene),
      sign: (name, text) => signs.push({ name, text }),
      cover: [],
      moveEscort: () => false,
      targets,
    });
    assert.equal(signs.length, level.objectives.bombSites.length);
    return {
      ids: [
        ...targets.map((t) => t.id),
        ...scene.meshes.map((m) => m.name),
        ...signs.map((s) => s.name),
      ],
      captions: signs.map((s) => s.text),
      prompts: targets.map((t) => t.action),
    };
  }
  const english = readMarkers('en');
  const korean = readMarkers('ko');
  assert.deepEqual(korean.ids, english.ids);
  assert.notDeepEqual(korean.captions, english.captions);
  assert.notDeepEqual(korean.prompts, english.prompts);
});
