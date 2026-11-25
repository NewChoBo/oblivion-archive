import assert from 'node:assert/strict';
import test from 'node:test';
import { FreeCamera, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { ARENA_PISTOL, ARENA_RIFLE } from '../../src/content/catalogs/firearms.ts';
import { ArenaArmory } from '../../src/game/experiences/armory.ts';
import { createArenaFirearms } from '../../src/platform/babylon/arena/arena-firearms.ts';
import { prepareSceneLighting } from '../../src/platform/babylon/rendering/scene-warmup.ts';

test('loading draws the holstered rifle and returns the starter pistol without changing inventory', async (t) => {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const camera = new FreeCamera('eye', Vector3.Zero(), scene);
  const armory = new ArenaArmory(ARENA_PISTOL, [ARENA_PISTOL, ARENA_RIFLE]);
  const firearms = createArenaFirearms(scene, camera, {
    armory,
    eye: () => camera.position,
    anchor: new TransformNode('hand', scene),
    canFire: () => false,
    hit() {},
    readHud() {},
  });
  const pistol = scene.getTransformNodeByName(ARENA_PISTOL.id);
  const rifle = scene.getTransformNodeByName(ARENA_RIFLE.id);
  const drawn = new Set();
  for (const tool of [pistol, rifle])
    for (const mesh of tool.getChildMeshes())
      mesh.onBeforeDrawObservable.add(() => drawn.add(tool.name));
  const before = armory.snapshot();
  await prepareSceneLighting(scene, camera, (draw) =>
    firearms.prepareEquipment(draw, () => draw(true)),
  );
  assert.deepEqual(drawn, new Set([ARENA_PISTOL.id, ARENA_RIFLE.id]));
  assert.ok(pistol.isEnabled() && !rifle.isEnabled());
  assert.deepEqual(armory.snapshot(), before);
});
