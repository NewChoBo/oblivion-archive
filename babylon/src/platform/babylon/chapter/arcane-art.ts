import type { Scene, Material } from '@babylonjs/core';

interface ArchFrame {
  center: number;
  width: number;
  spring: number;
}
import {
  CSG,
  MeshBuilder,
  Mesh,
  VertexData,
  TransformNode,
  Color3,
  PBRMaterial,
} from '@babylonjs/core';

// The desk stamp, inlaid floor seals and arch share one carved pattern.
// Its channels are subtracted from solid geometry, rather than drawn as text.
const strokes = [
  [
    [0, 0.28],
    [0.2, 0],
  ],
  [
    [0.2, 0],
    [0, -0.28],
  ],
  [
    [0, -0.28],
    [-0.2, 0],
  ],
  [
    [-0.2, 0],
    [0, 0.28],
  ],
  [
    [0, 0.28],
    [0, 0.5],
  ],
  [
    [0, -0.28],
    [0, -0.5],
  ],
  [
    [-0.45, 0.18],
    [-0.25, 0],
  ],
  [
    [-0.25, 0],
    [-0.45, -0.18],
  ],
  [
    [0.45, 0.18],
    [0.25, 0],
  ],
  [
    [0.25, 0],
    [0.45, -0.18],
  ],
] as const;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
function pbr(scene: Scene, name: string, color: string, metallic = 0, roughness = 0.88) {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(color);
  m.metallic = metallic;
  m.roughness = roughness;
  m.maxSimultaneousLights = 4;
  m.useGLTFLightFalloff = true;
  return m;
}

function createCarvedSeal(
  scene: Scene,
  name: string,
  surface: Material,
  { round = false, color = new Color3(0.12, 0.34, 0.38) } = {},
) {
  const root = new TransformNode(name, scene);
  const base = round
    ? MeshBuilder.CreateCylinder(
        'seal blank',
        { diameter: 0.48, height: 0.1, tessellation: 24 },
        scene,
      )
    : MeshBuilder.CreateBox('seal blank', { width: 0.58, height: 0.68, depth: 0.1 }, scene);
  if (round) base.rotation.x = Math.PI / 2;
  let solid = CSG.FromMesh(base);
  base.dispose();
  const glow = pbr(scene, `${name} groove`, '#081014', 0, 0.76);
  let inlay = null;
  for (const [a, b] of strokes) {
    const x = (a[0] + b[0]) * 0.21,
      y = (a[1] + b[1]) * 0.21,
      length = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.42,
      angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cutter = MeshBuilder.CreateBox(
      'engraving cutter',
      { width: length + 0.012, height: 0.023, depth: 0.09 },
      scene,
    );
    cutter.position.set(x, y, -0.025);
    cutter.rotation.z = angle;
    solid.subtractInPlace(CSG.FromMesh(cutter));
    cutter.dispose();
    const inset = MeshBuilder.CreateBox(
      'inlay stroke',
      { width: length, height: 0.01, depth: 0.006 },
      scene,
    );
    inset.position.set(x, y, -0.006);
    inset.rotation.z = angle;
    const stroke = CSG.FromMesh(inset);
    inset.dispose();
    if (inlay) inlay.unionInPlace(stroke);
    else inlay = stroke;
  }
  const engraving = inlay!.toMesh(`${name} inset`, glow, scene);
  engraving.parent = root;
  engraving.receiveShadows = true;
  const carved = solid.toMesh(`${name} carved solid`, surface, scene);
  carved.parent = root;
  carved.receiveShadows = true;
  let level: number | null = null;
  const api = {
    root,
    meshes: root.getChildMeshes(),
    setLevel(value: number) {
      const next = clamp(value);
      if (next === level) return;
      level = next;
      glow.emissiveColor = color.scale(0.012 + level * 0.65);
    },
    get level() {
      return level;
    },
  };
  api.setLevel(0);
  return api;
}

function archBlock(
  scene: Scene,
  index: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
  material: Material,
  frame: ArchFrame,
  wallFront: number,
) {
  const positions = [],
    indices = [];
  for (const z of [wallFront - 0.2, wallFront])
    for (const [r, angle] of [
      [inner, start],
      [outer, start],
      [outer, end],
      [inner, end],
    ] as const)
      positions.push(frame.center + Math.cos(angle) * r, frame.spring + Math.sin(angle) * r, z);
  for (const face of [
    [0, 1, 2, 3],
    [4, 7, 6, 5],
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ] as const)
    indices.push(face[0], face[1], face[2], face[0], face[2], face[3]);
  const mesh = new Mesh(`blackstone arch wedge ${index}`, scene),
    data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = [];
  VertexData.ComputeNormals(positions, indices, data.normals);
  data.applyToMesh(mesh);
  mesh.convertToFlatShadedMesh();
  mesh.material = material;
  mesh.receiveShadows = true;
  return mesh;
}

