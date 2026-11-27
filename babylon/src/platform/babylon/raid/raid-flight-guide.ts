import {
  Mesh,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import type { RaidAim } from '../../../game/raid/raid-view.ts';

const straight = [0];

export function createRaidFlightGuide(scene: Scene, ink: StandardMaterial) {
  const root = new TransformNode('skill flight direction', scene);
  const lanes: TransformNode[] = [];
  function addLane() {
    const lane = new TransformNode('skill flight lane', scene);
    lane.parent = root;
    const mesh = new Mesh('skill flight arrow', scene);
    mesh.parent = lane;
    mesh.material = ink;
    mesh.isPickable = false;
    // Unit-length silhouette with a broad head, legible even on a landscape phone.
    const shape = new VertexData();
    shape.positions = [
      -0.22, 0, 0, 0.22, 0, 0, -0.22, 0, 0.83, 0.22, 0, 0.83, -0.64, 0, 0.83, 0.64, 0, 0.83, 0, 0,
      1,
    ];
    shape.indices = [0, 2, 1, 1, 2, 3, 4, 6, 5];
    shape.applyToMesh(mesh);
    lanes.push(lane);
    return lane;
  }

  const wash = ink.clone('skill volley wash')!;
  wash.alpha = 0.3;
  wash.disableDepthWrite = true;
  let sector: Mesh | undefined;
  let lastAngles: readonly number[] | undefined;
  function showSector(angles: readonly number[]) {
    if (angles !== lastAngles) {
      sector?.dispose(false);
      const start = Math.min(...angles),
        end = Math.max(...angles);
      const rim = Array.from({ length: 33 }, (_, i) => {
        const a = start + ((end - start) * i) / 32;
        return new Vector3(Math.sin(a), 0, Math.cos(a));
      });
      sector = new Mesh('skill volley sector', scene);
      const shape = new VertexData();
      shape.positions = [0, 0, 0, ...rim.flatMap((p) => p.asArray())];
      shape.indices = rim.slice(1).flatMap((_, i) => [0, i + 1, i + 2]);
      shape.applyToMesh(sector);
      sector.parent = root;
      sector.material = wash;
      sector.isPickable = false;
      const edge = MeshBuilder.CreateLines(
        'skill volley rim',
        { points: [Vector3.Zero(), ...rim, Vector3.Zero()] },
        scene,
      );
      edge.color = ink.emissiveColor;
      edge.parent = sector;
      edge.isPickable = false;
      lastAngles = angles;
    }
    sector!.setEnabled(true);
    return sector!;
  }

  root.setEnabled(false);
  return (aim: RaidAim | null) => {
    const point = aim?.point;
    if (aim?.kind !== 'direction' || !point || (aim.distance ?? 0) < 0.000001) {
      root.setEnabled(false);
      return;
    }
    root.setEnabled(true);
    root.position.set(aim.origin.x, 0.15, aim.origin.z);
    root.rotation.y = Math.atan2(point.x - aim.origin.x, point.z - aim.origin.z);
    const angles = aim.flight?.angles ?? straight;
    const filled = aim.flight?.guide === 'sector';
    const count = filled ? 0 : angles.length;
    for (let i = 0; i < Math.max(count, lanes.length); i++) {
      const lane = lanes[i] ?? addLane();
      lane.setEnabled(i < count);
      if (i < count) {
        lane.rotation.y = angles[i]!;
        lane.scaling.z = aim.range;
      }
    }
    if (filled) {
      wash.emissiveColor = ink.emissiveColor;
      showSector(angles).scaling.set(aim.range, 1, aim.range);
    } else sector?.setEnabled(false);
  };
}
