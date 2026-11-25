export interface GroundPoint {
  x: number;
  z: number;
}
export interface GroundRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const distance = (a: GroundPoint, b: GroundPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function footprint(x: number, z: number, width: number, depth: number): GroundRect {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

function expand(rect: GroundRect, amount: number): GroundRect {
  return {
    minX: rect.minX - amount,
    maxX: rect.maxX + amount,
    minZ: rect.minZ - amount,
    maxZ: rect.maxZ + amount,
  };
}

// Clip a segment against both slabs. Touching an inflated collider blocks the shortcut.
function intersects(a: GroundPoint, b: GroundPoint, rect: GroundRect): boolean {
  let from = 0,
    to = 1;
  for (const axis of ['x', 'z'] as const) {
    const min = axis === 'x' ? rect.minX : rect.minZ;
    const max = axis === 'x' ? rect.maxX : rect.maxZ;
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] < min || a[axis] > max) return false;
    } else {
      const first = (min - a[axis]) / delta,
        last = (max - a[axis]) / delta;
      from = Math.max(from, Math.min(first, last));
      to = Math.min(to, Math.max(first, last));
      if (from > to) return false;
    }
  }
  return true;
}

/** A level shares one static visibility graph among all its ground agents. */
export class BotNavigation {
  private readonly bounds: GroundRect;
  private readonly solids: GroundRect[];
  private readonly corners: GroundPoint[] = [];
  private readonly edges: number[][];

  constructor(floor: GroundRect, obstacles: readonly GroundRect[], radius = 0.36) {
    this.bounds = expand(floor, -radius);
    this.solids = obstacles.map((rect) => expand(rect, radius));
    for (const solid of this.solids) {
      const { minX, maxX, minZ, maxZ } = expand(solid, 0.01);
      for (const x of [minX, maxX])
        for (const z of [minZ, maxZ]) {
          const point = { x, z };
          if (this.clear(point, point)) this.corners.push(point);
        }
    }
    this.edges = this.corners.map((a) =>
      this.corners.flatMap((b, i) => (a !== b && this.clear(a, b) ? [i] : [])),
    );
  }

  clear(from: GroundPoint, to: GroundPoint): boolean {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    return (
      [from, to].every((p) => p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) &&
      !this.solids.some((rect) => intersects(from, to, rect))
    );
  }

  // A player can stand closer to a wall than the bot's body allows.
  destination(target: GroundPoint): GroundPoint {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const p = { x: clamp(target.x, minX, maxX), z: clamp(target.z, minZ, maxZ) };
    if (this.clear(p, p)) return p;
    const options = this.solids.flatMap((r) => [
      { x: r.minX - 0.01, z: clamp(p.z, r.minZ, r.maxZ) },
      { x: r.maxX + 0.01, z: clamp(p.z, r.minZ, r.maxZ) },
      { x: clamp(p.x, r.minX, r.maxX), z: r.minZ - 0.01 },
      { x: clamp(p.x, r.minX, r.maxX), z: r.maxZ + 0.01 },
    ]);
    return (
      options.filter((q) => this.clear(q, q)).sort((a, b) => distance(a, p) - distance(b, p))[0] ??
      p
    );
  }

  route(start: GroundPoint, goal: GroundPoint): GroundPoint[] {
    if (this.clear(start, goal)) return [goal];
    const nodes = [...this.corners, goal];
    const cost = nodes.map((p) => (this.clear(start, p) ? distance(start, p) : Infinity));
    const previous = nodes.map(() => -1);
    const open = new Set(nodes.keys());
    const end = nodes.length - 1;
    while (open.size) {
      let current = -1,
        best = Infinity;
      for (const index of open) {
        const score = cost[index]! + distance(nodes[index]!, goal);
        if (score < best) {
          current = index;
          best = score;
        }
      }
      if (current < 0) break;
      if (current === end) {
        const path: GroundPoint[] = [];
        for (let i = end; i >= 0; i = previous[i]!) path.push(nodes[i]!);
        return path.reverse();
      }
      open.delete(current);
      const here = nodes[current]!;
      const neighbors = this.edges[current]!;
      const visit = (next: number) => {
        const candidate = cost[current]! + distance(here, nodes[next]!);
        if (open.has(next) && candidate < cost[next]!) {
          cost[next] = candidate;
          previous[next] = current;
        }
      };
      for (const next of neighbors) visit(next);
      if (this.clear(here, goal)) visit(end);
    }
    return [];
  }
}

export class BotRoute {
  private path: GroundPoint[] = [];
  private target?: GroundPoint;

  reset(): void {
    this.path = [];
    this.target = undefined;
  }

  advance(map: BotNavigation, position: GroundPoint, target: GroundPoint, budget: number): number {
    if (budget <= 0) return 0;
    const goal = map.destination(target);
    if (map.clear(position, goal)) {
      this.path = [goal];
      this.target = goal;
    } else if (!this.target || distance(this.target, goal) > 0.28) {
      this.path = map.route(position, goal);
      this.target = goal;
    }
    let travelled = 0;
    while (this.path.length && budget > 0) {
      const next = this.path[0]!,
        gap = distance(position, next);
      if (gap <= budget) {
        position.x = next.x;
        position.z = next.z;
        this.path.shift();
        budget -= gap;
        travelled += gap;
      } else {
        position.x += ((next.x - position.x) * budget) / gap;
        position.z += ((next.z - position.z) * budget) / gap;
        travelled += budget;
        break;
      }
    }
    return travelled;
  }
}
