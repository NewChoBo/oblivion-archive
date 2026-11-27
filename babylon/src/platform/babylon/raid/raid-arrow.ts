import { Mesh, MeshBuilder, type Scene } from '@babylonjs/core';

/** The origin is the point of the arrowhead. The shaft extends back along +Y. */
export function createRaidArrow(scene: Scene) {
  const shaft = MeshBuilder.CreateCylinder(
    'arrow shaft',
    { height: 0.74, diameter: 0.044, tessellation: 5 },
    scene,
  );
  shaft.position.y = 0.49;
  const tip = MeshBuilder.CreateCylinder(
    'arrow point',
    { height: 0.18, diameterTop: 0.15, diameterBottom: 0, tessellation: 4 },
    scene,
  );
  tip.position.y = 0.09;
  const arrow = Mesh.MergeMeshes([shaft, tip], true)!;
  arrow.name = 'raid arrow source';
  arrow.isPickable = false;
  arrow.setEnabled(false);
  return arrow;
}
