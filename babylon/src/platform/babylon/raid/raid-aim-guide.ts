import { Color3, MeshBuilder, StandardMaterial, Vector3, type Scene } from '@babylonjs/core';
import { raidLeapHeight, type RaidAim } from '../../../game/raid/raid-match.ts';

import { createRaidFlightGuide } from './raid-flight-guide.ts';

export function createRaidAimGuide(scene: Scene) {
  const ink = new StandardMaterial('aim indicator ink', scene);
  ink.disableLighting = true;
  ink.backFaceCulling = false;
  ink.alpha = 0.86;
  const ready = Color3.FromHexString('#62f5cf');
  const neutral = Color3.FromHexString('#82e6ed');
  const empty = Color3.FromHexString('#ffe099');
  const invalid = Color3.FromHexString('#ff727b');
  const footprint = MeshBuilder.CreateTorus(
    'skill footprint',
    { diameter: 2, thickness: 0.065, tessellation: 64 },
    scene,
  );
  footprint.material = ink;
  const drawFlight = createRaidFlightGuide(scene, ink);
  const fill = ink.clone('skill area wash')!;
  fill.alpha = 0.18;
  fill.disableDepthWrite = true;
  const disc = MeshBuilder.CreateDisc('skill ground area', { radius: 1, tessellation: 64 }, scene);
  disc.material = fill;
  disc.rotation.x = Math.PI / 2;
  disc.isPickable = false;
  const points = Array.from({ length: 97 }, (_, i) => {
    const angle = (2 * Math.PI * i) / 96;
    return new Vector3(Math.sin(angle), 0, Math.cos(angle));
  });
  const boundary = MeshBuilder.CreateLines('skill cast range', { points }, scene);
  boundary.color = Color3.FromHexString('#b9dafa');
  const arc = MeshBuilder.CreateLines(
    'leap trajectory',
    {
      points: Array.from({ length: 25 }, (_, i) => new Vector3(0, raidLeapHeight(i / 24), i / 24)),
    },
    scene,
  );
  arc.isPickable = false;
  const parts = [boundary, footprint, disc, arc];
  for (const part of [boundary, footprint]) part.isPickable = false;
  for (const part of parts) part.setEnabled(false);
  return (aim: RaidAim | null) => {
    if (!aim) {
      drawFlight(null);
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
    drawFlight(aim);
    boundary.setEnabled(kind !== 'pulse' && aim.flight?.guide !== 'sector');
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
    disc.setEnabled(kind === 'field' && !!point && radius > 0);
    if (point && disc.isEnabled()) {
      fill.emissiveColor = ink.emissiveColor;
      disc.position.set(point.x, 0.085, point.z);
      disc.scaling.set(radius, radius, 1);
    }
    arc.setEnabled(kind === 'leap' && !!point && status === 'ready');
    if (point && arc.isEnabled()) {
      arc.position.set(origin.x, 0.12, origin.z);
      arc.scaling.z = aim.distance ?? 0;
      arc.rotation.y = Math.atan2(point.x - origin.x, point.z - origin.z);
      arc.color = ready;
    }
  };
}
