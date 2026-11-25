import {
  Geometry,
  Mesh,
  PickingInfo,
  Vector3,
  VertexBuffer,
  VertexData,
  type AbstractMesh,
  type IMeshDataOptions,
  type Matrix,
  type Ray,
  type Skeleton,
  type TrianglePickingPredicate,
} from '@babylonjs/core';
import type { HitRegion } from '../../../game/combat/hit-region.ts';

const shapes = new WeakMap<Geometry, Record<HitRegion, Geometry>>();

// Cluster the bind surface once per asset. Keep an original vertex and its joint weights
// in each cell so the picking mesh bends with the same rig as the rendered character.
function createShapes(skin: AbstractMesh, skeleton: Skeleton) {
  const positions = skin.getVerticesData(VertexBuffer.PositionKind)!;
  const bones = skin.getVerticesData(VertexBuffer.MatricesIndicesKind)!;
  const weights = skin.getVerticesData(VertexBuffer.MatricesWeightsKind)!;
  const faces = skin.getIndices()!;
  const headBones = new Set(
    skeleton.bones
      .filter((b) => /:(Head|HeadTop_End|LeftEye|RightEye)$/.test(b.name))
      .map((b) => b.getIndex()),
  );
  const head = new Uint8Array(positions.length / 3);
  for (let v = 0; v < head.length; v++) {
    let weight = 0;
    for (let i = 4 * v; i < 4 * v + 4; i++) {
      if (headBones.has(bones[i]!)) weight += weights[i]!;
    }
    head[v] = Number(weight > 0.5);
  }
  function reduce(region: HitRegion, cell: number) {
    const cells = new Map<string, number>();
    const representatives: number[] = [],
      triangles: number[] = [];
    const vertexMap = new Int32Array(head.length).fill(-1);
    const useVertex = (v: number) => {
      if (vertexMap[v]! >= 0) return vertexMap[v]!;
      const offset = 3 * v;
      const key = [
        bones[4 * v],
        ...[0, 1, 2].map((i) => Math.round(positions[offset + i]! / cell)),
      ].join('/');
      let index = cells.get(key);
      if (index === undefined) {
        index = representatives.length;
        representatives.push(v);
        cells.set(key, index);
      }
      vertexMap[v] = index;
      return index;
    };
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i]!,
        b = faces[i + 1]!,
        c = faces[i + 2]!;
      const faceRegion = head[a]! + head[b]! + head[c]! >= 2 ? 'head' : 'body';
      if (region !== faceRegion) continue;
      const first = useVertex(a),
        second = useVertex(b),
        third = useVertex(c);
      if (first !== second && second !== third && first !== third)
        triangles.push(first, second, third);
    }
    const data = new VertexData();
    data.positions = representatives.flatMap((v) => [
      positions[v * 3]!,
      positions[v * 3 + 1]!,
      positions[v * 3 + 2]!,
    ]);
    data.matricesIndices = representatives.flatMap((v) =>
      Array.from(bones.slice(4 * v, 4 * v + 4)),
    );
    data.matricesWeights = representatives.flatMap((v) =>
      Array.from(weights.slice(4 * v, 4 * v + 4)),
    );
    data.indices = triangles;
    return new Geometry('Y Bot picking ' + region, skin.getScene(), data);
  }
  // Metres in the Y Bot bind mesh. The finer head grid preserves the cheeks and jaw.
  return { head: reduce('head', 0.012), body: reduce('body', 0.032) };
}

class PosedHitSurface extends Mesh {
  private readonly options: IMeshDataOptions = { applySkeleton: true, cache: {} };
  private readonly envelope: { min: Vector3; max: Vector3 };
  private poseDirty = true;
  constructor(
    region: HitRegion,
    skin: AbstractMesh,
    geometry: Geometry,
    skeleton: Skeleton,
    envelope: { min: Vector3; max: Vector3 },
  ) {
    super('Y Bot hit surface · ' + region, skin.getScene());
    geometry.applyToMesh(this);
    this.parent = skin;
    this.envelope = envelope;
    this.skeleton = skeleton;
    this.visibility = 0;
    this.metadata = { humanoidRole: 'enemy', hitRegion: region, castShadow: false };
  }

  markPoseDirty() {
    this.poseDirty = true;
  }

  override intersects(
    ray: Ray,
    fastCheck?: boolean,
    predicate?: TrianglePickingPredicate,
    boundsOnly?: boolean,
    world?: Matrix,
    skipBounds?: boolean,
  ) {
    // The ray arrives in skin space. Reject distant actors before skinning any vertices.
    if (!ray.intersectsBoxMinMax(this.envelope.min, this.envelope.max)) return new PickingInfo();
    if (this.poseDirty) {
      this.skeleton!.prepare(true);
      // Babylon also stores the deformed CPU triangle positions on this mesh. Only the bind
      // Geometry is shared; two clones can be picked in different poses during the same frame.
      this.refreshBoundingInfo(this.options);
      this.poseDirty = false;
    }
    return super.intersects(ray, fastCheck, predicate, boundsOnly, world, skipBounds);
  }
}

export function addEnemyHitSurfaces(skin: AbstractMesh, skeleton: Skeleton) {
  const source = skin.geometry!;
  const geometry = shapes.get(source) ?? createShapes(skin, skeleton);
  shapes.set(source, geometry);
  // Each limb stays within one standing height of the bind-box centre in enemy gait and combat.
  const bind = skin.getBoundingInfo().boundingBox;
  const reach = Vector3.One().scale(bind.maximum.y - bind.minimum.y);
  const envelope = { min: bind.center.subtract(reach), max: bind.center.add(reach) };
  const head = new PosedHitSurface('head', skin, geometry.head, skeleton, envelope);
  const body = new PosedHitSurface('body', skin, geometry.body, skeleton, envelope);
  skin.isPickable = false;
  return () => {
    head.markPoseDirty();
    body.markPoseDirty();
  };
}
