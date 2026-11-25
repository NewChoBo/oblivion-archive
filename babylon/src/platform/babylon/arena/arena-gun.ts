import { Color3, MeshBuilder, StandardMaterial, TransformNode } from '@babylonjs/core';
import type { Material, Scene } from '@babylonjs/core';

type Triple = readonly [number, number, number];
// Player and sentry guns share materials within the scene that owns their GPU resources.
const finishes = new WeakMap<Scene, ReturnType<typeof createFinishes>>();

function createFinishes(scene: Scene) {
  const iron = new StandardMaterial('gun matte steel', scene);
  iron.diffuseColor = Color3.FromHexString('#454d55');
  iron.specularColor = Color3.FromHexString('#646871');
  const wood = new StandardMaterial('gun walnut', scene);
  wood.diffuseColor = Color3.FromHexString('#663d27');
  wood.specularColor = Color3.FromHexString('#563a29');
  const copper = new StandardMaterial('gun brass', scene);
  copper.diffuseColor = Color3.FromHexString('#c09757');
  return { iron, wood, copper };
}

export function createArenaGun(scene: Scene, name: string, rifle: boolean, renderingGroup = 0) {
  let materials = finishes.get(scene);
  if (!materials) {
    materials = createFinishes(scene);
    finishes.set(scene, materials);
  }
  const { iron, wood, copper } = materials;
  const root = new TransformNode(name, scene);
  function part(name: string, size: Triple, position: Triple, surface: Material) {
    const [width, height, depth] = size;
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.parent = root;
    mesh.position.set(...position);
    mesh.material = surface;
    mesh.isPickable = false;
    mesh.renderingGroupId = renderingGroup;
    mesh.metadata = { toolVisual: true };
    return mesh;
  }
  part('receiver', [0.064, 0.073, rifle ? 0.32 : 0.19], [0, 0.057, rifle ? 0.095 : 0.065], iron);
  part('wooden grip', [0.055, 0.095, 0.062], [0, 0.007, -0.004], wood).rotation.x = -0.28;
  part('trigger guard', [0.048, 0.021, 0.105], [0, 0.014, 0.055], iron);
  part('front sight', [0.02, 0.016, 0.027], [0, 0.1, rifle ? 0.36 : 0.154], copper);
  if (rifle) {
    part('buttstock', [0.065, 0.105, 0.24], [0, 0.031, -0.17], wood);
    part('foregrip', [0.072, 0.064, 0.2], [0, 0.053, 0.29], wood);
    part('magazine', [0.054, 0.14, 0.094], [0, -0.028, 0.14], iron).rotation.x = 0.2;
  }
  const muzzle = rifle ? 0.53 : 0.215;
  const barrel = MeshBuilder.CreateCylinder(
    'barrel',
    { height: rifle ? 0.29 : 0.1, diameter: rifle ? 0.026 : 0.031, tessellation: 10 },
    scene,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.062, muzzle - (rifle ? 0.145 : 0.05));
  barrel.parent = root;
  barrel.material = iron;
  barrel.isPickable = false;
  barrel.renderingGroupId = renderingGroup;
  barrel.metadata = { toolVisual: true };
  return { root, muzzle, meshes: root.getChildMeshes() };
}
