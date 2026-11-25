import type { BaseTexture, PBRMaterial, Scene, Texture } from '@babylonjs/core';
import type { Bounds, DoorFrame, Point2, Point3 } from '../../../content/level-geometry.ts';
import type { Face } from './citadel-geometry.ts';
import type { Walkway } from '../../../content/citadel-layout.ts';
import type { ParapetEdge } from './citadel-parapets.ts';
import {
  Color3,
  Mesh,
  MeshBuilder,
  PointLight,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { chapterLevel, construction, plan, workLayout } from '../../../content/citadel-layout.ts';
import { along, buildParapets, surveyParapets } from './citadel-parapets.ts';
import { stairTreadFaces } from './stair-treads.ts';
import { buildDistricts } from './citadel-districts.ts';
import authoredTextures from '../../../../../shared/levels/citadel-materials.json' with { type: 'json' };
import { hoistPose } from './citadel-hoist.ts';
import { pointedSegments, pointedStep } from '../../../levels/pointed-profile.ts';
import { wallSections } from '../../../levels/wall-openings.ts';

type Quad = [Vector3, Vector3, Vector3, Vector3];
type Row = [Vector3, Vector3];
type End = [Point2, Point2];
interface TextureSlot {
  meters: number;
  albedo: string;
  emissive?: string;
  normal?: string;
}
const textureSlots: Record<string, TextureSlot> = authoredTextures;
interface CitadelOptions {
  material(name: string, color: string): PBRMaterial;
  colliders: Mesh[];
  reflection?: BaseTexture | null;
  loadTexture?(path: string): Texture;
  entranceFrame: Pick<DoorFrame, 'center' | 'width' | 'spring' | 'rise'>;
  recordPart?(section: string, name: string, material: string): void;
}
function bothSides<T>(build: (side: 0 | 1) => T): [T, T] {
  return [build(0), build(1)];
}

const tau = Math.PI * 2;
const offset = Vector3.FromArray(plan.chapterJoin.offset);
const point = (x: number, y: number, z: number) => new Vector3(x, y, z);
const world = (v: Vector3) => v.add(offset);
const horizontal = (a: Vector3, b: Vector3) => Math.hypot(b.x - a.x, b.z - a.z);
const start = plan.arrival.spawn;
export const citadelArrival = world(Vector3.FromArray(start)).addInPlaceFromFloats(0, 0.86, 0);
const [ox, oz] = plan.lookout.center;
export const citadelLookoutBounds: Bounds = [
  [ox - 3.6, ox + 3.6],
  [plan.lookout.height + offset.y, plan.lookout.height + offset.y],
  [oz + offset.z - 3.6, oz + offset.z + 3.6],
];

// Openings at the first and last station share the landing's exact edge.
function sections({ stations, width }: Walkway, first: End, last: End): Row[] {
  const centers = stations.map((v) => Vector3.FromArray(v));
  return centers.map((v, i) => {
    const before = centers[Math.max(i - 1, 0)]!,
      after = centers[Math.min(i + 1, centers.length - 1)]!;
    const length = horizontal(before, after);
    const normal = point((after.z - before.z) / length, 0, (before.x - after.x) / length);
    const ends = i === 0 ? first : i === centers.length - 1 ? last : null;
    if (ends) {
      const [[x1, z1], [x2, z2]] = ends;
      const pair: Row = [point(x1, v.y, z1), point(x2, v.y, z2)];
      if (Vector3.Dot(pair[0].subtract(v), normal) > 0) pair.reverse();
      return pair;
    }
    return [v.subtract(normal.scale(width / 2)), v.add(normal.scale(width / 2))];
  });
}

// The orthographic survey drawing and the playable districts use these same edges.
export function citadelSurvey() {
  const edge = (poly: Point2[], i: number): End => [poly[i]!, poly[(i + 1) % poly.length]!];
  const bridge = sections(
    plan.bridge,
    edge(plan.arrival.outline, plan.arrival.bridgeEdge),
    edge(plan.court.outline, 0),
  );
  const l = plan.lookout,
    halfAngle = Math.asin(plan.westWalk.width / (2 * l.radius));
  const disc = Array.from({ length: 31 }, (_, i): Point2 => {
    const a = halfAngle + ((tau - 2 * halfAngle) * i) / 30;
    return [ox + l.radius * Math.cos(a), oz + l.radius * Math.sin(a)];
  });
  const west = sections(plan.westWalk, edge(plan.court.outline, 12), [disc[0]!, disc.at(-1)!]);
  const stairs = sections(plan.stairs, edge(plan.court.outline, 8), edge(plan.terrace.outline, 0));
  const wallEdges: ParapetEdge[] = [];
  function traceIsland(polygon: Point2[], y: number, open: number[]) {
    const rim = polygon.map(([x, z]) => point(x, y, z));
    const ccw =
      polygon.reduce((sum, [x, z], i) => {
        const next = polygon[(i + 1) % rim.length]!;
        return sum + x * next[1] - z * next[0];
      }, 0) > 0;
    rim.forEach((p, i) => {
      if (open.includes(i)) return;
      const q = rim[(i + 1) % rim.length]!;
      wallEdges.push({ a: ccw ? p : q, b: ccw ? q : p, merlons: true });
    });
  }
  traceIsland(plan.arrival.outline, plan.arrival.height, [
    plan.arrival.bridgeEdge,
    plan.arrival.landingEdge,
  ]);
  for (const district of [plan.court, plan.terrace, plan.bindery, plan.freight]) {
    traceIsland(district.outline, district.height, district.openEdges ?? [0]);
  }
  traceIsland(disc, l.height, [disc.length - 1]);
  for (const rows of [bridge, west, stairs]) {
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = rows[i - 1]!,
        [c, d] = rows[i]!;
      wallEdges.push(
        { a: c, b: a, merlons: rows !== stairs },
        { a: b, b: d, merlons: rows !== stairs },
      );
    }
  }
  const survey = surveyParapets(wallEdges, construction.wall);
  const edgesOf = (polygon: Vector3[]) =>
    polygon.map((p, i) => survey.boundary(p, polygon[(i + 1) % polygon.length]!));
  return { bridge, west, stairs, disc, survey, edgesOf };
}

