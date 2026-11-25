import type { Material, Scene } from '@babylonjs/core';
import { Mesh, MeshBuilder, VertexBuffer, VertexData } from '@babylonjs/core';

interface ExteriorFace {
  axis: string;
  side: string;
  material: Material;
}
function separateExteriorFace(scene: Scene, tile: Mesh, { axis, side, material }: ExteriorFace) {
  const component = ['x', 'z'].includes(axis) ? (axis === 'x' ? 0 : 2) : -1;
  if (component < 0 || !['min', 'max'].includes(side) || !material) {
    throw Error(`Exterior wall face needs x/z axis, min/max side and a material: ${tile.name}`);
  }
  const sign = side === 'min' ? -1 : 1;
  const geometry = VertexData.ExtractFromMesh(tile);
  const exterior = new VertexData();
  exterior.positions = [];
  exterior.normals = [];
  exterior.uvs = [];
  exterior.indices = [];
  const otherIndices = [];
  const vertices = new Map<number, number>();
  if (!geometry.indices || !geometry.positions || !geometry.normals || !geometry.uvs) {
    throw Error(`Missing lighting tile geometry: ${tile.name}`);
  }
  for (let index = 0; index < geometry.indices.length; index += 3) {
    const triangle = geometry.indices.slice(index, index + 3);
    if (geometry.normals[triangle[0]! * 3 + component]! * sign < 0.99) {
      otherIndices.push(...triangle);
      continue;
    }
    for (const vertex of triangle) {
      if (!vertices.has(vertex)) {
        vertices.set(vertex, vertices.size);
        exterior.positions.push(...geometry.positions.slice(vertex * 3, vertex * 3 + 3));
        exterior.normals.push(...geometry.normals.slice(vertex * 3, vertex * 3 + 3));
        exterior.uvs.push(...geometry.uvs.slice(vertex * 2, vertex * 2 + 2));
      }
      exterior.indices.push(vertices.get(vertex)!);
    }
  }
  const face = new Mesh(`${tile.name} · exterior face`, scene);
  exterior.applyToMesh(face);
  face.position.copyFrom(tile.position);
  face.material = material;
  face.receiveShadows = tile.receiveShadows;
  face.isPickable = tile.isPickable;
  face.metadata = { lightingZone: 'ramparts', castShadow: true };
  tile.setIndices(otherIndices);
  return face;
}

export function createLightingTiles(
  scene: Scene,
  source: Mesh,
  { x, z }: { x?: number; z?: number } = {},
  exteriorFace?: ExteriorFace,
) {
  if ([x, z].some((size) => size !== undefined && (!Number.isFinite(size) || size <= 0))) {
    throw Error(`Lighting tile lengths must be positive metres: ${source.name}`);
  }
  source.computeWorldMatrix(true);
  const bounds = source.getBoundingInfo().boundingBox;
  const min = bounds.minimumWorld,
    max = bounds.maximumWorld;
  const width = max.x - min.x,
    height = max.y - min.y,
    depth = max.z - min.z;
  const columns = x ? Math.ceil(width / x) : 1;
  const rows = z ? Math.ceil(depth / z) : 1;
  if (columns === 1 && rows === 1 && !exteriorFace) return [];

  const tiles = [];
  const tileWidth = width / columns,
    tileDepth = depth / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const name = `${source.name} · light tile ${row * columns + column + 1}`;
      const tile =
        height > 0
          ? MeshBuilder.CreateBox(name, { width: tileWidth, height, depth: tileDepth }, scene)
          : MeshBuilder.CreateGround(name, { width: tileWidth, height: tileDepth }, scene);
      tile.position.set(
        min.x + (column + 0.5) * tileWidth,
        (min.y + max.y) / 2,
        min.z + (row + 0.5) * tileDepth,
      );
      if (height === 0) {
        // Keep the original ground's UV range across all of its pieces.
        const uv = tile.getVerticesData(VertexBuffer.UVKind)!;
        for (let index = 0; index < uv.length; index += 2) {
          uv[index] = (column + uv[index]!) / columns;
          uv[index + 1] = (row + uv[index + 1]!) / rows;
        }
        tile.setVerticesData(VertexBuffer.UVKind, uv);
      }
      tile.material = source.material;
      tile.receiveShadows = source.receiveShadows;
      tile.isPickable = source.isPickable;
      tiles.push(tile);
      if (exteriorFace) tiles.push(separateExteriorFace(scene, tile, exteriorFace));
    }
  }
  source.isVisible = false; // Keep collision and the placement's original bounds.
  return tiles;
}
