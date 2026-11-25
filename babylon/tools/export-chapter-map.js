// Run from the Vite game at its start menu or while paused to export in metres.
import { EngineStore } from '@babylonjs/core';
import { GLTF2Export } from '@babylonjs/serializers/glTF/2.0/glTFSerializer.js';
import '@babylonjs/serializers/glTF/2.0/Extensions/KHR_materials_unlit.js';

export async function exportChapterMap() {
  const scene = EngineStore.LastCreatedScene;
  const state = window.__ROOM_DEMO__?.snapshot();
  if (!scene || !state?.ready || (state.started && !state.paused))
    throw Error('Open the start menu or pause the chapter before exporting.');
  const nodes = new Set();
  for (const mesh of scene.meshes) {
    if (
      !mesh.isEnabled() ||
      !mesh.isVisible ||
      !mesh.getTotalVertices() ||
      mesh.metadata?.playerVisual ||
      mesh.metadata?.toolVisual ||
      mesh.metadata?.spellEffect ||
      mesh.metadata?.exteriorView ||
      mesh.metadata?.lorePickup
    )
      continue;
    for (let node = mesh; node; node = node.parent) nodes.add(node);
  }
  const result = await GLTF2Export.GLBAsync(scene, 'chapter-map', {
    shouldExportNode: (node) => nodes.has(node),
    shouldExportAnimation: () => false,
  });
  return result.glTFFiles['chapter-map.glb'];
}
