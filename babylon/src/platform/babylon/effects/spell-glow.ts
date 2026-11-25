import type { Color3, Material, Scene } from '@babylonjs/core';
import { Constants, Mesh, MeshBuilder, StandardMaterial, Texture } from '@babylonjs/core';

// A soft visible edge around a spell's bright core, drawn with the scene's depth test.
export function glowMaterial(scene: Scene, name: string, color: Color3) {
  const texture = new Texture(
    './assets/effects/spell-glow.png',
    scene,
    true,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.disableDepthWrite = true;
  material.backFaceCulling = false;
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.emissiveColor = color;
  material.alphaMode = Constants.ALPHA_ADD;
  return material;
}

export function glowPlane(scene: Scene, name: string, material: Material) {
  const mesh = MeshBuilder.CreatePlane(name, { size: 1 }, scene);
  mesh.material = material;
  mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
  mesh.isPickable = false;
  mesh.setEnabled(false);
  return mesh;
}