export function createArchiveMagic(scene: Scene, frame: ArchFrame, wallFront: number) {
  const radius = frame.width / 2,
    post = radius + 0.22;
  const stone = pbr(scene, 'wet blue-gray blackstone', '#536069', 0, 0.94),
    metal = pbr(scene, 'tarnished seal brass', '#736146', 0.68, 0.64);
  const trim = [];
  for (let i = 0; i < 11; i++)
    trim.push(
      archBlock(
        scene,
        i,
        radius,
        radius + 0.44,
        (i * Math.PI) / 11 + 0.012,
        ((i + 1) * Math.PI) / 11 - 0.012,
        stone,
        frame,
        wallFront,
      ),
    );
  for (const side of [-1, 1]) {
    const pillar = MeshBuilder.CreateBox(
      'seal gate stone pillar',
      { width: 0.44, height: frame.spring - 0.18, depth: 0.23 },
      scene,
    );
    pillar.position.set(
      frame.center + side * post,
      (frame.spring + 0.18) / 2,
      wallFront - 0.23 / 2,
    );
    pillar.material = stone;
    pillar.receiveShadows = true;
    const foot = MeshBuilder.CreateBox(
      'pillar footing',
      { width: 0.6, height: 0.18, depth: 0.31 },
      scene,
    );
    foot.position.set(frame.center + side * post, 0.09, wallFront - 0.31 / 2);
    foot.material = stone;
    foot.receiveShadows = true;
    trim.push(pillar, foot);
  }
  for (const [index, mesh] of trim.entries())
    mesh.metadata = {
      lightingZone: 'readingRoom',
      levelPlacement: { zone: 'readingRoom', id: 'north-arch-trim', part: index + 1 },
    };
  const desk = createCarvedSeal(scene, 'desk metal seal', metal, {
    round: true,
    color: new Color3(0.6, 0.33, 0.09),
  });
  for (const mesh of desk.meshes) mesh.metadata = { lightingZone: 'readingRoom' };
  desk.root.position.set(0.12, 1.32, 1.5);
  desk.root.rotation.x = Math.PI / 2 - 0.36;
  desk.root.scaling.setAll(0.6);
  const sequence = [{ seal: desk, delay: 0 }];
  for (const [i, z] of [3.4, 4.5, 5.6].entries()) {
    const seal = createCarvedSeal(scene, `inlaid floor seal ${i}`, metal, { round: true });
    seal.root.position.set(0, 0.008, z);
    seal.root.rotation.x = Math.PI / 2;
    seal.root.scaling.setAll(0.55);
    sequence.push({ seal, delay: 0.45 + i * 0.35 });
  }
  for (const [i, angle] of [
    0.15 * Math.PI,
    0.85 * Math.PI,
    0.325 * Math.PI,
    0.675 * Math.PI,
    0.5 * Math.PI,
  ].entries()) {
    const seal = createCarvedSeal(scene, `engraved arch seal ${i}`, stone);
    seal.root.position.set(
      frame.center + Math.cos(angle) * post,
      frame.spring + Math.sin(angle) * post,
      wallFront - 0.24,
    );
    seal.root.rotation.z = angle - Math.PI / 2;
    seal.root.scaling.setAll(0.69);
    sequence.push({ seal, delay: 1.45 + Math.floor(i / 2) * 0.36 });
  }
  const door = createCarvedSeal(scene, 'central door seal', metal, { round: true });
  door.root.position.set(0, 1.6, 7.43);
  door.root.scaling.setAll(2.0);
  sequence.push({ seal: door, delay: 2.65 });
  return {
    trim,
    archStone: stone,
    doorRoot: door.root,
    update(elapsed: number) {
      for (const entry of sequence)
        entry.seal.setLevel(elapsed < 0 ? 0 : smooth((elapsed - entry.delay) / 0.55));
      return elapsed < 0 ? 0 : smooth((elapsed - 2.65) / 0.6);
    },
    snapshot() {
      return sequence.map((entry) => ({
        name: entry.seal.root.name,
        level: entry.seal.level,
        delay: entry.delay,
      }));
    },
  };
}
