import type { Scene, AbstractMesh, Matrix, Mesh, Material } from '@babylonjs/core';
import type { WallLightOcclusion } from '../../../app/lighting/wall-light-occlusion.ts';
import {
  Color3,
  MeshBuilder,
  RenderTargetTexture,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { glowMaterial, glowPlane } from '../effects/spell-glow.ts';
import { lightReachesBounds } from '../lighting/light-surfaces.ts';
import { ScopedPointLight } from '../lighting/scoped-point-light.ts';
import { SHADOW_QUALITY } from '../lighting/shadow-quality.ts';

const surfacePadding = 0.7;
const surfaceStep = 0.28;
const lightPositionTolerance = 0.002;
const flameBase = 0.404;
export const torchNearPlane = 0.085;
export const torchFlameRadius = 0.21;

export type ShadowPreset = keyof typeof SHADOW_QUALITY;

export function createTorch(
  scene: Scene,
  rig: TransformNode,
  wallLightOcclusion?: WallLightOcclusion,
  opaqueWalls: ReadonlySet<AbstractMesh> = new Set(),
  viewmodelMeshes?: ReadonlySet<AbstractMesh>,
) {
  const meshes: Mesh[] = [];
  const grip = Vector3.Zero();
  const tip = new Vector3(0, 0, flameBase + 0.076);

  function surface(name: string, color: string, emissive = false) {
    const material = new StandardMaterial(name, scene);
    if (emissive) {
      material.disableLighting = true;
      material.emissiveColor = Color3.FromHexString(color);
      material.diffuseColor = Color3.Black();
    } else {
      material.diffuseColor = Color3.FromHexString(color);
      material.specularColor = new Color3(0.11, 0.09, 0.06);
    }
    return material;
  }

  function part(mesh: Mesh, material: Material, height: number) {
    mesh.parent = rig;
    mesh.material = material;
    mesh.position.z = height;
    mesh.rotation.x = Math.PI / 2;
    meshes.push(mesh);
    return mesh;
  }

  const wood = surface('weathered torch wood', '#68412b');
  const iron = surface('scorched torch iron', '#4a3d33');
  const wrap = surface('charred wick', '#36251a');
  const handle = part(
    MeshBuilder.CreateCylinder(
      'torch handle',
      { height: 0.63, diameterTop: 0.06, diameterBottom: 0.045, tessellation: 9 },
      scene,
    ),
    wood,
    0.06,
  );
  part(
    MeshBuilder.CreateCylinder(
      'torch wick',
      { height: 0.2, diameterTop: 0.134, diameterBottom: 0.081, tessellation: 9 },
      scene,
    ),
    wrap,
    0.344,
  );
  for (const [height, diameter] of [
    [-0.21, 0.058],
    [0.26, 0.092],
    [0.33, 0.11],
    [0.4, 0.124],
  ] as const) {
    part(
      MeshBuilder.CreateTorus(
        'torch iron band',
        { diameter, thickness: 0.012, tessellation: 12 },
        scene,
      ),
      iron,
      height,
    );
  }

  const fire = new TransformNode('torch flame', scene);
  fire.parent = rig;
  fire.position.z = flameBase;
  const outer = surface('flame outer orange', '#ee7632', true);
  const core = surface('flame bright core', '#ffe092', true);
  outer.alpha = 0.82;
  outer.disableDepthWrite = true;
  const tongues: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const profile = [
      [0.035, 0],
      [0.059, 0.039],
      [0.05, 0.111],
      [0.025, 0.201],
      [0, 0.274],
    ];
    const flame = MeshBuilder.CreateLathe(
      'flickering flame',
      {
        shape: profile.map(([radius, height]) => new Vector3(radius, height, 0)),
        tessellation: 9,
      },
      scene,
    );
    flame.parent = fire;
    flame.material = i === 0 ? core : outer;
    flame.metadata = { animatedScale: true };
    flame.rotation.x = Math.PI / 2;
    meshes.push(flame);
    tongues.push(flame);
  }
  const haloSocket = new TransformNode('torch halo socket', scene);
  haloSocket.parent = fire;
  haloSocket.position.z = 0.105;
  const halo = glowPlane(
    scene,
    'torch amber halo',
    glowMaterial(scene, 'torch halo', new Color3(1, 0.43, 0.13)),
  );
  halo.parent = haloSocket;
  halo.setEnabled(true);
  meshes.push(halo);

  const sparkMaterial = surface('ember glow', '#ffad56', true);
  const sparks = Array.from({ length: 6 }, () => {
    const spark = MeshBuilder.CreatePolyhedron('torch ember', { type: 1, size: 0.007 }, scene);
    spark.parent = fire;
    spark.material = sparkMaterial;
    meshes.push(spark);
    return spark;
  });

  const light = new ScopedPointLight('handheld torch light', Vector3.Zero(), scene);
  light.diffuse = new Color3(1, 0.65, 0.29);
  light.specular = new Color3(0.28, 0.13, 0.047);
  light.range = 4.2;
  // Babylon adds this after the fixed lights when the carried flame reaches a mesh.
  light.metadata = { carriedTorch: true };
  light.shadowMinZ = torchNearPlane;
  light.shadowMaxZ = light.range;
  let quality = SHADOW_QUALITY.balanced;
  const shadows = new ShadowGenerator(quality.torch, light);
  shadows.usePoissonSampling = true;
  shadows.bias = 0.0008;
  shadows.normalBias = 0.016;
  shadows.setDarkness(0.05);
  const faceCasters = Array.from({ length: 6 }, (): AbstractMesh[] => []);
  const faces = faceCasters.map((_, index) => {
    const direction = light.getShadowDirection(index);
    const [axis, horizontal, vertical] = direction.x
      ? (['x', 'y', 'z'] as const)
      : direction.y
        ? (['y', 'x', 'z'] as const)
        : (['z', 'x', 'y'] as const);
    return { axis, forward: direction[axis] > 0, horizontal, vertical };
  });
  let useFaceCasters = false;
  function configureShadowMap(map: RenderTargetTexture) {
    map.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
    map.getCustomRenderList = (face) => (useFaceCasters ? (faceCasters[face] ?? null) : null);
  }
  configureShadowMap(shadows.getShadowMap()!);
  // An empty Babylon inclusion list would apply the light to every mesh.
  light.setReceivers([handle]);
  const lightPosition = Vector3.Zero();
  const lastSurfacePosition = Vector3.Zero();
  const receivers: AbstractMesh[] = [handle];
  let nextCasters: AbstractMesh[] = [];
  let shadowDirty = true;
  const movingCasterState = new Map<AbstractMesh, { enabled: boolean; matrix: Matrix }>();
  let nextSurfaceRefresh = -Infinity;
  let lit = false;
  let ignitionClock = 0;

  function canReceive(mesh: AbstractMesh) {
    return (
      mesh !== handle &&
      !viewmodelMeshes?.has(mesh) &&
      mesh.isVisible &&
      mesh.isEnabled() &&
      mesh.getTotalVertices() &&
      mesh.material &&
      !('disableLighting' in mesh.material && mesh.material.disableLighting) &&
      !('unlit' in mesh.material && mesh.material.unlit)
    );
  }

  function castsShadow(mesh: AbstractMesh) {
    return (
      mesh !== handle &&
      !mesh.metadata?.toolVisual &&
      (mesh.metadata?.castShadow !== false || opaqueWalls.has(mesh)) &&
      !mesh.material!.needAlphaBlendingForMesh(mesh)
    );
  }

  function updateSurfaces(clock: number) {
    if (
      clock < nextSurfaceRefresh &&
      Vector3.DistanceSquared(lightPosition, lastSurfacePosition) < surfaceStep ** 2
    )
      return;
    lastSurfacePosition.copyFrom(lightPosition);
    nextSurfaceRefresh = clock + 0.5;
    const scope = { position: lightPosition, range: light.range + surfacePadding };
    receivers.length = 1;
    nextCasters.length = 0;
    const isOccluded = wallLightOcclusion?.(lightPosition, scope.range);
    for (const mesh of scene.meshes) {
      if (!canReceive(mesh)) continue;
      // A transform may have changed in the current render ID (including a parent).
      // Only force that case; stationary architecture keeps its cached world matrix.
      mesh.computeWorldMatrix(!mesh.isSynchronized());
      const bounds = mesh.getBoundingInfo().boundingBox;
      if (!lightReachesBounds(scope, bounds)) continue;
      // Shadow receivers can sample the wall's occlusion without changing shaders
      // when a corner moves in or out of the coarse bounds test.
      if (
        (quality.torch && mesh.receiveShadows) ||
        !isOccluded?.(bounds.minimumWorld, bounds.maximumWorld)
      )
        receivers.push(mesh);
      if (quality.torch && castsShadow(mesh)) nextCasters.push(mesh);
    }
    light.setReceivers(receivers);
    const map = shadows.getShadowMap()!;
    const currentCasters = map.renderList!;
    if (
      nextCasters.length !== currentCasters.length ||
      nextCasters.some((mesh, index) => mesh !== currentCasters[index])
    ) {
      map.renderList = nextCasters;
      nextCasters = currentCasters;
      movingCasterState.clear();
      shadowDirty = true;
    }
  }

  function prepareLighting() {
    // Compile the point-light variant while the loading screen covers the canvas.
    useFaceCasters = false;
    Vector3.TransformCoordinatesToRef(tip, rig.computeWorldMatrix(true), light.position);
    light.setReceivers([handle, ...scene.meshes.filter(canReceive)]);
    shadows.getShadowMap()!.renderList = light.includedOnlyMeshes.filter(
      (mesh) =>
        castsShadow(mesh) &&
        (mesh.skeleton || lightReachesBounds(light, mesh.getBoundingInfo().boundingBox)),
    );
    light.setEnabled(true);
    fire.setEnabled(true);
    return () => {
      fire.setEnabled(false);
      light.setEnabled(false);
      light.setReceivers([handle]);
      shadows.getShadowMap()!.renderList = [];
      light.shadowEnabled = quality.torch > 0;
    };
  }

  function setShadowQuality(preset: ShadowPreset) {
    quality = SHADOW_QUALITY[preset];
    light.shadowEnabled = quality.torch > 0;
    if (quality.torch && shadows.mapSize !== quality.torch) {
      const { renderList } = shadows.getShadowMap()!;
      shadows.mapSize = quality.torch;
      const map = shadows.getShadowMap()!;
      map.renderList = renderList;
      configureShadowMap(map);
    }
    nextSurfaceRefresh = -Infinity;
    shadowDirty = true;
  }

  function updateShadow() {
    // Commit a single position for light shading and all six faces of the map.
    // Keep both at the last pose for tiny idle movements under two millimeters.
    if (
      !quality.torch ||
      Vector3.DistanceSquared(lightPosition, light.position) >= lightPositionTolerance ** 2
    ) {
      light.position.copyFrom(lightPosition);
      shadowDirty = true;
    }
    if (!quality.torch) return;
    const map = shadows.getShadowMap()!;
    for (const mesh of map.renderList!) {
      if (!mesh.metadata?.movingShadowCaster) continue;
      const enabled = mesh.isEnabled(),
        matrix = mesh.computeWorldMatrix(true);
      const before = movingCasterState.get(mesh);
      if (before?.enabled === enabled && before.matrix.equals(matrix)) continue;
      movingCasterState.set(mesh, { enabled, matrix: matrix.clone() });
      shadowDirty = true;
    }
    if (!shadowDirty) return;
    const origin = light.position;
    for (const [face, list] of faceCasters.entries()) {
      list.length = 0;
      const { axis, forward, horizontal, vertical } = faces[face]!;
      for (const mesh of map.renderList!) {
        const { minimumWorld: min, maximumWorld: max } = mesh.getBoundingInfo().boundingBox;
        // A 90-degree face can only see lateral distances below its forward depth.
        // Include both faces for edge casters and allow for the normal bias.
        const depth = (forward ? max[axis] - origin[axis] : origin[axis] - min[axis]) + 0.05;
        if (
          depth < 0 ||
          max[horizontal] < origin[horizontal] - depth ||
          min[horizontal] > origin[horizontal] + depth ||
          max[vertical] < origin[vertical] - depth ||
          min[vertical] > origin[vertical] + depth
        )
          continue;
        list.push(mesh);
      }
    }
    useFaceCasters = true;
    map.resetRefreshCounter();
    shadowDirty = false;
  }

  function update({
    lit: enabled,
    clock,
    equipped = enabled,
    viewScale = 1,
  }: {
    lit: boolean;
    clock: number;
    equipped?: boolean;
    viewScale?: number;
  }) {
    if (!equipped || !enabled) {
      if (lit) {
        fire.setEnabled(false);
        // Keep this local receiver set and its material variants resident.
        // Zero intensity extinguishes the light; the render-once shadow map
        // stays frozen until the next lit update checks the current casters.
        light.intensity = 0;
        lit = false;
      }
      return;
    }
    Vector3.TransformCoordinatesToRef(tip, rig.computeWorldMatrix(true), lightPosition);
    if (!lit) nextSurfaceRefresh = -Infinity;
    updateSurfaces(clock);
    if (!lit) {
      lit = true;
      light.position.copyFrom(lightPosition);
      shadowDirty = true;
      ignitionClock = clock;
      fire.setEnabled(true);
      light.setEnabled(true);
    }
    const flutter = 0.62 * Math.sin(clock * 8.1) + 0.38 * Math.sin(clock * 15.7 + 0.8);
    const ignition = Math.min(1, (clock - ignitionClock) / 0.18);
    // In tight first-person poses, the smaller rendered flame is closer to the
    // wall. Reduce its flux with its area while keeping some room illumination.
    const flux = 0.1 + 0.9 * viewScale ** 2;
    light.intensity = (8.2 + flutter * 0.38) * (0.1 + 0.9 * ignition) * flux;
    updateShadow();
    halo.scaling.setAll(0.49 + 0.06 * flutter);
    halo.visibility = 0.54 + 0.08 * flutter;
    for (const [i, flame] of tongues.entries()) {
      const phase = clock * (9 + i * 1.8) + i * 2.3,
        lean = Math.sin(phase);
      flame.position.set((i - 1) * 0.025 + lean * 0.014, 0.012 * Math.cos(phase), 0.011 * i);
      flame.scaling.set(
        0.76 + i * 0.12,
        (i === 0 ? 0.76 : 0.87) + 0.18 * Math.sin(phase + 0.6),
        0.72 + i * 0.12,
      );
      flame.rotation.y = 0.1 * lean;
    }
    for (const [i, spark] of sparks.entries()) {
      const rise = (clock * (1.1 + i * 0.065) + i * 0.163) % 1;
      const drift = 0.025 + 0.079 * rise;
      spark.position.set(
        Math.sin(i * 2.4 + rise * 3) * drift,
        Math.cos(i * 2.4 + rise * 3) * drift,
        0.09 + 0.39 * rise,
      );
      spark.scaling.setAll(1 - 0.82 * rise);
      spark.visibility = 1 - rise;
    }
  }

  fire.setEnabled(false);
  light.setEnabled(false);
  light.intensity = 0;
  return {
    meshes,
    tip,
    form: 'torch' as const,
    file: null,
    update,
    prepareLighting,
    setShadowQuality,
    grips: () => ({ trigger: grip, support: grip }),
    lightState: () => ({
      lit,
      intensity: light.intensity,
      range: light.range,
      shadowSize: quality.torch,
      position: light.position.asArray(),
    }),
  };
}
