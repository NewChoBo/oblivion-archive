import {
  Color3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import { RAID_FIELD_BOUNDS, type RaidAim } from '../../../game/raid/raid-match.ts';

export function createRaidAimGuide(scene: Scene) {
  const ink = new StandardMaterial('aim indicator ink', scene);
  ink.disableLighting = true;
  ink.backFaceCulling = false;
  ink.alpha = 0.86;
  const ready = Color3.FromHexString('#62f5cf');
  const empty = Color3.FromHexString('#ffe099');
  const invalid = Color3.FromHexString('#ff727b');
  const footprint = MeshBuilder.CreateTorus(
    'skill footprint',
    { diameter: 2, thickness: 0.065, tessellation: 64 },
    scene,
  );
  footprint.material = ink;
  const arrow = new TransformNode('skill flight direction', scene);
  const shaft = MeshBuilder.CreateGround('skill flight path', { width: 0.18, height: 1 }, scene);
  shaft.parent = arrow;
  shaft.material = ink;
  const head = new Mesh('skill impact direction', scene);
  const data = new VertexData();
  data.positions = [-0.43, 0, 0, 0.43, 0, 0, 0, 0, 1];
  data.indices = [0, 2, 1];
  data.applyToMesh(head);
  head.parent = arrow;
  head.material = ink;
  // The near arrowhead stays visible when the target's model covers the tip.
  const launch = head.createInstance('skill launch direction');
  launch.parent = arrow;
  const directions = Array.from({ length: 97 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 96;
    return { x: Math.sin(angle), z: Math.cos(angle) };
  });
  const points = directions.map(() => Vector3.Zero());
  const boundary = MeshBuilder.CreateLines('skill cast range', { points, updatable: true }, scene);
  boundary.color = Color3.FromHexString('#b9dafa');
  const parts = [boundary, footprint, arrow];
  for (const part of [boundary, footprint, shaft, head, launch]) part.isPickable = false;
  for (const part of parts) part.setEnabled(false);
  return (aim: RaidAim | null) => {
    if (!aim) {
      for (const part of parts) part.setEnabled(false);
      return;
    }
    const { origin, point, range, radius, kind, status } = aim;
    ink.emissiveColor =
      status !== 'ready' ? invalid : aim.count === 0 && !aim.allies ? empty : ready;
    boundary.setEnabled(kind !== 'pulse');
    if (boundary.isEnabled()) {
      // Field centres must fit both the cast radius and the playable stretch of road.
      const { left, right, back, front } = RAID_FIELD_BOUNDS;
      for (const [i, d] of directions.entries()) {
        let reach = range;
        if (kind === 'field') {
          if (d.x !== 0) reach = Math.min(reach, ((d.x > 0 ? right : left) - origin.x) / d.x);
          if (d.z !== 0) reach = Math.min(reach, ((d.z > 0 ? front : back) - origin.z) / d.z);
        }
        points[i]!.set(origin.x + d.x * reach, 0.09, origin.z + d.z * reach);
      }
      MeshBuilder.CreateLines('skill cast range', { points, instance: boundary }, scene);
    }
    footprint.setEnabled(
      !!point &&
        (kind === 'field' ||
          kind === 'pulse' ||
          (status === 'ready' && (kind === 'ward' || radius > 0))),
    );
    if (point && footprint.isEnabled()) {
      const extent = kind === 'ward' ? 0.8 : radius;
      footprint.scaling.set(extent, 1, extent);
      footprint.position.set(point.x, 0.12, point.z);
    }
    const length = Math.min(aim.distance ?? 0, range);
    arrow.setEnabled(kind === 'shot' && !!point && length > 0.05);
    if (point && arrow.isEnabled()) {
      const shoulder = length - Math.min(0.95, length * 0.5);
      shaft.position.z = shoulder / 2;
      shaft.scaling.z = shoulder;
      head.position.z = shoulder;
      head.scaling.z = length - shoulder;
      launch.setEnabled(length > 2);
      launch.scaling.set(0.85, 1, 0.65);
      launch.position.z = Math.min(1.4, shoulder / 2);
      arrow.position.set(origin.x, 0.15, origin.z);
      arrow.rotation.y = Math.atan2(point.x - origin.x, point.z - origin.z);
    }
  };
}
