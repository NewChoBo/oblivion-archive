import { Color3, StandardMaterial, type Scene } from '@babylonjs/core';

export const raidColors = {
  rildin: '#ffd575',
  kaiken: '#b9b4ff',
  swift: '#88edff',
  hammer: '#ffac51',
  abyss: '#b685ff',
  longshot: '#ffdf79',
  jade: '#6affc1',
  rend: '#ff7254',
  bastion: '#ffbf77',
  rime: '#8de8ff',
};

export function raidMaterial(scene: Scene, name: string, hex: string, glow = 0) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(hex);
  material.specularColor = material.diffuseColor.scale(0.22);
  material.emissiveColor = material.diffuseColor.scale(glow);
  return material;
}
