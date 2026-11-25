import type { AbstractMesh } from '@babylonjs/core';
import type { GroundRect } from '../../../game/ai/bot-navigation.ts';

/** Static walk blockers intersecting the bot's body above floor level. */
export function botObstacles(meshes: readonly AbstractMesh[], height = 1.65): GroundRect[] {
  return meshes.flatMap((mesh) => {
    if (!mesh.checkCollisions) return [];
    mesh.computeWorldMatrix(true);
    const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
    return max.y > 0.1 && min.y < height
      ? [{ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z }]
      : [];
  });
}
