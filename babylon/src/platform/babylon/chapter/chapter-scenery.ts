import {
  Color3,
  ImportMeshAsync,
  MeshBuilder,
  RawTexture,
  Texture,
  TransformNode,
  VertexBuffer,
} from '@babylonjs/core';
import authoredCatalog from '../../../../../shared/levels/environment-prefabs.json' with { type: 'json' };
import { wallSections } from '../../../levels/wall-openings.ts';
import { createDoorwayWall, openingForFrame } from '../../../levels/doorway-wall.ts';
import { createLightingTiles } from '../../../levels/lighting-tiles.ts';

import type { AbstractMesh, Mesh, PBRMaterial, Scene } from '@babylonjs/core';
import type { Bounds, Point3 } from '../../../content/level-geometry.ts';
import type { LevelLayout, ModelPlacement } from '../../../content/chapter-layout.ts';
import type { BoxFactory, MaterialFactory } from './chapter-geometry.ts';
import type { OccludingStructure } from '../rendering/opaque-occlusion.ts';

interface TextureMap {
  path: string;
  repeat?: number[];
}
interface MaterialSpec {
  name: string;
  color: string;
  roughness?: number;
  metallic?: number;
  alpha?: number;
  specularIntensity?: number;
  albedo?: TextureMap;
  normal?: TextureMap & { level: number };
}
interface Part {
  name?: string;
  shape?: string;
  size?: Point3;
  offset?: Point3;
  material?: string;
  collision?: boolean;
}
interface Prefab {
  parts: Part[];
  model?: { path: string; fitToBox?: boolean };
}
interface SurfaceSpec {
  materials: string[];
  path: string;
  normal?: { path: string; level: number };
  tileMeters: number;
  tint: string;
  alignGrain?: boolean;
}
interface ModelInstance {
  id: string;
  mount: Mesh;
  fitToBox?: boolean;
  transform?: ModelPlacement;
}
type Materials = Record<string, PBRMaterial>;

// Prefab material IDs survive changes to the names shown in scene inspection.
const prefabImpactSurfaces: Readonly<Partial<Record<string, 'wood' | 'metal' | 'stone'>>> = {
  wood: 'wood',
  darkWood: 'wood',
  readingFloor: 'wood',
  chestHardware: 'metal',
  stone: 'stone',
  chapterFloor: 'stone',
  rampartStone: 'stone',
  rampartFloor: 'stone',
  rampartTrim: 'stone',
};

function coordinates(values?: number[]): Point3 | undefined {
  if (!values) return undefined;
  if (values.length !== 3 || !values.every(Number.isFinite))
    throw Error('Expected three prefab coordinates');
  return values as Point3;
}

function prefabPart(
  part: Omit<Part, 'size' | 'offset'> & { size?: number[]; offset?: number[] },
): Part {
  return { ...part, size: coordinates(part.size), offset: coordinates(part.offset) };
}

const catalog: {
  materials: Record<string, MaterialSpec>;
  prefabs: Record<string, Prefab>;
  tiledSurfaces: SurfaceSpec[];
} = {
  ...authoredCatalog,
  prefabs: Object.fromEntries(
    Object.entries(authoredCatalog.prefabs).map<[string, Prefab]>(([id, prefab]) => [
      id,
      { ...prefab, parts: prefab.parts.map(prefabPart) },
    ]),
  ),
};

export function createEnvironmentMaterials(
  scene: Scene,
  material: MaterialFactory,
  ids?: readonly string[],
): Materials {
  function texture({ path, repeat = [1, 1] }: TextureMap) {
    const map = new Texture('./' + path, scene);
    if (repeat.length !== 2) throw Error(`Expected two texture repeats: ${path}`);
    map.uScale = repeat[0]!;
    map.vScale = repeat[1]!;
    return map;
  }

  const entries = Object.entries(catalog.materials).filter(([id]) => !ids || ids.includes(id));
  return Object.fromEntries(
    entries.map<[string, PBRMaterial]>(([id, data]) => {
      const surface = material(data.name, data.color);
      const impactSurface = prefabImpactSurfaces[id];
      if (impactSurface) surface.metadata = { ...surface.metadata, impactSurface };
      if (data.roughness !== undefined) surface.roughness = data.roughness;
      if (data.metallic !== undefined) surface.metallic = data.metallic;
      if (data.alpha !== undefined) surface.alpha = data.alpha;
      if (data.specularIntensity !== undefined) surface.specularIntensity = data.specularIntensity;
      if (data.albedo) surface.albedoTexture = texture(data.albedo);
      if (data.normal) {
        surface.bumpTexture = texture(data.normal);
        surface.bumpTexture.level = data.normal.level;
      }
      return [id, surface];
    }),
  );
}

