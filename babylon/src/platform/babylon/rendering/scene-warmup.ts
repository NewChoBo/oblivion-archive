import type { Camera, Scene } from '@babylonjs/core';
import { lightReachesBounds } from '../lighting/light-surfaces.ts';

function waitForScene(scene: Scene) {
  // PushMaterial caches readiness by render ID, even if the light set has changed.
  scene.incrementRenderId();
  scene.resetCachedMaterial();
  return new Promise<void>((resolve, reject) => {
    const timeout = scene.onReadyTimeoutObservable.addOnce(() =>
      reject(new Error('Scene readiness timed out')),
    );
    scene.executeWhenReady(() => {
      scene.onReadyTimeoutObservable.remove(timeout);
      resolve();
    }, true);
  });
}

export async function prepareSceneLighting(
  scene: Scene,
  camera: Camera,
  prepareStates: (draw: (entryView?: boolean) => Promise<void>) => Promise<void>,
) {
  const engine = scene.getEngine();
  const previousPass = engine.currentRenderPassId;
  const previousCandidates = scene.getActiveMeshCandidates;
  const previousFrustum = scene.skipFrustumClipping;
  const materials = scene.materials.filter((material) => material.allowShaderHotSwapping);
  try {
    for (const material of materials) material.allowShaderHotSwapping = false;
    engine.currentRenderPassId = camera.renderPassId;
    const entryArea = { position: camera.position, range: 7 };
    const data = scene.meshes.filter((mesh) => {
      if (mesh.metadata?.toolVisual) return true;
      mesh.computeWorldMatrix();
      return lightReachesBounds(entryArea, mesh.getBoundingInfo().boundingBox);
    });
    const candidates = { data, length: data.length };
    const nearCandidates = () => candidates;
    await prepareStates(async (entryView = false) => {
      await waitForScene(scene);
      // WebGL creates vertex arrays on the first draw, even for ready materials.
      // Draw the mounted tools and nearby receivers once in their actual pass.
      if (!engine.isWebGPU && !entryView) return;
      scene.getActiveMeshCandidates =
        engine.isWebGPU && entryView ? previousCandidates : nearCandidates;
      // The first pointer turn can expose different surfaces at the same position.
      scene.skipFrustumClipping = entryView || previousFrustum;
      engine.beginFrame();
      try {
        scene.render();
      } finally {
        engine.endFrame();
        scene.skipFrustumClipping = previousFrustum;
        engine.currentRenderPassId = camera.renderPassId;
      }
    });
  } finally {
    scene.skipFrustumClipping = previousFrustum;
    scene.getActiveMeshCandidates = previousCandidates;
    engine.currentRenderPassId = previousPass;
    for (const material of materials) material.allowShaderHotSwapping = true;
  }
}
