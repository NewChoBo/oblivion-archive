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
import { raidLeapHeight, type RaidAim } from '../../../game/raid/raid-match.ts';

export function createRaidAimGuide(scene: Scene) {
  const ink = new StandardMaterial('aim indicator ink', scene);
  ink.disableLighting = true;
  ink.backFaceCulling = false;
  ink.alpha = 0.86;
  const ready = Color3.FromHexString('#62f5cf');
  const neutral = Color3.FromHexString('#cfdefa');
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
  const points = Array.from({ length: 97 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 96;
    return new Vector3(Math.sin(angle), 0, Math.cos(angle));
  });
  const boundary = MeshBuilder.CreateLines('skill cast range', { points }, scene);
  boundary.color = Color3.FromHexString('#b9dafa');
  const fan = [-1, 1].map((sign) => {
    const edge = MeshBuilder.CreateLines(
      'scatter flight edge',
      { points: [Vector3.Zero(), new Vector3(0, 0, 1)] },
      scene,
    );
    edge.parent = arrow;
    edge.color = neutral;
    edge.isPickable = false;
    return { edge, sign };
  });
  const arc = MeshBuilder.CreateLines(
    'leap trajectory',
    {
      points: Array.from({ length: 25 }, (_, i) => new Vector3(0, raidLeapHeight(i / 24), i / 24)),
    },
    scene,
  );
  arc.isPickable = false;
  const parts = [boundary, footprint, arrow, arc];
  for (const part of [boundary, footprint, shaft, head, launch]) part.isPickable = false;
  for (const part of parts) part.setEnabled(false);
  return (aim: RaidAim | null) => {
    if (!aim) {
      for (const part of parts) part.setEnabled(false);
      return;
    }
    const { origin, point, range, radius, kind, status } = aim;
    ink.emissiveColor =
      kind === 'direction'
        ? neutral
        : status !== 'ready'
          ? invalid
          : aim.count === 0 && !aim.allies
            ? empty
            : ready;
    boundary.setEnabled(kind !== 'pulse');
    if (boundary.isEnabled()) {
      boundary.position.set(origin.x, 0.09, origin.z);
      boundary.scaling.set(range, 1, range);
    }
    footprint.setEnabled(
      !!point &&
        (kind === 'leap' ||
          kind === 'field' ||
          kind === 'pulse' ||
          (status === 'ready' && (kind === 'ward' || kind === 'target'))),
    );
    if (point && footprint.isEnabled()) {
      const extent = radius || 0.8;
      footprint.scaling.set(extent, 1, extent);
      footprint.position.set(point.x, 0.12, point.z);
    }
    arc.setEnabled(kind === 'leap' && !!point && status === 'ready');
    if (point && arc.isEnabled()) {
      arc.position.set(origin.x, 0.12, origin.z);
      arc.scaling.z = aim.distance ?? 0;
      arc.rotation.y = Math.atan2(point.x - origin.x, point.z - origin.z);
      arc.color = ready;
    }
    const length = range;
    arrow.setEnabled(kind === 'direction' && !!point && (aim.distance ?? 0) > 0.000001);
    for (const { edge, sign } of fan) {
      edge.setEnabled(!!aim.spread);
      edge.rotation.y = (aim.spread ?? 0) * sign;
      edge.scaling.z = range;
    }
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
