import { Ray, Vector3, type Scene, type AbstractMesh, type BoundingBox } from '@babylonjs/core';

const groundProbeReach = (body: AbstractMesh, extraDrop = 0) => body.ellipsoid.y + 0.04 + extraDrop;

export function findGroundContact(scene: Scene, body: AbstractMesh, extraDrop = 0) {
  const center = body.position.add(body.ellipsoidOffset);
  const { x, y, z } = center;
  const reach = groundProbeReach(body, extraDrop);
  const ray = new Ray(center, Vector3.DownReadOnly, reach);
  let nearest = null;

  for (const mesh of body.surroundingMeshes || scene.meshes) {
    if (mesh === body || !mesh.checkCollisions || !mesh.isEnabled()) continue;
    mesh.getWorldMatrix();
    const { minimumWorld: low, maximumWorld: high } = mesh.getBoundingInfo().boundingBox;
    // Reject distant colliders before Babylon transforms the ray into each mesh.
    const margin = 0.0001;
    if (
      x < low.x - margin ||
      x > high.x + margin ||
      z < low.z - margin ||
      z > high.z + margin ||
      y < low.y - margin ||
      y - reach > high.y + margin
    )
      continue;
    const hit = ray.intersectsMesh(mesh, false);
    if (hit.hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
  }

  if (
    nearest &&
    nearest.distance >= body.ellipsoid.y - 0.04 &&
    nearest.distance <= reach &&
    (nearest.getNormal(true)?.y ?? 0) > 0.5
  )
    return nearest;
  return null;
}

export const hasGroundContact = (scene: Scene, body: AbstractMesh) =>
  findGroundContact(scene, body) !== null;

export function createGroundProbe(scene: Scene, body: AbstractMesh) {
  const position = new Vector3(NaN, 0, 0);
  let contact: ReturnType<typeof findGroundContact> = null;
  let searchedDrop = 0;
  return {
    invalidate() {
      position.x = NaN;
    },
    sample(extraDrop = 0) {
      if (!position.equals(body.position) || (!contact && extraDrop > searchedDrop)) {
        position.copyFrom(body.position);
        searchedDrop = extraDrop;
        contact = findGroundContact(scene, body, extraDrop);
      }
      // A descent probe may already cover this position. A distant tread
      // can only support a walking step, never an airborne landing.
      return contact && contact.distance <= groundProbeReach(body, extraDrop) ? contact : null;
    },
  };
}

type Triangle = readonly [Vector3, Vector3, Vector3];
type ColliderBounds = Pick<BoundingBox, 'minimumWorld' | 'maximumWorld'>;

function visitTriangles(mesh: AbstractMesh, visit: (triangle: Triangle) => void | false) {
  const positions = mesh.getVerticesData('position'),
    indices = mesh.getIndices();
  if (!positions || !indices) return;
  const matrix = mesh.getWorldMatrix();
  const vertex = (index: number) =>
    Vector3.TransformCoordinates(Vector3.FromArray(positions, index * 3), matrix);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    if (visit([vertex(indices[i]!), vertex(indices[i + 1]!), vertex(indices[i + 2]!)]) === false)
      return false;
  }
}

function colliderBounds(mesh: AbstractMesh) {
  mesh.computeWorldMatrix(true);
  return mesh.getBoundingInfo().boundingBox;
}

export function createPlayerViewClearance(colliders: readonly AbstractMesh[]) {
  const staticBounds = new Map<AbstractMesh, ColliderBounds>();
  return {
    prepare(movingColliders?: Iterable<AbstractMesh>) {
      const moving = new Set(movingColliders);
      staticBounds.clear();
      for (const mesh of colliders) {
        if (moving.has(mesh)) continue;
        const { minimumWorld, maximumWorld } = colliderBounds(mesh);
        staticBounds.set(mesh, {
          minimumWorld: minimumWorld.clone(),
          maximumWorld: maximumWorld.clone(),
        });
      }
    },
    sweep(origin: Vector3, offset: Vector3, radius?: number, growth?: number) {
      return clearPlayerViewFraction(origin, offset, colliders, radius, growth, staticBounds);
    },
  };
}

