import {
  MaterialPluginBase,
  type AbstractMesh,
  type Material,
  type MaterialDefines,
  type Scene,
} from '@babylonjs/core';

type LightingDefines = MaterialDefines & {
  LIGHTCOUNT: number;
  MAXLIGHTCOUNT: number;
  NONUNIFORMSCALING: boolean;
  [key: `LIGHT_FALLOFF_GLTF${number}`]: boolean;
};

// An inactive light slot has no shader code. Babylon 9.37 clears LIGHTn but retains
// its glTF attenuation define, creating different programs for the same visible lights.
export class LightingVariants extends MaterialPluginBase {
  constructor(material: Material) {
    super(material, 'ArchiveLightingVariants', 200, {}, true, true);
  }

  override isCompatible() {
    return true;
  }

  override prepareDefines(defines: LightingDefines, _scene: Scene, mesh: AbstractMesh) {
    if (mesh.metadata?.animatedScale) defines.NONUNIFORMSCALING = true;
    if (!defines._areLightsDirty) return;
    for (let i = defines.LIGHTCOUNT; i < defines.MAXLIGHTCOUNT; i++) {
      if (defines[`LIGHT_FALLOFF_GLTF${i}`]) defines[`LIGHT_FALLOFF_GLTF${i}`] = false;
    }
  }
}