export function createEnvironment(
  scene: Scene,
  level: LevelLayout,
  {
    box,
    materials,
    collisionBoxes,
    trackPlacements = false,
  }: { box: BoxFactory; materials: Materials; collisionBoxes: Mesh[]; trackPlacements?: boolean },
) {
  const instances = new Map<string, Mesh[]>();
  const models = new Map<string, ModelInstance[]>();
  const occluders: OccludingStructure[] = [];

  function boxFromBounds(
    name: string,
    bounds: Bounds,
    material?: PBRMaterial,
    collision?: boolean,
  ) {
    const center = bounds.map(([min, max]) => (min + max) / 2) as Point3;
    const size = bounds.map(([min, max]) => max - min) as Point3;
    return box(name, center, size, material, collision);
  }

  function placeZone(zone: string) {
    const placements = level.zones[zone]!.map((wall) => {
      if (!wall.frame) return wall;
      const frame = level.doorFrames?.[wall.frame];
      if (!frame || !wall.bounds || !wall.openingAxis)
        throw Error(`Missing wall or frame geometry: ${wall.id}`);
      return {
        ...wall,
        openings: [
          openingForFrame({ ...wall, bounds: wall.bounds, openingAxis: wall.openingAxis }, frame),
        ],
      };
    });
    for (const placement of placements) {
      const { id, name, prefab: prefabId, bounds, position } = placement;
      const prefab = catalog.prefabs[prefabId];
      if (!prefab) throw Error(`Unknown environment prefab: ${prefabId}`);
      if (instances.has(id)) throw Error(`Duplicate environment object: ${id}`);
      const hasOpenings = placement.openings !== undefined;
      if (
        hasOpenings &&
        (prefab.model ||
          prefab.parts.length !== 1 ||
          prefab.parts[0]!.shape ||
          prefab.parts[0]!.offset)
      ) {
        throw Error(`Wall ${id} needs a single box prefab for openings`);
      }
      const shape = prefab.parts[0]!.shape;
      if (
        placement.lightTiles &&
        (prefab.model || prefab.parts.length !== 1 || (shape && shape !== 'ground'))
      ) {
        throw Error(`Lighting tiles need a box or ground prefab: ${id}`);
      }
      const exteriorFace = placement.exteriorFace && {
        ...placement.exteriorFace,
        material: materials[placement.exteriorFace.material]!,
      };
      if (exteriorFace && (!bounds || shape || prefab.model || prefab.parts.length !== 1)) {
        throw Error(`An exterior face needs a structural box: ${id}`);
      }
      let parts = prefab.parts.flatMap((part) => {
        const material = part.material ? materials[part.material] : undefined;
        if (part.material && !material)
          throw Error(`Unknown environment material: ${part.material}`);
        const partName = part.name ?? name;
        if (part.shape === 'ground') {
          const [width, , height] = placement.size ?? part.size!;
          const ground = MeshBuilder.CreateGround(partName, { width, height }, scene);
          ground.position.set(...position!);
          ground.material = material!;
          ground.receiveShadows = true;
          ground.checkCollisions = part.collision!;
          if (part.collision) collisionBoxes.push(ground);
          return ground;
        }
        const frame = placement.frame && level.doorFrames?.[placement.frame];
        if (frame && frame.shape !== 'flat') {
          const masonry = createDoorwayWall(
            scene,
            { ...placement, bounds: bounds!, openingAxis: placement.openingAxis! },
            frame,
            material!,
            exteriorFace?.material,
          );
          for (const mesh of masonry) {
            mesh.checkCollisions = part.collision!;
            if (part.collision) collisionBoxes.push(mesh);
          }
          return masonry;
        }
        if (hasOpenings) {
          return wallSections({
            ...placement,
            bounds: bounds!,
            openingAxis: placement.openingAxis!,
            openings: placement.openings!,
          }).map((section, index) =>
            boxFromBounds(`${partName} ${index + 1}`, section, material, part.collision),
          );
        }
        if (bounds) return boxFromBounds(partName, bounds, material, part.collision);
        const center = part.offset
          ? (position!.map((value, axis) => value + part.offset![axis]!) as Point3)
          : position!;
        return box(partName, center, placement.size ?? part.size!, material, part.collision);
      });
      if (placement.heading) {
        const yaw = (placement.heading * Math.PI) / 180,
          [cx, , cz] = position!;
        for (const mesh of parts) {
          const dx = mesh.position.x - cx,
            dz = mesh.position.z - cz;
          mesh.position.x = cx + dx * Math.cos(yaw) + dz * Math.sin(yaw);
          mesh.position.z = cz - dx * Math.sin(yaw) + dz * Math.cos(yaw);
          mesh.rotation.y += yaw;
        }
      }
      parts = parts.flatMap((source) => {
        // The cut face and its exterior finish already follow the frame contour.
        if (source.metadata?.contouredDoorway) return [source];
        const tiles =
          placement.lightTiles || exteriorFace
            ? createLightingTiles(scene, source, placement.lightTiles, exteriorFace)
            : [];
        if (bounds && !shape && !prefab.model)
          occluders.push({ source, surfaces: tiles.length ? tiles : [source] });
        return [source, ...tiles];
      });
      for (const [index, mesh] of parts.entries()) {
        mesh.metadata = {
          lightingZone: zone === 'readingShelves' ? 'readingRoom' : zone,
          ...mesh.metadata,
        };
        if (placement.castShadow === false && mesh.metadata.castShadow === undefined)
          mesh.metadata.castShadow = false;
        // glTF preserves extras so the overhead gallery can open the roof across languages.
        if (placement.galleryCutaway) mesh.metadata.gltf = { extras: { galleryCutaway: true } };
        if (trackPlacements) mesh.metadata.levelPlacement = { id, zone, part: index + 1 };
      }
      instances.set(id, parts);
      if (prefab.model) {
        const { path } = prefab.model;
        if (!models.has(path)) models.set(path, []);
        models.get(path)!.push({
          id,
          mount: parts[0]!,
          fitToBox: prefab.model.fitToBox,
          transform: placement.model,
        });
      }
    }
    return placements;
  }

  async function loadModels() {
    await Promise.all(
      [...models].map(async ([path, placements]) => {
        const {
          meshes: [source],
        } = await ImportMeshAsync('./' + path, scene);
        if (!source) throw Error(`Model contains no root mesh: ${path}`);
        const originalScale = source.scaling.clone();
        for (const [index, { id, mount, fitToBox, transform }] of placements.entries()) {
          const root = index === 0 ? source : source.clone(id, null)!;
          const halfSize = mount.getBoundingInfo().boundingBox.extendSize;
          // GLBs sit at the bottom center of the collider and follow it when it moves.
          if (transform) {
            const pivot = new TransformNode(id + ' model', scene);
            pivot.parent = mount;
            pivot.position.y = -halfSize.y;
            pivot.rotation.y = ((transform.yawDegrees ?? 0) * Math.PI) / 180;
            if (transform.scale) pivot.scaling.set(...transform.scale);
            root.parent = pivot;
            root.position.y = 0;
          } else {
            root.parent = mount;
            root.position.y = -halfSize.y;
          }
          if (fitToBox) root.scaling.copyFrom(originalScale).multiplyInPlace(halfSize.scale(2));
          mount.isVisible = false;
          for (const mesh of root.getChildMeshes()) {
            mesh.receiveShadows = true;
            mesh.metadata = { ...mesh.metadata, lightingZone: mount.metadata?.lightingZone };
            if (mount.metadata?.castShadow === false) mesh.metadata.castShadow = false;
          }
        }
      }),
    );
  }

  return {
    placeZone,
    loadModels,
    occluders,
    get: (id: string) => instances.get(id)?.[0],
    parts: (id: string) => instances.get(id) ?? [],
  };
}

