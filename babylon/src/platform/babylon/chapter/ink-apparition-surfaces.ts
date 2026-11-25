import type { ISceneLoaderAsyncResult } from '@babylonjs/core';

export function bindInkApparitionSurfaces(model: ISceneLoaderAsyncResult) {
  const head = [...model.transformNodes, ...model.meshes].find((node) => node.name === 'InkMask');
  if (!head) throw Error('Ink apparition is missing its mask');
  const surfaces = model.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  // The mask animates independently and shares an ink material with the arms and torso.
  // glTF may put its material primitives on separate meshes beneath the mask node.
  for (const mesh of surfaces) {
    mesh.metadata = {
      ...mesh.metadata,
      inkThreat: true,
      castShadow: false,
      hitRegion: mesh === head || mesh.isDescendantOf(head) ? 'head' : 'body',
    };
  }
  return { head, surfaces };
}
