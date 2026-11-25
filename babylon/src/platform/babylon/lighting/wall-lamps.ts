import {
  Color3,
  PointLight,
  RenderTargetTexture,
  ShadowGenerator,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import { createWallFireArt, type FixtureKind, type FixtureMaterial } from './wall-fire-art.ts';
import { lightReachesBounds } from './light-surfaces.ts';

interface LampPlacement {
  name: string;
  zone: string;
  position: readonly [number, number, number];
  inward?: number;
  yaw?: number;
  color: string;
  intensity: number;
  range: number;
  kind?: FixtureKind;
}

interface Lamp {
  light: PointLight;
  zone: string;
  body: Mesh;
  flame: Mesh;
  scale: number;
  phase: number;
}

export function createWallLamps(scene: Scene, { material }: { material: FixtureMaterial }) {
  const makeFixture = createWallFireArt(scene, material);
  const lamps: Lamp[] = [];
  let nextFlicker = 0;

  function place({
    name,
    zone,
    position,
    inward = 0,
    yaw = 0,
    color,
    intensity,
    range,
    kind = 'lantern',
  }: LampPlacement) {
    const root = new TransformNode(`${name} mount`, scene);
    root.position.set(...position);
    root.rotation.y = yaw + (inward < 0 ? Math.PI : 0);
    const { body, flame, scale, emitter } = makeFixture(name, kind, root);
    body.metadata = { lightingZone: zone };
    const light = new PointLight(
      `${name} light`,
      Vector3.TransformCoordinates(emitter, root.computeWorldMatrix(true)),
      scene,
    );
    light.diffuse = Color3.FromHexString(color).toLinearSpace();
    light.specular = light.diffuse.scale(0.4);
    light.intensity = intensity;
    light.range = range;
    light.renderPriority = 14;
    light.shadowMinZ = 0.07;
    light.shadowMaxZ = range;
    light.includedOnlyMeshes = [body];
    lamps.push({ light, zone, body, flame, scale, phase: lamps.length * 2.399 });
    return light;
  }

  function assignSurfaces(movingMeshes: ReadonlySet<AbstractMesh> = new Set()) {
    const assignments = lamps.map((lamp) => ({
      lamp,
      included: new Set<AbstractMesh>([lamp.body]),
      casters: new Array<AbstractMesh>(),
    }));
    const scoped = new Set<AbstractMesh>();
    for (const mesh of scene.meshes) {
      const zone = mesh.metadata?.lightingZone;
      if (
        !zone ||
        !mesh.isVisible ||
        !mesh.isEnabled() ||
        !mesh.getTotalVertices() ||
        (mesh.material && 'disableLighting' in mesh.material && mesh.material.disableLighting)
      )
        continue;
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      const casts =
        mesh.metadata.castShadow !== false &&
        !movingMeshes.has(mesh) &&
        mesh.material &&
        !mesh.material.needAlphaBlendingForMesh(mesh);
      for (const { lamp, included, casters } of assignments) {
        if (lamp.zone !== zone) continue;
        if (!lightReachesBounds(lamp.light, bounds)) continue;
        if (casts && mesh !== lamp.body) casters.push(mesh);
        // Neighbouring tiles need the same light where they meet inside its range.
        included.add(mesh);
        scoped.add(mesh);
      }
    }
    for (const { lamp, included, casters: renderList } of assignments) {
      const { light } = lamp;
      light.includedOnlyMeshes = [...included];
      let generator = light.getShadowGenerator();
      if (!renderList.length) {
        generator?.dispose();
        continue;
      }
      if (!generator) {
        const shadows = new ShadowGenerator(128, light);
        generator = shadows;
        shadows.useCloseExponentialShadowMap = true;
        shadows.depthScale = 30;
        shadows.bias = 0.003;
        shadows.normalBias = 0.018;
        shadows.setDarkness(0.18);
      }
      // Fixed emitters and geometry let the cube map be reused while walking.
      const map = generator.getShadowMap();
      if (!map) continue;
      map.renderList = renderList;
      map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    }

    // Babylon caps lights after reading each mesh's cached order.
    scene.sortLightsByPriority();
    const order = new Map(scene.lights.map((light, index) => [light, index]));
    for (const mesh of scoped) mesh.lightSources.sort((a, b) => order.get(a)! - order.get(b)!);
  }

  function update(now: number, observer: Vector3) {
    if (now < nextFlicker) return;
    nextFlicker = now + 42;
    const time = now / 1000;
    for (const { light, flame, scale, phase } of lamps) {
      if (Vector3.DistanceSquared(observer, light.position) > 8 ** 2) continue;
      const sway = Math.sin(time * 6.3 + phase);
      flame.scaling.y = scale * (1 + 0.1 * sway + 0.05 * Math.sin(time * 17.1 + phase));
      flame.rotation.z = 0.1 * sway;
    }
  }

  return { place, assignSurfaces, update };
}