// Each uninterrupted wall samples the same world-space courses across its component boxes.
export function tileEnvironmentSurfaces(scene: Scene, materials: Materials) {
  for (const surface of catalog.tiledSurfaces) {
    const matched = surface.materials
      .map((id) => materials[id])
      .filter((material): material is PBRMaterial => !!material);
    if (matched.length) tileStructure(scene, matched, surface);
  }
}

export function bakeFloorContactShadows(
  scene: Scene,
  floor: AbstractMesh,
  fixtures: readonly AbstractMesh[],
) {
  const footprint = (mesh: AbstractMesh) => {
    mesh.computeWorldMatrix(true);
    const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
    return { min, max };
  };
  const { min, max } = footprint(floor);
  const shadows = fixtures.map(footprint);
  const width = 128,
    height = 128,
    falloff = 0.48;
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const z = min.z + ((row + 0.5) / height) * (max.z - min.z);
    for (let col = 0; col < width; col++) {
      const x = min.x + ((col + 0.5) / width) * (max.x - min.x);
      let distance = falloff;
      for (const { min: near, max: far } of shadows) {
        const dx = Math.max(near.x - x, 0, x - far.x);
        const dz = Math.max(near.z - z, 0, z - far.z);
        distance = Math.min(distance, Math.hypot(dx, dz));
      }
      const t = distance / falloff;
      const shade = Math.round(255 * (0.33 + 0.67 * t * t * (3 - 2 * t)));
      const offset = (row * width + col) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = shade;
      pixels[offset + 3] = 255;
    }
  }
  const contact = RawTexture.CreateRGBATexture(
    pixels,
    width,
    height,
    scene,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  contact.name = 'reading room furniture contact shadows';
  contact.gammaSpace = false;
  contact.wrapU = contact.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = floor.material as PBRMaterial;
  material.ambientTexture = contact;
  material.ambientTextureStrength = 0.86;
  material.ambientTextureImpactOnAnalyticalLights = 0.72;
  material.useAmbientInGrayScale = true;
}

