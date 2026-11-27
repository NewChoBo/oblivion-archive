import {
  Color3,
  Mesh,
  StandardMaterial,
  TransformNode,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import type { RaidPoint } from '../../../game/raid/raid-view.ts';

// Tapered low double cuts followed by one broader, pale finishing sweep.
export function createShadowBlades(scene: Scene) {
  const root = new TransformNode('shadow blades', scene);
  function arc(start: number, duration: number, tilt: number, radius: number, color: string) {
    const mesh = new Mesh('shadow blade sweep', scene);
    const ink = new StandardMaterial('shadow blade ink', scene);
    ink.disableLighting = true;
    ink.backFaceCulling = false;
    ink.disableDepthWrite = true;
    ink.emissiveColor = Color3.FromHexString(color);
    const vertices = new VertexData();
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24,
        angle = (t - 0.5) * 1.55 * Math.PI;
      const width = 0.32 * Math.sin(Math.PI * t);
      for (const r of [radius - width, radius])
        positions.push(r * Math.sin(angle), 0, r * Math.cos(angle));
      if (i) {
        const a = i * 2;
        indices.push(a - 2, a - 1, a, a, a - 1, a + 1);
      }
    }
    vertices.positions = positions;
    vertices.indices = indices;
    vertices.applyToMesh(mesh);
    mesh.parent = root;
    mesh.material = ink;
    mesh.isPickable = false;
    mesh.rotation.z = tilt;
    return { mesh, ink, start, duration, tilt };
  }
  const arcs = [
    arc(0, 11, -0.3, 1.35, '#542b74'),
    arc(4, 12, 0.38, 1.5, '#ad78cd'),
    arc(9, 12, -0.24, 1.65, '#542b74'),
    arc(15, 13, 0.26, 1.8, '#fff3ff'),
  ];
  return {
    hide: () => root.setEnabled(false),
    draw(point: RaidPoint, heading: number, age: number) {
      root.setEnabled(true);
      root.position.set(point.x, 0.74, point.z);
      root.rotation.y = heading;
      for (const { mesh, ink, start, duration, tilt } of arcs) {
        const t = (age - start) / duration;
        mesh.setEnabled(t >= 0 && t < 1);
        if (!mesh.isEnabled()) continue;
        mesh.rotation.y = Math.sign(tilt) * (t - 0.5) * Math.PI * 1.3;
        mesh.scaling.setAll(0.82 + t * 0.24);
        ink.alpha = Math.min(1, 0.25 + 5 * t, (1 - t) * 3);
      }
    },
  };
}
