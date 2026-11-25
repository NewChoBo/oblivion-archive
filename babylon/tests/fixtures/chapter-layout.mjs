import { MeshBuilder, NullEngine, PBRMaterial, Scene } from '@babylonjs/core';
import { createEnvironment } from '../../src/platform/babylon/chapter/chapter-scenery.ts';
import { buildCitadel } from '../../src/platform/babylon/citadel/floating-citadel.ts';
import { chapterLevel as level } from '../../src/content/citadel-layout.ts';
import catalog from '../../../shared/levels/environment-prefabs.json' with { type: 'json' };

export function buildLayout(t, withCitadel = false, recordPart) {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const scene = new Scene(engine);
  const collisionBoxes = [];
  const materials = Object.fromEntries(
    Object.keys(catalog.materials).map((id) => [id, new PBRMaterial(id, scene)]),
  );
  const environment = createEnvironment(scene, level, {
    materials,
    collisionBoxes,
    trackPlacements: true,
    box(name, [x, y, z], [width, height, depth], material, collision) {
      const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
      mesh.position.set(x, y, z);
      mesh.material = material;
      mesh.checkCollisions = Boolean(collision);
      if (collision) collisionBoxes.push(mesh);
      return mesh;
    },
  });
  for (const zone of Object.keys(level.zones)) environment.placeZone(zone);
  const citadel =
    withCitadel &&
    buildCitadel(scene, {
      material: (name) => new PBRMaterial(name, scene),
      colliders: collisionBoxes,
      entranceFrame: level.doorFrames['south-entrance'],
      recordPart,
    });
  for (const mesh of collisionBoxes) mesh.computeWorldMatrix(true);
  scene.collisionsEnabled = true;
  return { scene, collisionBoxes, environment, citadel };
}
