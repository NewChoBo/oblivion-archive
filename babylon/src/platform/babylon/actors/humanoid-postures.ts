import {
  LoadAssetContainerAsync,
  Quaternion,
  Vector3,
  type Animation,
  type AnimationGroup,
  type Scene,
  type TransformNode,
} from '@babylonjs/core';
import type { PoseMovement } from '../equipment/equipment-pose.ts';
import { POSTURE_MOTION } from '../../../content/catalogs/humanoids.ts';

type Stance = 'Crouch' | 'Prone';
type Direction = 'Forward' | 'Back' | 'Left' | 'Right';
type ClipName = 'CrouchDown' | 'LowerToProne' | `${Stance}${Direction | 'Idle'}`;
type Track =
  { animation: Animation; rotation: Quaternion } | { animation: Animation; position: Vector3 };

export async function loadHumanoidPostures(
  scene: Scene,
  joints: ReadonlyMap<string, TransformNode>,
) {
  const asset = await LoadAssetContainerAsync(POSTURE_MOTION.file, scene, {
    pluginOptions: { gltf: { animationStartMode: 0 } },
  });
  try {
    return new HumanoidPostures(asset.animationGroups, joints);
  } finally {
    // Only the keyframes are needed. Rendering uses the original skinned character.
    asset.dispose();
  }
}

export class HumanoidPostures {
  private readonly clips = new Map<string, { from: number; span: number; tracks: Track[] }>();
  private readonly rotation = Quaternion.Identity();
  private readonly position = Vector3.Zero();
  private x = 0;
  private z = 1;
  private breath = 0;
  private crouchGaitWeight = 0;
  phase = 0;
  name: ClipName | undefined;

  constructor(groups: readonly AnimationGroup[], joints: ReadonlyMap<string, TransformNode>) {
    for (const group of groups) {
      const tracks = group.targetedAnimations.map(({ target, animation }): Track => {
        const node = joints.get(target.name.split(':').at(-1));
        if (!node) throw Error('Missing Y Bot posture joint: ' + target.name);
        if (animation.targetProperty === 'position') return { animation, position: node.position };
        if (animation.targetProperty !== 'rotationQuaternion' || !node.rotationQuaternion)
          throw Error('Unexpected Y Bot posture channel: ' + animation.targetProperty);
        return { animation, rotation: node.rotationQuaternion };
      });
      this.clips.set(group.name, { from: group.from, span: group.to - group.from, tracks });
    }
  }
  reset() {
    this.name = undefined;
    this.crouchGaitWeight = 0;
    this.phase = this.breath = this.x = 0;
    this.z = 1;
  }

  private apply(name: ClipName, phase: number, weight: number) {
    if (weight <= 0) return;
    const clip = this.clips.get(name);
    if (!clip) throw Error('Missing Y Bot posture clip: ' + name);
    const frame = clip.from + phase * clip.span;
    for (const track of clip.tracks) {
      // The glTF is right-handed. These tracks bind directly to the native Babylon rig.
      if ('rotation' in track) {
        const q: Quaternion = track.animation.evaluate(frame);
        this.rotation.set(-q.x, -q.y, q.z, q.w);
        if (weight >= 1) track.rotation.copyFrom(this.rotation);
        else Quaternion.SlerpToRef(track.rotation, this.rotation, weight, track.rotation);
      } else {
        const p: Vector3 = track.animation.evaluate(frame);
        this.position.set(p.x, p.y, -p.z);
        if (weight >= 1) track.position.copyFrom(this.position);
        else Vector3.LerpToRef(track.position, this.position, weight, track.position);
      }
    }
  }

  update(dt: number, move: PoseMovement) {
    const level = move.crouch + 2 * move.prone;
    if (level <= 0) {
      this.reset();
      return;
    }
    const stance: Stance = level > 1.5 ? 'Prone' : 'Crouch';
    let settled = Math.max(0, 1 - Math.abs(level - (stance === 'Prone' ? 2 : 1)) / 0.18);
    // Passing crouch height must not start a crouch idle or step. An existing one can fade out.
    if (stance === 'Crouch' && move.posture !== 'crouch') {
      settled = Math.min(settled, this.crouchGaitWeight);
    }
    this.crouchGaitWeight = stance === 'Crouch' ? settled : 0;
    const lowering: ClipName = level <= 1 ? 'CrouchDown' : 'LowerToProne';
    this.name = lowering;
    if (settled < 1)
      this.apply(lowering, level <= 1 ? level : level - 1, Math.min(1, level / 0.15));
    this.breath = (this.breath + dt / 3.4) % 1;
    const distance = move.distance ?? move.speed * dt;
    if (distance > 0 && Math.abs(move.localX) + Math.abs(move.localZ) > 0.001) {
      this.x = move.localX;
      this.z = move.localZ;
    }
    const axes = Math.abs(this.x) + Math.abs(this.z);
    const stride = stance === 'Prone' ? POSTURE_MOTION.crawlStride : POSTURE_MOTION.crouchStride;
    this.phase = (this.phase + (distance * axes) / stride) % 1;
    if (settled === 0) return;
    const idle: ClipName = `${stance}Idle`;
    const walking = Math.min(1, settled * (move.stride > 0.999 ? 1 : move.stride));
    if (walking < 1) this.apply(idle, this.breath, settled);
    const side: ClipName = this.x < 0 ? `${stance}Left` : `${stance}Right`;
    const front: ClipName = this.z < 0 ? `${stance}Back` : `${stance}Forward`;
    const sideWeight = Math.abs(this.x) / axes;
    // Sequential slerps preserve the idle/forward/side proportions on diagonals.
    const lateral = walking * sideWeight;
    if (lateral < 1) this.apply(front, this.phase, (walking * (1 - sideWeight)) / (1 - lateral));
    this.apply(side, this.phase, lateral);
    if (settled > 0.5) this.name = walking < 0.05 ? idle : sideWeight > 0.5 ? side : front;
  }
}
