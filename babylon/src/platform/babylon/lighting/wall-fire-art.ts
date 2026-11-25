import {
  Color3,
  Mesh,
  MeshBuilder,
  Quaternion,
  Vector3,
  VertexBuffer,
  type Scene,
  type PBRMaterial,
  type TransformNode,
} from '@babylonjs/core';

type Point3 = readonly [number, number, number];
export type FixtureKind = 'lantern' | 'torch' | 'candle';
export type FixtureMaterial = (name: string, color: string) => PBRMaterial;

const flameProfile: [number, number, string][] = [
  [0, 0.016, '#d64813'],
  [0.032, 0.047, '#f48b29'],
  [0.079, 0.037, '#ffe085'],
  [0.134, 0.024, '#ffbc4a'],
  [0.191, 0.011, '#ef7424'],
  [0.226, 0, '#d95016'],
];

export function createWallFireArt(scene: Scene, material: FixtureMaterial) {
  const surface = material('wall fixture surface', '#ffffff');
  surface.metallic = 0.28;
  const fire = material('wall flame tint', '#ffffff');
  fire.unlit = true;
  const templates = new Map<
    FixtureKind,
    { mesh: Mesh; socket: Vector3; scale: number; lightHeight: number }
  >();

  function paint(mesh: Mesh, color: string) {
    const { r, g, b } = Color3.FromHexString(color).toLinearSpace();
    const colors = new Float32Array(mesh.getTotalVertices() * 4);
    for (let i = 0; i < colors.length; i += 4) colors.set([r, g, b, 1], i);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    return mesh;
  }

  function cylinder(
    parts: Mesh[],
    position: Point3,
    height: number,
    bottom: number,
    top: number,
    color: string,
    tessellation = 8,
  ) {
    const mesh = MeshBuilder.CreateCylinder(
      'wall fixture part',
      { height, diameterBottom: bottom, diameterTop: top, tessellation },
      scene,
    );
    mesh.position.set(...position);
    parts.push(paint(mesh, color));
    return mesh;
  }

  function bar(parts: Mesh[], start: Point3, end: Point3, diameter: number, color: string) {
    const a = Vector3.FromArray(start),
      b = Vector3.FromArray(end);
    const axis = b.subtract(a);
    const mesh = cylinder(
      parts,
      Vector3.Center(a, b).asArray(),
      axis.length(),
      diameter,
      diameter,
      color,
      6,
    );
    mesh.rotationQuaternion = Quaternion.FromUnitVectorsToRef(
      Vector3.UpReadOnly,
      axis.normalize(),
      new Quaternion(),
    );
  }

  function lantern(parts: Mesh[]) {
    const plate = cylinder(parts, [0.005, 0.23, 0], 0.043, 0.21, 0.19, '#79583b');
    plate.rotation.z = -Math.PI / 2;
    bar(parts, [0.019, 0.235, 0], [0.25, 0.31, 0], 0.032, '#553f30');
    bar(parts, [0.25, 0.31, 0], [0.365, 0.297, 0], 0.032, '#7a5e40');
    bar(parts, [0.365, 0.3, 0], [0.365, 0.235, 0], 0.03, '#9b794a');
    cylinder(parts, [0.365, 0.185, 0], 0.109, 0.253, 0.1, '#705539', 6);
    cylinder(parts, [0.365, 0.137, 0], 0.033, 0.267, 0.267, '#ae8854', 6);
    cylinder(parts, [0.365, -0.163, 0], 0.047, 0.188, 0.25, '#89673f', 6);
    cylinder(parts, [0.365, -0.123, 0], 0.036, 0.098, 0.098, '#946943', 6);
    for (let i = 0; i < 6; i++) {
      const angle = ((i + 0.5) * Math.PI) / 3;
      const x = 0.365 + Math.cos(angle) * 0.105,
        z = Math.sin(angle) * 0.105;
      bar(parts, [x, -0.14, z], [x, 0.139, z], 0.012, '#6b5237');
    }
    return { socket: new Vector3(0.365, -0.103, 0), scale: 0.94, lightHeight: 0.08 };
  }

  function torch(parts: Mesh[]) {
    const plate = cylinder(parts, [0.005, -0.146, 0], 0.047, 0.2, 0.173, '#493d35');
    plate.rotation.z = -Math.PI / 2;
    bar(parts, [0.018, -0.19, 0.045], [0.151, -0.145, 0.045], 0.028, '#62534a');
    bar(parts, [0.018, -0.19, -0.045], [0.151, -0.145, -0.045], 0.028, '#62534a');
    const axis = new Vector3(0.18, 0.459, 0).normalize();
    const base = new Vector3(0.082, -0.386, 0);
    const rotation = Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, axis, new Quaternion());
    function shaft(distance: number, height: number, bottom: number, top: number, color: string) {
      const position = base.add(axis.scale(distance));
      cylinder(parts, position.asArray(), height, bottom, top, color).rotationQuaternion = rotation;
    }
    shaft(0.214, 0.428, 0.046, 0.067, '#754a2c');
    shaft(0.413, 0.192, 0.081, 0.126, '#342720');
    shaft(0.271, 0.047, 0.089, 0.089, '#7a6450');
    shaft(0.372, 0.021, 0.107, 0.107, '#694837');
    shaft(0.458, 0.024, 0.123, 0.123, '#90704d');
    shaft(0.501, 0.025, 0.124, 0.092, '#3d2c22');
    return { socket: base.add(axis.scale(0.502)), scale: 1.15, lightHeight: 0.105 };
  }

  function candle(parts: Mesh[]) {
    // Turned brass base, a shallow drip bowl, and an uneven column of wax.
    const profile: [number, number][] = [
      [0, 0.106],
      [0.009, 0.106],
      [0.017, 0.098],
      [0.025, 0.07],
      [0.035, 0.041],
      [0.061, 0.021],
      [0.088, 0.026],
      [0.094, 0.041],
      [0.098, 0.072],
      [0.114, 0.076],
      [0.113, 0.059],
      [0.106, 0.029],
    ];
    const holder = MeshBuilder.CreateLathe(
      'candlestick base',
      {
        shape: profile.map(([y, radius]) => new Vector3(radius, y, 0)),
        tessellation: 24,
        cap: Mesh.CAP_ALL,
      },
      scene,
    );
    parts.push(paint(holder, '#93704a'));
    cylinder(parts, [0, 0.185, 0], 0.158, 0.064, 0.057, '#d6b078', 20);
    cylinder(parts, [0.003, 0.262, -0.001], 0.017, 0.057, 0.046, '#e9c893', 16);
    for (const [angle, length] of [
      [0.22, 0.092],
      [2.3, 0.047],
      [4.27, 0.071],
    ] as const) {
      const drip = MeshBuilder.CreateSphere('wax drip', { diameter: 0.02, segments: 6 }, scene);
      drip.position.set(0.026 * Math.cos(angle), 0.254 - length / 2, 0.026 * Math.sin(angle));
      drip.scaling.y = length / 0.02;
      parts.push(paint(drip, '#e4be87'));
    }
    cylinder(parts, [0.004, 0.278, 0], 0.018, 0.008, 0.006, '#37241e', 8);
    return { socket: new Vector3(0.004, 0.285, 0), scale: 0.5, lightHeight: 0.056 };
  }

  function makeFlame() {
    const profile = flameProfile.map(([y, radius]) => new Vector3(radius, y, 0));
    const mesh = MeshBuilder.CreateLathe(
      'wall flame template',
      { shape: profile, tessellation: 9 },
      scene,
    );
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const colors = [];
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1]!;
      const ring = flameProfile.reduce((closest, entry) =>
        Math.abs(entry[0] - y) < Math.abs(closest[0] - y) ? entry : closest,
      );
      const { r, g, b } = Color3.FromHexString(ring[2]).toLinearSpace();
      colors.push(r, g, b, 1);
      positions[i] = positions[i]! + 0.028 * (y / 0.226) ** 2;
    }
    mesh.setVerticesData(VertexBuffer.PositionKind, positions);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.material = fire;
    mesh.metadata = { castShadow: false };
    mesh.setEnabled(false);
    return mesh;
  }
  const flameTemplate = makeFlame();

  return function makeFixture(name: string, kind: FixtureKind, root: TransformNode) {
    let template = templates.get(kind);
    if (!template) {
      const parts: Mesh[] = [];
      const style =
        kind === 'candle' ? candle(parts) : kind === 'torch' ? torch(parts) : lantern(parts);
      const mesh = Mesh.MergeMeshes(parts, true)!;
      mesh.material = surface;
      mesh.metadata = { castShadow: false };
      mesh.setEnabled(false);
      template = { mesh, ...style };
      templates.set(kind, template);
    }
    const body = template.mesh.clone(name, root);
    body.receiveShadows = true;
    body.setEnabled(true);
    const flame = flameTemplate.clone(`${name} flame`, root);
    flame.position.copyFrom(template.socket);
    flame.scaling.setAll(template.scale);
    flame.isPickable = false;
    flame.metadata = { castShadow: false, animatedScale: true };
    flame.setEnabled(true);
    return {
      body,
      flame,
      scale: template.scale,
      emitter: template.socket.add(new Vector3(0, template.lightHeight, 0)),
    };
  };
}
