import {
  Color3,
  RenderTargetTexture,
  ShadowGenerator,
  SpotLight,
  Vector3,
  type AbstractMesh,
  type BoundingBox,
  type Scene,
} from '@babylonjs/core';
import { lightReachesBounds } from './light-surfaces.ts';

type Interval = readonly [number, number];

interface OpeningWall {
  bounds: readonly [Interval, Interval, Interval];
  openingAxis: 'x' | 'z';
  openings: readonly [
    { span: Interval; height: Interval },
    ...{ span: Interval; height: Interval }[],
  ];
  exteriorLight: {
    name: string;
    sourceOffset: readonly [number, number, number];
    angle: number;
    color: string;
    intensity: number;
    range: number;
  };
}

// A broad light beyond the wall projects through the physical opening.
export function createOpeningLight(
  scene: Scene,
  { bounds, openingAxis, openings: [opening], exteriorLight }: OpeningWall,
) {
  const { name, sourceOffset, angle, color, intensity, range } = exteriorLight;
  const midpoint = ([min, max]: Interval) => (min + max) / 2;
  const center =
    openingAxis === 'z'
      ? new Vector3(midpoint(bounds[0]), midpoint(opening.height), midpoint(opening.span))
      : new Vector3(midpoint(opening.span), midpoint(opening.height), midpoint(bounds[2]));
  const position = center.add(Vector3.FromArray(sourceOffset));
  const direction = center.subtract(position).normalize();
  const light = new SpotLight(name, position, direction, angle, 1, scene);
  light.innerAngle = angle * 0.78;
  light.intensity = intensity;
  light.range = range;
  light.diffuse = Color3.FromHexString(color).toLinearSpace();
  light.specular = light.diffuse.scale(0.25);
  light.renderPriority = 16;
  light.shadowMinZ = 0.12;
  light.shadowMaxZ = range;

  const shadows = new ShadowGenerator(1024, light);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0007;
  shadows.normalBias = 0.014;
  shadows.setDarkness(0.018);

  const horizontal = openingAxis === 'x' ? 'x' : 'z';
  const depth = openingAxis === 'x' ? 'z' : 'x';
  const inward = position[depth] < center[depth] ? 1 : -1;
  const innerFace = bounds[depth === 'x' ? 0 : 2][inward > 0 ? 1 : 0];
  const [left, right] = opening.span;
  const [bottom, top] = opening.height;
  const innerCenter = center.clone();
  innerCenter[depth] = innerFace;
  const throughOpening = innerCenter.subtract(position);
  const corners: Interval[] = [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
  ];
  const rays = corners.map(([span, y]) => {
    const corner = innerCenter.clone();
    corner[horizontal] = span;
    corner.y = y;
    return corner.subtract(position);
  });
  const aperturePlanes = rays.map((ray, index) => {
    const normal = Vector3.Cross(ray, rays[(index + 1) % rays.length]!).normalize();
    return Vector3.Dot(normal, throughOpening) < 0 ? normal.negateInPlace() : normal;
  });

  function receivesThroughOpening(bounds: BoundingBox) {
    const inside =
      inward > 0
        ? bounds.minimumWorld[depth] >= innerFace - 1e-5
        : bounds.maximumWorld[depth] <= innerFace + 1e-5;
    if (!inside) return true;
    const centerFromLight = bounds.centerWorld.subtract(position);
    const size = bounds.extendSizeWorld;
    // Cull only boxes fully outside a plane, with room for the filtered edge.
    return aperturePlanes.every(
      (normal) =>
        Vector3.Dot(normal, centerFromLight) +
          Math.abs(normal.x) * size.x +
          Math.abs(normal.y) * size.y +
          Math.abs(normal.z) * size.z >=
        -0.06,
    );
  }

  const tangent = Math.tan(angle / 2);
  function reaches(bounds: BoundingBox) {
    if (!lightReachesBounds(light, bounds)) return false;
    // The sphere around the AABB keeps surfaces that only clip the cone edge.
    const offset = bounds.centerWorld.subtract(position);
    const depth = Vector3.Dot(offset, direction);
    const radius = bounds.extendSizeWorld.length();
    const sideways = Math.sqrt(Math.max(0, offset.lengthSquared() - depth * depth));
    return depth + radius >= 0 && sideways <= (depth + radius) * tangent + radius;
  }

  function assignSurfaces(
    meshes: readonly AbstractMesh[],
    architecture: ReadonlySet<AbstractMesh>,
    moving: ReadonlySet<AbstractMesh>,
    fallback: AbstractMesh,
  ) {
    const receivers = [fallback];
    const casters = [];
    for (const mesh of meshes) {
      if (
        !mesh.isEnabled() ||
        !mesh.isVisible ||
        !mesh.getTotalVertices() ||
        !mesh.material ||
        ('unlit' in mesh.material && mesh.material.unlit)
      )
        continue;
      const { lightingZone, castShadow } = mesh.metadata ?? {};
      if (lightingZone !== 'readingRoom' && !architecture.has(mesh)) continue;
      mesh.computeWorldMatrix(true);
      if (!reaches(mesh.getBoundingInfo().boundingBox)) continue;
      if (
        lightingZone === 'readingRoom' &&
        receivesThroughOpening(mesh.getBoundingInfo().boundingBox)
      )
        receivers.push(mesh);
      if (
        (architecture.has(mesh) || castShadow !== false) &&
        !moving.has(mesh) &&
        !mesh.material.needAlphaBlendingForMesh(mesh)
      )
        casters.push(mesh);
    }
    light.includedOnlyMeshes = receivers;
    const map = shadows.getShadowMap();
    if (!map) return;
    map.renderList = casters;
    map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  }

  return { light, assignSurfaces };
}
