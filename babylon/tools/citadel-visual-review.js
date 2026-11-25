// Inspection cameras for reproducible close-ups; these do not move the player
// or advance chapter progression. Gameplay acceptance uses real Orca inputs.
import { EngineStore, FreeCamera, Vector3 } from '@babylonjs/core';
let original,
  review,
  hidden = [];
export function lighting() {
  const scene = EngineStore.LastCreatedScene;
  return scene.meshes
    .filter((m) => m.isVisible && m.material?.maxSimultaneousLights > 8)
    .map((m) => ({
      name: m.name,
      material: m.material.name,
      slots: m.material.maxSimultaneousLights,
      lights: scene.lights.filter((l) => l.canAffectMesh(m)).map((l) => l.name),
    }))
    .slice(0, 14);
}
export function inspect(position, target) {
  const scene = EngineStore.LastCreatedScene;
  if (!review) {
    original = scene.activeCamera;
    review = new FreeCamera('Citadel inspection camera', Vector3.Zero(), scene);
    review.inputs.clear();
    review.minZ = 0.025;
    review.maxZ = 180;
    review.fov = 1.05;
    hidden = scene.meshes
      .filter((m) => m.metadata?.playerVisual || m.metadata?.toolVisual || m.metadata?.spellEffect)
      .map((m) => [m, m.isVisible]);
    for (const [m] of hidden) m.isVisible = false;
  }
  review.position.copyFromFloats(...position);
  review.setTarget(Vector3.FromArray(target));
  scene.activeCamera = review;
  scene.render();
  return { inspection: true, position, target };
}
export function finish() {
  const scene = EngineStore.LastCreatedScene;
  if (review) {
    scene.activeCamera = original;
    review.dispose();
    review = null;
    for (const [m, visible] of hidden) m.isVisible = visible;
    scene.render();
  }
}
