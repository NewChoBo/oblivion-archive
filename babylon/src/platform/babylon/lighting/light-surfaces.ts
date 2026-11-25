import type {
  AbstractMesh,
  BoundingBox,
  Light,
  Material,
  PBRMaterial,
  ShadowLight,
} from '@babylonjs/core';

type LightBounds = Pick<BoundingBox, 'minimumWorld' | 'maximumWorld'>;
type LocalLight = Pick<ShadowLight, 'position' | 'range'>;
type SurfaceMaterial = Material &
  Partial<Pick<PBRMaterial, 'maxSimultaneousLights' | 'disableLighting' | 'unlit'>>;

export function lightReachesBounds(
  { position, range }: LocalLight,
  { minimumWorld: min, maximumWorld: max }: LightBounds,
) {
  const dx = Math.max(min.x - position.x, 0, position.x - max.x);
  const dy = Math.max(min.y - position.y, 0, position.y - max.y);
  const dz = Math.max(min.z - position.z, 0, position.z - max.z);
  return dx * dx + dy * dy + dz * dz < range * range;
}

export function scopeFixedLights(
  lights: readonly (Light & LocalLight)[],
  meshes: readonly AbstractMesh[],
  fallback: AbstractMesh,
) {
  const moving = [];
  const surfaces = [];
  for (const mesh of meshes) {
    if (!mesh.isVisible || !mesh.getTotalVertices()) continue;
    const { playerVisual, toolVisual, inkThreat, spellEffect } = mesh.metadata ?? {};
    if (playerVisual || toolVisual || inkThreat || spellEffect) {
      moving.push(mesh);
      continue;
    }
    mesh.computeWorldMatrix(true);
    surfaces.push({ mesh, bounds: mesh.getBoundingInfo().boundingBox });
  }
  // Babylon counts a light slot even when the entire object is outside its range.
  for (const light of lights) {
    if (light.includedOnlyMeshes.length) continue;
    const included = [fallback, ...moving];
    const zone = light.metadata?.lightingZone;
    for (const { mesh, bounds } of surfaces) {
      if (zone && mesh.metadata?.lightingZone !== zone) continue;
      if (lightReachesBounds(light, bounds)) included.push(mesh);
    }
    light.includedOnlyMeshes = included;
  }
}

type LitMesh = AbstractMesh & { material: SurfaceMaterial & { maxSimultaneousLights: number } };

function receivesSceneLighting(mesh: AbstractMesh): mesh is LitMesh {
  const material: SurfaceMaterial | null = mesh.material;
  return (
    mesh.isVisible &&
    mesh.getTotalVertices() > 0 &&
    material?.maxSimultaneousLights !== undefined &&
    !material.disableLighting &&
    !material.unlit
  );
}

export function canReceiveEffectLight(mesh: AbstractMesh): boolean {
  return receivesSceneLighting(mesh) && !mesh.metadata?.toolVisual && !mesh.metadata?.spellEffect;
}

export function reserveWorldLightSlots(lights: readonly Light[], meshes: readonly AbstractMesh[]) {
  const fixedLights = lights.filter(
    (light) => !light.metadata?.carriedTorch && !light.metadata?.effectLight,
  );
  const effectLights = lights.filter((light) => light.metadata?.effectLight).length;
  for (const mesh of meshes) {
    const effectSlots = effectLights && canReceiveEffectLight(mesh) ? effectLights : 0;
    if (!receivesSceneLighting(mesh) || (!mesh.metadata?.lightingZone && !effectSlots)) continue;
    const material = mesh.material;

    // Include assigned lights that can switch on later, such as the arch seal.
    const fixedCount = fixedLights.filter((light) => light.canAffectMesh(mesh)).length;
    const slots = fixedCount + 1 + effectSlots;
    if (slots > material.maxSimultaneousLights) material.maxSimultaneousLights = slots;
  }
}
