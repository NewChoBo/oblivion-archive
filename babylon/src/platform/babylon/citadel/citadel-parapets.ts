import { Vector3 } from '@babylonjs/core';

import type { ParapetSpec } from '../../../content/citadel-layout.ts';
import type { CitadelGeometry, Face } from './citadel-geometry.ts';

export interface ParapetEdge {
  a: Vector3;
  b: Vector3;
  merlons: boolean;
}
const key = (p: Vector3) => [p.x, p.y, p.z].map((n) => Math.round(n * 1e6)).join('/');
const pair = (a: Vector3, b: Vector3) => key(a) + '>' + key(b);
const length = (a: Vector3, b: Vector3) => Math.hypot(b.x - a.x, b.z - a.z);
const right = (v: Vector3) => new Vector3(v.z, 0, -v.x);
const direction = (a: Vector3, b: Vector3) => new Vector3(b.x - a.x, 0, b.z - a.z).normalize();
const addHeight = (p: Vector3, h: number) => new Vector3(p.x, p.y + h, p.z);

function corner(a: Vector3, b: Vector3, c: Vector3, spec: ParapetSpec) {
  const incoming = direction(a, b),
    outgoing = direction(b, c);
  const turn = Math.atan2(
    incoming.x * outgoing.z - incoming.z * outgoing.x,
    Vector3.Dot(incoming, outgoing),
  );
  if (Math.abs(turn) < 0.0001 || Math.abs(turn) > Math.PI - 0.001) return [b];
  const tangent = Math.tan(Math.abs(turn) / 2);
  const trim = Math.min(
    spec.turnRadius * tangent,
    spec.maxTrimFraction * Math.min(length(a, b), length(b, c)),
  );
  const start = Vector3.Lerp(b, a, trim / length(a, b)),
    end = Vector3.Lerp(b, c, trim / length(b, c));
  const center = start.subtract(right(incoming).scale((Math.sign(turn) * trim) / tangent));
  const dx = start.x - center.x,
    dz = start.z - center.z;
  const half = Math.ceil((Math.abs(turn) * 90) / (Math.PI * spec.maxArcDegrees));
  return Array.from({ length: 2 * half + 1 }, (_, i) => {
    const t = i / (2 * half),
      angle = t * turn;
    const y =
      i <= half
        ? start.y + ((b.y - start.y) * i) / half
        : b.y + ((end.y - b.y) * (i - half)) / half;
    return new Vector3(
      center.x + dx * Math.cos(angle) - dz * Math.sin(angle),
      y,
      center.z + dx * Math.sin(angle) + dz * Math.cos(angle),
    );
  });
}

// Directed edges keep the walkable area on their left. Adjoining districts
// use the midpoint of the same fillet for both sides of their shared seam.
export function surveyParapets(edges: ParapetEdge[], spec: ParapetSpec) {
  const before = new Map<string, Vector3 | null>(),
    after = new Map<string, Vector3 | null>();
  const corners = new Map<string, Vector3[]>(),
    profiles = new Map<string, Vector3[]>();
  const register = (table: typeof before, k: string, p: Vector3) =>
    table.set(k, table.has(k) ? null : p);
  for (const { a, b } of edges) {
    register(after, key(a), b);
    register(before, key(b), a);
  }
  function joint(p: Vector3) {
    const k = key(p);
    if (!corners.has(k)) {
      const a = before.get(k),
        b = after.get(k);
      corners.set(k, a && b ? corner(a, p, b, spec) : [p]);
    }
    return corners.get(k)!;
  }
  const middle = (p: Vector3) => {
    const arc = joint(p);
    return arc[(arc.length - 1) / 2]!;
  };
  const normals = new Map<string, Vector3[]>();
  for (const edge of edges) {
    const { a, b } = edge,
      start = joint(a),
      end = joint(b);
    const run = [...start.slice((start.length - 1) / 2), ...end.slice(0, (end.length + 1) / 2)];
    profiles.set(pair(a, b), run);
    for (let i = 1; i < run.length; i++) {
      const n = right(direction(run[i - 1]!, run[i]!));
      for (const p of [run[i - 1]!, run[i]!]) {
        const k = key(p),
          list = normals.get(k) ?? [];
        list.push(n);
        normals.set(k, list);
      }
    }
  }
  function boundary(a: Vector3, b: Vector3) {
    return (
      profiles.get(pair(a, b)) ??
      profiles.get(pair(b, a))?.slice().reverse() ?? [middle(a), middle(b)]
    );
  }
  function inset(p: Vector3, w: number) {
    const ns = normals.get(key(p));
    if (!ns) return p;
    const n =
      ns.length === 1 ? ns[0]! : ns[0]!.add(ns[1]!).scale(1 / (1 + Vector3.Dot(ns[0]!, ns[1]!)));
    return p.subtract(n.scale(w));
  }
  return {
    edges,
    boundary,
    inset,
    middle,
    openStart: (p: Vector3) => !before.get(key(p)),
    openEnd: (p: Vector3) => !after.get(key(p)),
  };
}

export function along(run: Vector3[], t: number) {
  const lengths = run.slice(1).map((p, i) => length(p, run[i]!));
  let remaining = Math.max(0, Math.min(t, 1)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]!)
      return Vector3.Lerp(run[i]!, run[i + 1]!, remaining / lengths[i]!);
    remaining -= lengths[i]!;
  }
  return run.at(-1)!;
}

export function buildParapets(
  survey: ReturnType<typeof surveyParapets>,
  spec: ParapetSpec,
  { surfaces, box }: Pick<CitadelGeometry, 'surfaces' | 'box'>,
) {
  const { width, height, edgeBevel: bevel } = spec;
  // Both sides and the two small bevels belong to a single stone section.
  const profile = [
    [0, 0],
    [0, height - bevel],
    [bevel, height],
    [width - bevel, height],
    [width, height - bevel],
    [width, 0],
  ] as const;
  for (const { a, b, merlons } of survey.edges) {
    const run = survey.boundary(a, b);
    const rings = run.map((p) => profile.map(([w, h]) => addHeight(survey.inset(p, w), h)));
    let faces: Face[] = [],
      span = 0;
    for (let i = 1; i < run.length; i++) {
      const normal = right(direction(run[i - 1]!, run[i]!));
      for (let j = 0; j < profile.length - 1; j++) {
        const dh = profile[j + 1]![1] - profile[j]![1],
          dw = profile[j + 1]![0] - profile[j]![0];
        const out = normal.scale(dh).add(new Vector3(0, dw, 0));
        faces.push([
          [rings[i - 1]![j]!, rings[i]![j]!, rings[i]![j + 1]!, rings[i - 1]![j + 1]!],
          out,
        ]);
      }
      if (i === 1 && survey.openStart(a)) faces.push([rings[0]!, run[0]!.subtract(run[1]!)]);
      if (i === run.length - 1 && survey.openEnd(b))
        faces.push([rings[i]!, run[i]!.subtract(run[i - 1]!)]);
      span += length(run[i - 1]!, run[i]!);
      if (span >= 2.5 || i === run.length - 1) {
        surfaces('rampart parapet wall', faces, 'wall', true);
        faces = [];
        span = 0;
      }
    }
    if (!merlons) continue;
    const axis = run.map((p) => survey.inset(p, width / 2));
    const count = Math.max(1, Math.round(length(a, b) / spec.merlonPitch));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count,
        p = along(axis, t),
        v = along(axis, t + 0.001).subtract(p);
      const [w, h, d] = spec.merlon;
      box('merlon', p.x, p.y + height + h / 2, p.z, w, h, d, 'wall', Math.atan2(v.x, v.z));
    }
  }
}