// Test the authored surface, rather than filling a whole sloping flight's AABB.
// Conservative advancement also covers triangle edges, thin walls and a flame
// that grows as the viewmodel expands away from the eye.
function clearPlayerViewFraction(
  origin: Vector3,
  offset: Vector3,
  colliders: readonly AbstractMesh[],
  radius = 0.18,
  growth = 0,
  staticBounds: ReadonlyMap<AbstractMesh, ColliderBounds>,
) {
  const reach = offset.length() + growth,
    nearest = Vector3.Zero(),
    point = Vector3.Zero();
  if (reach < 1e-8) return 1;
  let fraction = 1;
  const padding = radius + growth;
  const low = Vector3.Minimize(origin, origin.add(offset)).subtractFromFloats(
    padding,
    padding,
    padding,
  );
  const high = Vector3.Maximize(origin, origin.add(offset)).addInPlaceFromFloats(
    padding,
    padding,
    padding,
  );
  for (const mesh of colliders) {
    if (!mesh.checkCollisions || !mesh.isEnabled()) continue;
    const { minimumWorld: min, maximumWorld: max } = staticBounds.get(mesh) ?? colliderBounds(mesh);
    if (
      max.x < low.x ||
      min.x > high.x ||
      max.y < low.y ||
      min.y > high.y ||
      max.z < low.z ||
      min.z > high.z
    )
      continue;
    visitTriangles(mesh, ([a, b, c]) => {
      let t = 0;
      for (let step = 0; step < 64 && t < fraction; step++) {
        origin.addToRef(offset.scale(t), point);
        const gap = Vector3.ProjectOnTriangleToRef(point, a, b, c, nearest) - radius - growth * t;
        if (gap < 0.0001) {
          fraction = Math.max(0, t - 0.012);
          break;
        }
        t += gap / reach;
        // At grazing contact, keep the last proven-clear position.
        if (step === 63 && t < fraction) fraction = Math.max(0, t - 0.012);
      }
    });
  }
  return fraction;
}

export function canRaiseCollider(
  body: AbstractMesh,
  halfHeight: number,
  colliders: readonly AbstractMesh[],
) {
  if (halfHeight <= body.ellipsoid.y) return true;
  const { x, y, z } = body.position.add(body.ellipsoidOffset);
  const bottom = y - body.ellipsoid.y;
  const top = bottom + 2 * halfHeight + 0.012;
  // Below this height the taller ellipsoid is narrower than the current one.
  // Existing foot/slope contact must not veto the newly occupied head space.
  const addedFrom =
    bottom + (2 * body.ellipsoid.y * halfHeight) / (body.ellipsoid.y + halfHeight) + 0.002;
  const { x: width, z: depth } = body.ellipsoid;
  for (const mesh of colliders) {
    if (!mesh.checkCollisions || !mesh.isEnabled()) continue;
    mesh.computeWorldMatrix(true);
    const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
    if (
      max.y <= bottom + 0.025 ||
      min.y >= top ||
      min.x >= x + width ||
      max.x <= x - width ||
      min.z >= z + depth ||
      max.z <= z - depth
    )
      continue;

    const blocked = visitTriangles(mesh, (triangle) => {
      const clipped = [];
      for (let i = 0; i < 3; i++) {
        const a = triangle[i]!,
          b = triangle[(i + 1) % 3]!;
        if (a.y >= addedFrom) clipped.push(a);
        if (a.y < addedFrom !== b.y < addedFrom)
          clipped.push(Vector3.Lerp(a, b, (addedFrom - a.y) / (b.y - a.y)));
      }
      const points = clipped.map(
        (p) =>
          new Vector3(
            (p.x - x) / width,
            (p.y - bottom - halfHeight) / (halfHeight + 0.012),
            (p.z - z) / depth,
          ),
      );
      const nearest = Vector3.Zero();
      for (let i = 1; i < points.length - 1; i++) {
        if (
          Vector3.ProjectOnTriangleToRef(
            Vector3.ZeroReadOnly,
            points[0]!,
            points[i]!,
            points[i + 1]!,
            nearest,
          ) < 1
        )
          return false;
      }
    });
    if (blocked === false) return false;
  }
  return true;
}