function tileStructure(
  scene: Scene,
  materials: PBRMaterial[],
  { path, normal, tileMeters: size, tint, alignGrain }: SurfaceSpec,
) {
  function mirroredTile(path: string) {
    const tile = new Texture('./' + path, scene);
    tile.wrapU = tile.wrapV = Texture.MIRROR_ADDRESSMODE;
    tile.anisotropicFilteringLevel = 8;
    return tile;
  }
  const tile = mirroredTile(path);
  const relief = normal ? mirroredTile(normal.path) : null;
  if (relief && normal) relief.level = normal.level;
  for (const material of materials) {
    material.albedoTexture = tile;
    material.albedoColor = Color3.FromHexString(tint);
    if (relief) material.bumpTexture = relief;
  }
  for (const mesh of scene.meshes) {
    if (!materials.some((surface) => surface === mesh.material)) continue;
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind),
      normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    if (!positions || !normals) continue;
    const { x: width, y: height, z: depth } = mesh.getBoundingInfo().boundingBox.extendSize;
    const uv = [];
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]! + mesh.position.x,
        y = positions[i + 1]! + mesh.position.y,
        z = positions[i + 2]! + mesh.position.z;
      const nx = Math.abs(normals[i]!),
        ny = Math.abs(normals[i + 1]!),
        nz = Math.abs(normals[i + 2]!);
      const top = ny > nx && ny > nz;
      const side = nx > nz;
      const u = top || !side ? x : z;
      const v = top ? z : y;
      const vertical = alignGrain && (top ? depth > width : height > (side ? depth : width));
      if (vertical) uv.push(v / size, -u / size);
      else uv.push(u / size, v / size);
    }
    mesh.setVerticesData(VertexBuffer.UVKind, uv);
  }
}
