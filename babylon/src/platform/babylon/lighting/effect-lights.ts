import {
  Color3,
  Light,
  Vector3,
  type AbstractMesh,
  type BoundingBox,
  type Scene,
} from '@babylonjs/core';
import { ScopedPointLight } from './scoped-point-light.ts';
import { canReceiveEffectLight, lightReachesBounds } from './light-surfaces.ts';

import type { WallLightOcclusion } from '../../../app/lighting/wall-light-occlusion.ts';

export interface EffectEmitter {
  id: number;
  position: Vector3;
  color: string;
  range: number;
  intensity: number;
}

interface LightSlot {
  light: ScopedPointLight;
  id: number | null;
  scopedAt: Vector3;
  scopedRange: number;
  refreshAt: number;
}

interface Receiver {
  mesh: AbstractMesh;
  moving: boolean;
  bounds: BoundingBox;
}

const receiverPadding = 0.35;
const receiverRefreshSeconds = 0.12;

export class EffectLights {
  readonly #scene: Scene;
  readonly #fallback: AbstractMesh;
  readonly #pool: LightSlot[];
  #receivers?: Receiver[];
  #wallOcclusion?: WallLightOcclusion;

  constructor(scene: Scene, fallback: AbstractMesh) {
    this.#scene = scene;
    this.#fallback = fallback;
    this.#pool = Array.from({ length: 2 }, (_, index) => {
      const light = new ScopedPointLight('Effect light ' + (index + 1), Vector3.Zero(), scene);
      light.metadata = { effectLight: true };
      light.falloffType = Light.FALLOFF_GLTF;
      light.renderPriority = -1;
      light.intensity = 0;
      light.shadowEnabled = false;
      light.setReceivers([fallback]);
      light.setEnabled(false);
      return { light, id: null, scopedAt: Vector3.Zero(), scopedRange: 0, refreshAt: -Infinity };
    });
  }

  assignSurfaces(wallOcclusion?: WallLightOcclusion) {
    this.#wallOcclusion = wallOcclusion;
    this.#receivers = this.#scene.meshes.filter(canReceiveEffectLight).map((mesh) => {
      mesh.computeWorldMatrix(true);
      const moving = Boolean(
        mesh.metadata?.movingShadowCaster ||
        mesh.metadata?.playerVisual ||
        mesh.metadata?.inkThreat,
      );
      return { mesh, moving, bounds: mesh.getBoundingInfo().boundingBox };
    });
  }

  async prepare(waitForScene: () => Promise<void>) {
    // Compile the one- and two-light variants while the loading screen is visible.
    if (!this.#receivers) throw new Error('Assign effect light surfaces before preparing lighting');
    const receivers = [this.#fallback, ...this.#receivers.map(({ mesh }) => mesh)];
    try {
      for (const slot of this.#pool) {
        slot.light.setReceivers(receivers.slice());
        slot.light.setEnabled(true);
        await waitForScene();
      }
    } finally {
      this.reset();
    }
  }

  #scope(slot: LightSlot, clock: number, surfaces: readonly Receiver[]) {
    const { light } = slot;
    if (
      light.range === slot.scopedRange &&
      clock < slot.refreshAt &&
      Vector3.DistanceSquared(light.position, slot.scopedAt) < receiverPadding ** 2
    )
      return;
    slot.scopedAt.copyFrom(light.position);
    slot.scopedRange = light.range;
    slot.refreshAt = clock + receiverRefreshSeconds;
    const scope = { position: light.position, range: light.range + receiverPadding };
    const isOccluded = this.#wallOcclusion?.(scope.position, scope.range);
    const receivers = [this.#fallback];
    for (const { mesh, bounds, moving } of surfaces) {
      if (!mesh.isEnabled() || !mesh.isVisible || mesh.isDisposed()) continue;
      if (moving) mesh.computeWorldMatrix(true);
      if (
        lightReachesBounds(scope, bounds) &&
        !isOccluded?.(bounds.minimumWorld, bounds.maximumWorld)
      )
        receivers.push(mesh);
    }
    light.setReceivers(receivers);
  }

  #release(slot: LightSlot) {
    slot.id = null;
    slot.refreshAt = -Infinity;
    slot.light.intensity = 0;
    slot.light.setEnabled(false);
    slot.light.setReceivers([this.#fallback]);
  }

  update(emitters: readonly EffectEmitter[], clock: number) {
    if (!emitters.length) {
      for (const slot of this.#pool) if (slot.id !== null) this.#release(slot);
      return;
    }
    if (!this.#receivers) this.assignSurfaces();
    const selected = emitters.slice(0, this.#pool.length);
    for (const slot of this.#pool) {
      if (slot.id !== null && !selected.some((emitter) => emitter.id === slot.id))
        this.#release(slot);
    }
    for (const emitter of selected) {
      const slot =
        this.#pool.find((entry) => entry.id === emitter.id) ??
        this.#pool.find((entry) => entry.id === null)!;
      const { light } = slot;
      const acquired = slot.id === null;
      if (acquired) {
        slot.id = emitter.id;
        light.diffuse = Color3.FromHexString(emitter.color);
        light.specular = light.diffuse.scale(0.28);
      }
      light.position.copyFrom(emitter.position);
      light.range = emitter.range;
      light.intensity = emitter.intensity;
      this.#scope(slot, clock, this.#receivers!);
      if (acquired) light.setEnabled(true);
    }
  }

  reset() {
    for (const slot of this.#pool) this.#release(slot);
  }

  snapshot() {
    return this.#pool
      .filter((slot) => slot.id !== null)
      .map(({ id, light }) => ({
        id,
        position: light.position.asArray(),
        color: light.diffuse.asArray(),
        range: light.range,
        intensity: light.intensity,
        receivers: light.includedOnlyMeshes.length - 1,
      }));
  }
}