export function buildCitadel(
  scene: Scene,
  { material, colliders, reflection, loadTexture, entranceFrame, recordPart }: CitadelOptions,
) {
  const finishes: Record<string, string> = {
    ...construction.palette,
    joint: '#384850',
    gable: '#697a83',
    volumes: '#365760',
    sheets: '#e2cc98',
    crest: '#e3b55e',
    gateLight: '#dac185',
    binderyLight: '#e5a552',
    libraryLight: '#ecbd73',
    dockLight: '#df9b42',
    roseLight: '#f2bc69',
  };
  const revealed: Partial<Record<string, number>> = { sheets: 2, volumes: 3, crest: 5 };
  const details: { mesh: Mesh; phase: number }[] = [];
  const litAt: Record<string, number> = {
    gateLight: 1,
    binderyLight: 2,
    libraryLight: 3,
    dockLight: 4,
    roseLight: 5,
  };
  const mats: Record<string, PBRMaterial> = {};
  const images = new Map<string, Texture>();
  function image(path: string, loadTexture: (path: string) => Texture) {
    if (!images.has(path)) {
      const tex = loadTexture('assets/' + path);
      tex.anisotropicFilteringLevel = 8;
      images.set(path, tex);
    }
    return images.get(path)!;
  }
  for (const [id, color] of Object.entries(finishes)) {
    const m = material('citadel · ' + id, color);
    m.roughness = id === 'gold' ? 0.46 : 0.84;
    if (reflection) {
      m.reflectionTexture = reflection;
      m.environmentIntensity = construction.lighting.exteriorProbe;
    }
    if (id === 'gold') m.metallic = 0.53;
    if (['roof', 'gable', 'binderyLight'].includes(id)) {
      m.backFaceCulling = false;
      m.twoSidedLighting = true;
    }
    if (id === 'glass') m.emissiveColor = new Color3(0.52, 0.21, 0.044);
    const slot = textureSlots[id];
    if (slot && loadTexture) {
      m.albedoTexture = image(slot.albedo, loadTexture);
      if (slot.emissive) m.emissiveTexture = image(slot.emissive, loadTexture);
      m.albedoColor = Color3.Lerp(m.albedoColor, Color3.White(), id === 'cloth' ? 0.1 : 0.6);
      if (slot.normal) {
        m.bumpTexture = image(slot.normal, loadTexture);
        m.bumpTexture.level = 0.5;
      }
    }
    mats[id] = m;
  }
  let batch = new Map<string, Mesh[]>(),
    sectionName = '';
  const tag = (mesh: Mesh) => {
    mesh.metadata = { lightingZone: 'ramparts', castShadow: false };
    mesh.receiveShadows = true;
    mesh.position.addInPlace(offset);
    mesh.computeWorldMatrix(true);
    return mesh;
  };
  function finish() {
    for (const [id, parts] of batch) {
      if (!parts.length) continue;
      // Keep distant pieces out of one light receiver. A castle-wide merlon
      // batch would otherwise reserve every beacon in the same PBR shader.
      const cells = new Map<string, Mesh[]>();
      for (const mesh of parts) {
        mesh.computeWorldMatrix(true);
        const c = mesh.getBoundingInfo().boundingBox.centerWorld;
        const key = Math.floor(c.x / 9) + ',' + Math.floor(c.z / 9);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(mesh);
      }
      for (const pieces of cells.values()) {
        const result = Mesh.MergeMeshes(pieces, true, true)!;
        result.name = sectionName + ' · ' + id;
        tag(result);
        const phase = revealed[id];
        if (phase) details.push({ mesh: result, phase });
      }
    }
    batch = new Map();
  }
  function add(mesh: Mesh, id: string, solid: boolean = false) {
    recordPart?.(sectionName, mesh.name, id);
    mesh.material = mats[id]!;
    if (solid) {
      mesh.checkCollisions = true;
      colliders.push(tag(mesh));
    } else {
      if (!batch.has(id)) batch.set(id, []);
      batch.get(id)!.push(mesh);
    }
    return mesh;
  }
  function rig(name: string, origin: Vector3, parts: Mesh[]) {
    const root = new TransformNode(name, scene);
    root.position.copyFrom(world(origin));
    for (const mesh of parts) {
      for (const list of batch.values()) {
        const i = list.indexOf(mesh);
        if (i !== -1) list.splice(i, 1);
      }
      if (mesh.metadata?.lightingZone !== 'ramparts') tag(mesh);
      mesh.setParent(root);
    }
    return root;
  }
  function boxUV(mesh: Mesh, id: string) {
    const size = textureSlots[id]?.meters;
    if (!size) return;
    const pos = mesh.getVerticesData('position')!,
      norm = mesh.getVerticesData('normal')!,
      uv = [];
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]! + mesh.position.x,
        y = pos[i + 1]! + mesh.position.y,
        z = pos[i + 2]! + mesh.position.z;
      const top = Math.abs(norm[i + 1]!) > 0.5,
        side = Math.abs(norm[i]!) > 0.5;
      uv.push((side ? z : x) / size, (top ? z : y) / size);
    }
    mesh.setVerticesData('uv', uv);
  }
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    id: string,
    yaw = 0,
    solid = false,
  ) {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    boxUV(mesh, id);
    return add(mesh, id, solid);
  }
  function drum(
    name: string,
    x: number,
    y: number,
    z: number,
    bottom: number,
    top: number,
    height: number,
    id: string,
    sides = 24,
    solid = false,
  ) {
    const mesh = MeshBuilder.CreateCylinder(
      name,
      { diameterBottom: 2 * bottom, diameterTop: 2 * top, height, tessellation: sides },
      scene,
    );
    mesh.position.set(x, y + height / 2, z);
    const size = textureSlots[id]?.meters;
    if (size) {
      const uv = mesh.getVerticesData('uv')!,
        norm = mesh.getVerticesData('normal')!,
        r = Math.max(bottom, top);
      for (let i = 0; i < uv.length; i += 2) {
        const cap = Math.abs(norm[(i / 2) * 3 + 1]!) > 0.99;
        uv[i]! *= (cap ? 2 * r : tau * r) / size;
        uv[i + 1]! *= (cap ? 2 * r : height) / size;
      }
      mesh.setVerticesData('uv', uv);
    }
    return add(mesh, id, solid);
  }
  function beam(name: string, a: Vector3, b: Vector3, w: number, h: number, id: string) {
    const delta = b.subtract(a),
      length = delta.length();
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: length }, scene);
    mesh.position.copyFrom(Vector3.Center(a, b));
    mesh.rotation.set(-Math.asin(delta.y / length), Math.atan2(delta.x, delta.z), 0);
    boxUV(mesh, id);
    return add(mesh, id, false);
  }
  // Vertices carry outward normals and material coordinates in metres.
  function surfaces(name: string, faces: Face[], id: string, solid = false) {
    const positions: number[] = [],
      normals: number[] = [],
      indices: number[] = [],
      uvs: number[] = [];
    for (const [poly, out, uv] of faces) {
      let normal = Vector3.Cross(
        poly[1]!.subtract(poly[0]!),
        poly[2]!.subtract(poly[0]!),
      ).normalize();
      const flip = out && Vector3.Dot(normal, out) < 0;
      if (flip) normal = normal.negate();
      const at = positions.length / 3;
      const up = Math.abs(normal.y) > 0.7,
        side = Math.abs(normal.x) > Math.abs(normal.z);
      for (const [j, p] of poly.entries()) {
        positions.push(p.x, p.y, p.z);
        normals.push(normal.x, normal.y, normal.z);
        const scale = textureSlots[id]?.meters ?? 1;
        const [u, v] = uv?.[j] ?? [up || !side ? p.x : p.z, up ? p.z : p.y];
        uvs.push(u / scale, v / scale);
      }
      for (let i = 1; i < poly.length - 1; i++)
        indices.push(at, at + (flip ? i : i + 1), at + (flip ? i + 1 : i));
    }
    const data = new VertexData();
    Object.assign(data, { positions, normals, indices, uvs });
    const mesh = new Mesh(name, scene);
    data.applyToMesh(mesh);
    return add(mesh, id, solid);
  }
  const mean = (polygon: Vector3[]) =>
    polygon.reduce((s, v) => s.addInPlace(v), Vector3.Zero()).scaleInPlace(1 / polygon.length);
  const { bridge, west, stairs, disc, survey, edgesOf } = citadelSurvey();
  const l = plan.lookout;
  function slab(
    name: string,
    edges: Vector3[][],
    depth: number,
    center: Vector3,
    open: number[] = [],
    steps = 0,
  ) {
    const down = point(0, -depth, 0),
      faces: Face[] = [],
      sides: Face[] = [];
    for (const [edgeIndex, run] of edges.entries())
      for (let i = 1; i < run.length; i++) {
        const a = run[i - 1]!,
          b = run[i]!,
          baseA = a.add(down),
          baseB = b.add(down);
        faces.push([[center, a, b], Vector3.UpReadOnly]);
        if (!steps) faces.push([[center.add(down), baseA, baseB], Vector3.DownReadOnly]);
        if (!open.includes(edgeIndex))
          sides.push([[a, baseA, baseB, b], Vector3.Center(a, b).subtract(center)]);
      }
    const mesh = surfaces(name, faces, 'paving', true);
    if (steps) {
      mesh.isVisible = false;
      mesh.isPickable = false;
      const bottom = edges[0]![0]!.y;
      const top = edges[2]![0]!.y;
      surfaces(
        'stair tread',
        stairTreadFaces(faces, bottom, top, steps),
        construction.stairs.surface,
      );
    }
    if (sides.length) surfaces(name + ' outer wall', sides, 'wall');
  }
  function island(
    name: string,
    polygon: Point2[],
    height: number,
    open: number[],
    depth: number,
    core: Point2 | undefined = undefined,
  ) {
    const raw = polygon.map(([x, z]) => point(x, height, z)),
      edges = edgesOf(raw);
    const center = core ? point(core[0], height, core[1]) : mean(raw);
    const rim = edges.flatMap((run) => run.slice(0, -1));
    slab(
      name,
      edges,
      0.46,
      center,
      open.filter((i) => name !== 'arrival island' || i !== plan.arrival.landingEdge),
    );
    const rings = (
      [
        [1, -0.46],
        [1.04, -1.15],
        [0.9, -depth * 0.43],
        [0.57, -depth * 0.73],
      ] as const
    ).map(([scale, dy], k) =>
      rim.map((v) => {
        const angle = Math.atan2(v.z - center.z, v.x - center.x);
        const d = v.subtract(center).scale(scale + (k > 1 ? 0.065 * Math.sin(5 * angle + k) : 0));
        return point(
          center.x + d.x,
          height + dy + (k > 1 ? Math.sin(3 * angle) * depth * 0.11 : 0),
          center.z + d.z,
        );
      }),
    );
    const tip = center.add(point(-0.8, -depth, 0)),
      faces: Face[] = [];
    // Wind the entire shell from the perimeter, including the concave stair inlet.
    const ccw =
      polygon.reduce((s, [x, z], i) => {
        const b = polygon[(i + 1) % polygon.length]!;
        return s + x * b[1] - z * b[0];
      }, 0) > 0;
    const triangle = (a: Vector3, b: Vector3, c: Vector3) =>
      faces.push([ccw ? [a, c, b] : [a, b, c]]);
    rim.forEach((v, i) => {
      const j = (i + 1) % rim.length;
      for (let k = 0; k < rings.length - 1; k++) {
        triangle(rings[k]![i]!, rings[k + 1]![i]!, rings[k]![j]!);
        triangle(rings[k + 1]![i]!, rings[k + 1]![j]!, rings[k]![j]!);
      }
      triangle(rings.at(-1)![i]!, tip, rings.at(-1)![j]!);
    });
    surfaces(name + ' bedrock', faces, 'basalt');
  }
  function way(name: string, rows: Row[]) {
    for (let i = 1; i < rows.length; i++) {
      const [a, b] = rows[i - 1]!,
        [c, d] = rows[i]!,
        polygon = [a, b, d, c];
      slab(
        name,
        edgesOf(polygon),
        construction.stairs.deckThickness,
        mean(polygon),
        [0, 2],
        rows === stairs ? construction.stairs.treadCounts[i - 1] : 0,
      );
    }
  }
  function arch(
    a: Vector3,
    b: Vector3,
    base: number,
    spring: number,
    rise: number,
    thickness: number,
    depth: number,
    id = 'trim',
    spandrelTop?: number,
    solid = false,
  ) {
    const axis = b.subtract(a).normalize(),
      normal = point(axis.z, 0, -axis.x);
    const span = horizontal(a, b),
      center = Vector3.Center(a, b);
    const v = (u: number, h: number, d: number) =>
      center
        .add(axis.scale(u))
        .add(point(0, h, 0))
        .add(normal.scale(d));
    const faces: Face[] = [],
      spandrels: Face[] = [];
    for (const sign of [-1, 1]) {
      let prev: Row = [v((sign * span) / 2, base, 0), v(sign * (span / 2 + thickness), base, 0)];
      const segments = pointedSegments;
      for (let i = 0; i <= segments; i++) {
        const { angle, x, y } = pointedStep(span, spring, rise, i);
        const inner = v(i === segments ? 0 : sign * x, y, 0),
          outer = v(
            i === segments ? 0 : sign * (x + thickness * Math.cos(angle)),
            y + thickness * Math.sin(angle),
            0,
          );
        const poly: Quad = [prev[0], prev[1], outer, inner],
          rear = poly.map((q) => q.subtract(normal.scale(depth))) as Quad;
        faces.push(
          [poly, normal],
          [rear, normal.negate()],
          [[prev[0], inner, rear[3], rear[0]], axis.scale(-sign)],
          [[prev[1], outer, rear[2], rear[1]], axis.scale(sign)],
        );
        if (spandrelTop && i > 0) {
          const p = prev[1],
            q = outer,
            upper = v(
              i === segments ? 0 : sign * (x + thickness * Math.cos(angle)),
              spandrelTop,
              0,
            );
          const above = p.add(point(0, spandrelTop - p.y, 0));
          const front: Quad = [p, q, upper, above],
            back = front.map((v) => v.subtract(normal.scale(depth))) as Quad;
          spandrels.push(
            [front, normal],
            [back, normal.negate()],
            [[above, upper, back[2], back[3]], Vector3.UpReadOnly],
          );
        }
        prev = [inner, outer];
      }
    }
    surfaces('pointed arch', faces, id, solid);
    if (spandrels.length) surfaces('arch spandrel', spandrels, 'wall', solid);
  }
  function orrery(x: number, y: number, z: number, r: number) {
    drum('orrery pedestal', x, y, z, r * 0.8, r * 0.72, 0.28, 'trim', 24, true);
    drum('retaining wall', x, y + 0.28, z, r * 0.4, r * 0.22, r * 0.73, 'gold', 16, true);
    const sweep = drum(
      'orrery ring sweep',
      x,
      y + 0.24,
      z,
      r * 0.77,
      r * 0.77,
      r * 1.86,
      'joint',
      32,
      true,
    );
    sweep.isVisible = false;
    sweep.isPickable = false;
    for (const [rx, rz] of [
      [0.35, 0.68],
      [1, -0.42],
      [Math.PI / 2, 0],
    ] as const) {
      const mesh = MeshBuilder.CreateTorus(
        'orrery ecliptic ring',
        { diameter: r * 1.85, thickness: r * 0.055, tessellation: 40 },
        scene,
      );
      mesh.position.set(x, y + r * 1.45, z);
      mesh.rotation.set(rx, 0, rz);
      add(mesh, 'gold', true);
    }
    drum('orrery star', x, y + r * 1.29, z, r * 0.19, 0.02, r * 0.42, 'glass', 8);
  }
  function beacon(x: number, y: number, z: number) {
    // The bottom of the foot is buried in the paving even on the steepest
    // stair flight. Its top stays level; the visible stone starts at the deck.
    drum('beacon stone base', x, y - 0.16, z, 0.27, 0.19, 1.21, 'trim', 12, true);
    drum('brass brazier', x, y + 1.05, z, 0.16, 0.3, 0.2, 'gold', 12, true);
    drum('beacon flame', x, y + 1.25, z, 0.115, 0.015, 0.26, 'glass', 8);
    const lamp = new PointLight('rampart beacon bounce light', world(point(x, y + 1.38, z)), scene);
    lamp.diffuse = Color3.FromHexString('#ffd29a').toLinearSpace();
    lamp.specular = lamp.diffuse.scale(0.2);
    lamp.intensity = construction.lighting.beaconIntensity;
    lamp.range = construction.lighting.beaconRange;
    lamp.metadata = { lightingZone: 'ramparts' };
    lamp.renderPriority = 14;
  }
  sectionName = 'arrival island and three-arch bridge';
  island(
    'arrival island',
    plan.arrival.outline,
    plan.arrival.height,
    [plan.arrival.bridgeEdge, plan.arrival.landingEdge],
    10,
  );
  way('curved stone bridge', bridge);
  const soffits: [Vector3[], Vector3[]] = [[], []];
  const bridgeSides = bothSides((side) =>
    bridge.slice(1).map((row, i) => survey.boundary(bridge[i]![side], row[side])),
  );
  const bridgeCuts: number[] = [];
  for (const runs of bridgeSides)
    for (const [k, run] of runs.entries()) {
      const distance = [0];
      for (let i = 1; i < run.length; i++)
        distance.push(distance.at(-1)! + horizontal(run[i - 1]!, run[i]!));
      for (const d of distance) bridgeCuts.push(k + d / distance.at(-1)!);
    }
  for (const side of [0, 1] as const) {
    for (let span = 0; span < plan.bridge.arches; span++) {
      const from = (span * (bridge.length - 1)) / plan.bridge.arches,
        to = ((span + 1) * (bridge.length - 1)) / plan.bridge.arches;
      const sample = (t: number) => {
        const k = Math.min(bridge.length - 2, Math.floor(t));
        return along(bridgeSides[side][k]!, t - k);
      };
      let prev: Row | null = null;
      const ticks = [
        ...new Set(
          [
            ...Array.from({ length: 17 }, (_, i) => from + ((to - from) * i) / 16),
            ...bridgeCuts.filter((t) => t > from && t < to),
          ].map((t) => Math.round(t * 1e8) / 1e8),
        ),
      ].sort((a, b) => a - b);
      for (const [i, t] of ticks.entries()) {
        const u = (t - from) / (to - from),
          v = sample(t);
        const lip = v.add(point(0, -construction.stairs.deckThickness, 0));
        const soffit = v.add(
          point(0, -7.2 + 5.95 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)), 0),
        );
        if (i || span === 0) soffits[side].push(soffit);
        if (prev) {
          const out = point(side ? 1 : -1, 0, 0);
          surfaces('bridge arch flank', [[[prev[0], lip, soffit, prev[1]], out]], 'wall');
          beam('bridge voussoir', prev[1], soffit, 0.34, 0.23, 'trim');
        }
        prev = [lip, soffit];
      }
      if (span > 0) {
        const v = sample(from);
        drum('bridge pier', v.x, -15, v.z, 0.6, 1.0, 8.0 + v.y, 'basalt', 8);
        drum('bridge pier cap', v.x, v.y - 7.4, v.z, 1.08, 1.08, 0.4, 'trim', 8);
        const k = Math.floor(from),
          centerline = bridgeSides[side][k]!.map((p) =>
            survey.inset(p, construction.wall.width + 0.31),
          );
        const seat = along(centerline, from - k);
        beacon(seat.x, seat.y, seat.z);
      }
    }
  }
  const vault: Face[] = [];
  for (let i = 1; i < soffits[0].length; i++) {
    vault.push([
      [soffits[0][i - 1]!, soffits[1][i - 1]!, soffits[1][i]!, soffits[0][i]!],
      Vector3.DownReadOnly,
    ]);
  }
  surfaces('bridge arch soffit', vault, 'joint');
  finish();
  sectionName = 'orrery court and round-tower gate';
  island('orrery court', plan.court.outline, 0, plan.court.openEdges, 17);
  const gate = plan.gate,
    gz = gate.center[1];
  for (const x of gate.towerX) {
    // The tower has one continuous turned profile, including the foot below the paving.
    // Its inner chord seats the gate jamb so a cylindrical wall never breaks through it.
    const profile: [number, number, string][] = [
      [-6.4, 1.3, 'basalt'],
      [-2.2, 1.83, 'basalt'],
      [-0.28, 2.12, 'wall'],
      [0.02, 2.16, 'trim'],
      [0.16, 2.22, 'trim'],
      [0.38, 2.22, 'trim'],
      [0.58, 2.03, 'trim'],
      [5.7, 1.91, 'wall'],
      [5.8, 2.03, 'trim'],
      [5.93, 2.03, 'trim'],
      [6.01, 1.91, 'trim'],
      [7.8, 1.86, 'wall'],
      [8.12, 2.17, 'trim'],
      [8.35, 2.22, 'trim'],
      [8.76, 2.22, 'wall'],
    ];
    const seat = gate.opening / 2 + 0.34,
      rings = 48,
      dir = Math.sign(x);
    const at = (y: number, r: number, a: number) =>
      point(dir * Math.max(seat, dir * (x + r * Math.cos(a))), y, gz + r * Math.sin(a));
    for (let j = 1; j < profile.length; j++) {
      const [base, r0] = profile[j - 1]!,
        [top, r1, id] = profile[j]!,
        faces: Face[] = [];
      let distance = 0;
      for (let k = 0; k < rings; k++) {
        const a = (k * tau) / rings,
          b = ((k + 1) * tau) / rings;
        const v = at(base, r0, a),
          w = at(base, r0, b),
          u = at(top, r1, b),
          t = at(top, r1, a);
        const next = distance + horizontal(v, w);
        const out = point(Math.cos((a + b) / 2), 0, Math.sin((a + b) / 2));
        faces.push([
          [v, w, u, t],
          out,
          [
            [distance, base],
            [next, base],
            [next, top],
            [distance, top],
          ],
        ]);
        distance = next;
      }
      surfaces('round gate tower', faces, id, true);
    }
    const top = profile.at(-1)!;
    const lid = Array.from({ length: rings }, (_, i) => at(top[0], top[1], (i * tau) / rings));
    surfaces(
      'round gate tower roof',
      lid.map((v, i) => [[point(x, top[0], gz), v, lid[(i + 1) % rings]!], Vector3.UpReadOnly]),
      'paving',
      true,
    );
    for (let i = 0; i < 12; i++) {
      const a = (i * tau) / 12;
      box(
        'rounded merlon',
        x + 2.05 * Math.sin(a),
        8.99,
        gz + 2.05 * Math.cos(a),
        0.61,
        0.48,
        0.35,
        'wall',
        a,
      );
      box(
        'upper embrasure',
        x + 1.89 * Math.sin(a),
        6.95,
        gz + 1.89 * Math.cos(a),
        0.23,
        0.83,
        0.06,
        'gateLight',
        a,
      );
    }
    box('gate banner', x, 4.1, gz - 2.04, 0.88, 3.1, 0.065, 'cloth');
    box('banner center rib', x, 4.15, gz - 2.084, 0.065, 2.55, 0.023, 'gold');
    drum('flagpole', x, 8.7, gz, 0.045, 0.035, 1.85, 'gold', 8);
    box('tower flag', x + 0.42, 10.13, gz, 0.81, 0.38, 0.05, 'cloth');
  }
  const jamb = gate.opening / 2;
  for (const side of [-1, 1]) {
    box('stone gate jamb', side * (jamb + 0.28), 1.96, gz, 0.56, 4.24, 1.62, 'wall', 0, true);
    box('gate capital', side * (jamb + 0.28), 4.12, gz, 0.7, 0.26, 1.8, 'trim', 0, true);
  }
  arch(
    point(-jamb, 0, gz - 0.77),
    point(jamb, 0, gz - 0.77),
    4.25,
    4.28,
    2.7,
    0.44,
    1.54,
    'trim',
    7.72,
  );
  box('gate capstone', 0, 7.84, gz, gate.opening + 1.2, 0.24, 1.75, 'trim');
  orrery(plan.court.orrery[0], 0, plan.court.orrery[1], 1.55);
  finish();
  sectionName = 'west star walk and observatory';
  way('curved west rampart', west);
  for (let i = 1; i < west.length; i++) {
    for (const side of [0, 1] as const) {
      const a = west[i - 1]![side],
        b = west[i]![side],
        foot = Math.min(a.y, b.y);
      arch(
        point(a.x, 0, a.z),
        point(b.x, 0, b.z),
        foot - 4.7,
        foot - 2.65,
        1.9,
        0.37,
        0.36,
        'wall',
      );
      if (i % 2 === 0)
        drum('star walk support column', a.x, foot - 6.2, a.z, 0.36, 0.58, 5.7, 'basalt', 10);
    }
  }
  island('round observatory', disc, l.height, [disc.length - 1], 12);
  orrery(ox, l.height, oz, 1.15);
  finish();
  sectionName = 'east arcade';
  const outline = plan.court.outline,
    edgeIds = plan.gallery.edgeIndices;
  const pierStations = [...edgeIds, edgeIds.at(-1)! + 1].map((i) => {
    const [x, z] = outline[i]!,
      towardCourt = point(1 - x, 0, 9 - z).normalize();
    return point(x, 0, z).add(towardCourt.scale(0.7));
  });
  for (const p of pierStations) {
    drum('corridor pier', p.x, 0, p.z, 0.51, 0.41, 3.1, 'wall', 16, true);
    drum('arcade column base', p.x, 0, p.z, 0.58, 0.54, 0.25, 'trim', 16);
    drum('arcade capital', p.x, 2.91, p.z, 0.43, 0.58, 0.31, 'trim', 16);
  }
  const galleryHeight = plan.gallery.height;
  const axes = pierStations.slice(1).map((p, i) => p.subtract(pierStations[i]!).normalize());
  const siding = axes.map((v) => point(v.z, 0, -v.x));
  const corniceRings = pierStations.map<Quad>((p, i) => {
    const incoming = siding[Math.max(0, i - 1)]!,
      outgoing = siding[Math.min(i, siding.length - 1)]!;
    const miter = incoming.add(outgoing).scale(1 / (1 + Vector3.Dot(incoming, outgoing)));
    const at = (width: number, h: number) => p.add(miter.scale(width)).add(point(0, h, 0));
    return [
      at(-0.37, galleryHeight - 0.2),
      at(0.37, galleryHeight - 0.2),
      at(0.41, galleryHeight + 0.04),
      at(-0.41, galleryHeight + 0.04),
    ];
  });
  for (const p of pierStations) {
    drum(
      'arcade arch joint stone',
      p.x,
      3.1,
      p.z,
      0.46,
      0.42,
      galleryHeight - 0.2 - 3.1,
      'wall',
      12,
    );
  }
  for (let i = 0; i < axes.length; i++) {
    const p = pierStations[i]!,
      q = pierStations[i + 1]!,
      axis = axes[i]!,
      normal = siding[i]!,
      depth = 0.54;
    const a = p.add(axis.scale(0.48)).add(normal.scale(depth / 2));
    const b = q.subtract(axis.scale(0.48)).add(normal.scale(depth / 2));
    arch(a, b, 3.1, 3.14, 1.6, 0.23, depth, 'trim', galleryHeight - 0.2);
    const c = corniceRings[i]!,
      d = corniceRings[i + 1]!;
    const faces = (
      [
        [0, 1, Vector3.DownReadOnly],
        [1, 2, normal],
        [2, 3, Vector3.UpReadOnly],
        [3, 0, normal.negate()],
      ] as const
    ).map<Face>(([j, k, out]) => [[c[j], d[j], d[k], c[k]], out]);
    if (i === 0) faces.push([c, axis.negate()]);
    if (i === axes.length - 1) faces.push([d, axis]);
    surfaces('continuous stone cornice', faces, 'trim');
  }
  finish();
  sectionName = 'grand stair and upper terrace';
  way('walkable stair ramp', stairs);
  const stair = construction.stairs;
  const atY = (p: Vector3, y: number) => point(p.x, y, p.z);
  for (let i = 1; i < stairs.length; i++) {
    const [a, b] = stairs[i - 1]!,
      [c, d] = stairs[i]!;
    const outsides: [Vector3[], Vector3[]] = [survey.boundary(a, c), survey.boundary(b, d)];
    const toes: Vector3[][] = [];
    for (const [side, run] of outsides.entries()) {
      const sign = side ? 1 : -1,
        normal = point(sign, 0, 0);
      const toe = run.map((p) => {
        const inset = survey.inset(p, stair.rockToe);
        const from = stairs[0]![0].z,
          to = stairs.at(-1)![0].z;
        return atY(inset, -5.6 - 0.9 * Math.sin((Math.PI * (p.z - from)) / (to - from)));
      });
      toes.push(toe);
      const faces: Face[] = [],
        rockFaces: Face[] = [];
      for (let j = 1; j < run.length; j++) {
        const u = run[j - 1]!,
          v = run[j]!,
          lu = atY(u, stair.retainingBase),
          lv = atY(v, stair.retainingBase);
        faces.push([
          [atY(u, u.y - stair.deckThickness), atY(v, v.y - stair.deckThickness), lv, lu],
          normal,
        ]);
        rockFaces.push([[lu, lv, toe[j]!, toe[j - 1]!], normal]);
      }
      surfaces('stair retaining wall', faces, stair.parapet);
      surfaces('stair rock plinth', rockFaces, 'basalt');
      if (i < stairs.length - 1) {
        const lamp = survey.inset(run[0]!, construction.wall.width + 0.31);
        beacon(lamp.x, lamp.y, lamp.z);
      }
    }
    const fractions = (paths: Vector3[][]) =>
      paths.flatMap((run) => {
        const distances = [0];
        for (let j = 1; j < run.length; j++)
          distances.push(distances.at(-1)! + horizontal(run[j - 1]!, run[j]!));
        return distances.map((d) => d / distances.at(-1)!);
      });
    const knots = [...new Set(fractions(toes))].sort((x, y) => x - y);
    surfaces(
      'retaining wall toe rock',
      knots
        .slice(1)
        .map((v, j) => [
          [
            along(toes[0]!, knots[j]!),
            along(toes[1]!, knots[j]!),
            along(toes[1]!, v),
            along(toes[0]!, v),
          ],
          Vector3.DownReadOnly,
        ]),
      'basalt',
    );
  }
  island(
    'library forecourt terrace',
    plan.terrace.outline,
    plan.terrace.height,
    plan.terrace.openEdges,
    13,
    plan.terrace.core,
  );
  finish();
  sectionName = 'great library';
  const hall = plan.scriptorium,
    w = hall.width / 2,
    z = hall.frontZ,
    deck = plan.terrace.height;
  // The lower nave joins the playable reading room through the open central bay.
  box(
    'main hall foundation',
    0,
    deck - 1.65,
    z + hall.depth / 2,
    hall.width,
    2.86,
    hall.depth,
    'basalt',
  );
  // Close the lower rear of the nave around the chapter transept.
  box(
    'main hall rear wall',
    0,
    deck + 2,
    z + hall.depth - 0.15,
    hall.width,
    4,
    0.3,
    'wall',
    0,
    true,
  );
  const rearZ = z + hall.depth - 0.3;
  for (const [side, from, to] of [
    [-1, 7.2 - offset.z, rearZ],
    [1, 7.2 - offset.z, 8.1 - offset.z],
    [1, 12.5 - offset.z, rearZ],
  ] as const) {
    box(
      'main hall rear side wall',
      side * (w - 0.14),
      deck + 2,
      (to + from) / 2,
      0.28,
      4,
      to - from,
      'wall',
      0,
      true,
    );
  }
  const upperBase = 8.5;
  box(
    'upper side wall',
    -(w - 0.16),
    (upperBase + hall.eaves) / 2,
    z + hall.depth / 2,
    0.32,
    hall.eaves - upperBase,
    hall.depth,
    'wall',
  );
  const [, [, ceilingTop], corridorSpan] = chapterLevel.zones.corridor.find(
    ({ id }) => id === 'corridor-ceiling',
  )!.bounds!;
  const eastWall = wallSections({
    id: 'upper east wall of the main hall',
    bounds: [
      [w - 0.32, w],
      [upperBase, hall.eaves],
      [z, z + hall.depth],
    ],
    openingAxis: 'z',
    openings: [
      {
        span: [corridorSpan[0] - offset.z, corridorSpan[1] - offset.z],
        height: [upperBase, ceilingTop - offset.y],
      },
    ],
  });
  for (const section of eastWall) {
    const center = section.map(([a, b]) => (a + b) / 2) as Point3,
      size = section.map(([a, b]) => b - a) as Point3;
    box('upper side wall', ...center, ...size, 'wall');
  }
  box(
    'upper rear wall',
    0,
    (upperBase + hall.eaves) / 2,
    z + hall.depth - 0.15,
    hall.width - 0.64,
    hall.eaves - upperBase,
    0.3,
    'wall',
  );
  const { center, width, spring: entrySpring, rise: entryRise } = entranceFrame;
  // The doorway wall owns the reveal behind the facade.
  const entranceTrimDepth = 0.1;
  arch(
    point(center - width / 2, 0, z - entranceTrimDepth),
    point(center + width / 2, 0, z - entranceTrimDepth),
    deck,
    deck + entrySpring,
    entryRise!,
    0.34,
    entranceTrimDepth,
  );
  const front: [Vector3, Vector3, Vector3] = [
    point(-w, hall.eaves, z),
    point(w, hall.eaves, z),
    point(0, hall.ridge, z),
  ];
  const back = front.map((v) => v.add(point(0, 0, hall.depth))) as [Vector3, Vector3, Vector3];
  surfaces('great library rear gable', [[back, point(0, 0, 1)]], 'wall');
  surfaces(
    'library roof',
    [
      [[front[0], front[2], back[2], back[0]], point(-1, 1, 0)],
      [[front[2], front[1], back[1], back[2]], point(1, 1, 0)],
    ],
    'roof',
  );
  const half = hall.windowWidth / 2,
    glazingZ = z + 0.2,
    sill = 8.85,
    spring = 16.45,
    rise = 4.65;
  const glass = [
    point(-half, sill, glazingZ),
    point(half, sill, glazingZ),
    point(half, spring, glazingZ),
  ];
  for (const side of [1, -1])
    for (
      let i = side > 0 ? 1 : pointedSegments - 1;
      side > 0 ? i <= pointedSegments : i >= 0;
      i += side > 0 ? 1 : -1
    ) {
      const { x, y } = pointedStep(half * 2, spring, rise, i);
      glass.push(point(side * x, y, glazingZ));
    }
  const roofY = (x: number) => hall.ridge - (Math.abs(x) / w) * (hall.ridge - hall.eaves);
  const face: [Vector3[], Vector3][] = [],
    cut: Face[] = [],
    wallDepth = 0.32;
  for (const [a, b] of [
    [-w, -half],
    [half, w],
  ] as const) {
    face.push([
      [
        point(a, upperBase, z),
        point(b, upperBase, z),
        point(b, roofY(b), z),
        point(a, roofY(a), z),
      ],
      point(0, 0, -1),
    ]);
  }
  face.push([
    [
      point(-half, upperBase, z),
      point(half, upperBase, z),
      point(half, sill, z),
      point(-half, sill, z),
    ],
    point(0, 0, -1),
  ]);
  for (let i = 0; i < glass.length; i++) {
    const g = glass[i]!,
      h = glass[(i + 1) % glass.length]!;
    const a = point(g.x, g.y, z),
      b = point(h.x, h.y, z);
    cut.push([
      [a, b, b.add(point(0, 0, wallDepth)), a.add(point(0, 0, wallDepth))],
      point(-a.x, spring - a.y, 0),
    ]);
    if (i >= 2 && i < glass.length - 1)
      face.push([[a, b, point(b.x, roofY(b.x), z), point(a.x, roofY(a.x), z)], point(0, 0, -1)]);
  }
  const backFace = face.map<Face>(([poly, out]) => [
    poly.map((p) => p.add(point(0, 0, wallDepth))),
    out.negate(),
  ]);
  for (const [a, b] of [
    [-w, -half],
    [-half, half],
    [half, w],
  ] as const) {
    const bottom: Row = [point(a, upperBase, z), point(b, upperBase, z)];
    backFace.push([
      [...bottom, bottom[1].add(point(0, 0, wallDepth)), bottom[0].add(point(0, 0, wallDepth))],
      Vector3.DownReadOnly,
    ]);
  }
  for (const side of [-1, 1]) {
    const a = point(side * w, upperBase, z),
      b = point(side * w, roofY(side * w), z);
    backFace.push([
      [a, b, b.add(point(0, 0, wallDepth)), a.add(point(0, 0, wallDepth))],
      point(side, 0, 0),
    ]);
  }
  surfaces('main hall star window facade', [...face, ...backFace], 'wall');
  surfaces('star window inner sill', cut, 'trim');
  box(
    'star window drip edge',
    0,
    sill - 0.11,
    z - 0.03,
    hall.windowWidth + 0.72,
    0.22,
    0.54,
    'trim',
  );
  surfaces('amber Gothic window', [[glass, point(0, 0, -1)]], 'roseLight');
  arch(point(-half, 0, z - 0.22), point(half, 0, z - 0.22), sill, spring, rise, 0.29, 0.3);
  for (const x of [-1.5, 0, 1.5]) {
    const top = spring + (rise * Math.sqrt(4 - (1 + Math.abs(x) / half) ** 2)) / Math.sqrt(3);
    box('window mullion', x, (top + sill) / 2, z - 0.14, 0.105, top - sill, 0.12, 'joint');
  }
  for (const h of [10.45, 12.05, 13.65, 15.4])
    box('window crossbar', 0, h, z - 0.16, half * 2, 0.085, 0.13, 'joint');
  for (const x of [-1.5, 1.5]) {
    arch(
      point(x - 1.42, 0, z - 0.21),
      point(x + 1.42, 0, z - 0.21),
      sill,
      spring - 0.45,
      1.96,
      0.095,
      0.1,
      'joint',
    );
  }
  const rose = MeshBuilder.CreateTorus(
    'window rose tracery',
    { diameter: 1.45, thickness: 0.105, tessellation: 24 },
    scene,
  );
  rose.position.set(0, 18.4, z - 0.21);
  rose.rotation.x = Math.PI / 2;
  add(rose, 'joint');
  for (let k = 0; k < 8; k++) {
    const a = (k * tau) / 8,
      b = a + tau / 16;
    beam(
      'star window restoration motif',
      point(Math.cos(a) * 1.6, 18.4 + Math.sin(a) * 1.6, z - 0.29),
      point(Math.cos(b) * 0.55, 18.4 + Math.sin(b) * 0.55, z - 0.29),
      0.105,
      0.105,
      'crest',
    );
    beam(
      'star window restoration motif',
      point(Math.cos(a) * 1.6, 18.4 + Math.sin(a) * 1.6, z - 0.29),
      point(Math.cos(a - tau / 16) * 0.55, 18.4 + Math.sin(a - tau / 16) * 0.55, z - 0.29),
      0.105,
      0.105,
      'crest',
    );
  }
  for (let i = 0; i < 4; i++) {
    const x = (i % 2 ? 1 : -1) * w,
      cz = z + (i >= 2 ? hall.depth : 0),
      peak = hall.pinnacles[i]!;
    drum(
      'library corner tower',
      x,
      deck - 0.75,
      cz,
      1.03,
      0.68,
      hall.eaves - deck + 1.85,
      'wall',
      16,
      true,
    );
    drum('spire eaves', x, hall.eaves + 1.1, cz, 0.89, 0.92, 0.35, 'trim', 12);
    drum(
      'library spire',
      x,
      hall.eaves + 1.45,
      cz,
      0.81,
      0.035,
      peak - hall.eaves - 1.45,
      'roof',
      8,
    );
  }
  finish();
  const freightRig = buildDistricts(plan, {
    box,
    drum,
    beam,
    arch,
    surfaces,
    island,
    begin: (name) => {
      sectionName = name;
    },
    finish,
    rig,
  });

  sectionName = 'ramparts and battlements';
  buildParapets(survey, construction.wall, { surfaces, box });
  finish();

  const freight = workLayout.freight,
    anchor = 6.05;
  const rope = MeshBuilder.CreateCylinder(
    'hoist rope',
    { height: 1, diameter: 0.075, tessellation: 7 },
    scene,
  );
  const load = MeshBuilder.CreateBox(
    'suspended book crate',
    { width: freight.load[0], height: freight.load[1], depth: freight.load[2] },
    scene,
  );
  recordPart?.('east freight warehouse', rope.name, 'gold');
  recordPart?.('east freight warehouse', load.name, 'wood');
  rope.material = mats.gold!;
  load.material = mats.wood!;
  load.checkCollisions = true;
  colliders.push(load);
  for (const mesh of [rope, load]) tag(mesh);
  const duration = freight.liftSeconds + freight.turnSeconds + freight.lowerSeconds;
  let phase = -1,
    elapsed = 0,
    pose = hoistPose(freight, 0);
  function updateHoist(dt: number) {
    elapsed = phase >= 4 ? Math.min(duration, elapsed + dt) : 0;
    pose = hoistPose(freight, elapsed);
    const top = pose.bottom + freight.load[1];
    for (const mesh of [rope, load]) {
      mesh.position.x = offset.x + pose.x;
      mesh.position.z = offset.z + pose.z;
    }
    rope.scaling.y = anchor - top;
    rope.position.y = offset.y + (anchor + top) / 2;
    load.position.y = offset.y + pose.bottom + freight.load[1] / 2;
    load.computeWorldMatrix(true);
    freightRig.boomRoot.rotation.y = -pose.angle;
    freightRig.boomRoot.computeWorldMatrix(true);
    for (const leaf of freightRig.leaves) {
      leaf.position.z =
        offset.z + freight.receivingDoor.z - (freight.receivingDoor.width + 0.04) * pose.door;
      leaf.computeWorldMatrix(true);
    }
  }
  function restore(next: number, immediate = false) {
    if (next === phase && !immediate) return;
    if (next < 4 || phase < 4) elapsed = 0;
    phase = next;
    for (const [id, at] of Object.entries(litAt)) {
      const lit = phase >= at;
      mats[id]!.albedoColor = Color3.FromHexString(lit ? finishes[id]! : '#374853');
      mats[id]!.emissiveColor = lit
        ? new Color3(0.4, 0.23, 0.095)
        : new Color3(0.014, 0.024, 0.032);
    }
    for (const { mesh, phase: at } of details) mesh.setEnabled(phase >= at);
    updateHoist(immediate ? duration : 0);
  }
  restore(0, true);
  const movingColliders = [load, ...freightRig.leaves];
  return {
    restore,
    movingColliders,
    movingShadowCasters: [...movingColliders, rope, ...freightRig.boomRoot.getChildMeshes()],
    update(dt: number) {
      if (phase >= 4 && elapsed < duration) updateHoist(dt);
    },
    snapshot: () => ({
      phase,
      hoist: pose.progress,
      cargo: { ...pose, position: load.position.asArray() },
      litWindows: Object.keys(litAt).filter((id) => phase >= litAt[id]!),
    }),
  };
}
