import { Quaternion, Vector3, type TransformNode } from '@babylonjs/core';
import { HOSTAGE_GUARD, MIRA_HANDS, MIRA_TALK } from '../../../content/catalogs/ally-gestures.ts';
import { reach, type JointChain } from './joint-reach.ts';
import type { instantiateHumanoid } from './sample-humanoid.ts';

type Ally = Awaited<ReturnType<typeof instantiateHumanoid>>;
type Side = 'Left' | 'Right';

function bindAllyRig(actor: Ally, root: TransformNode) {
  function joint(name: string) {
    const node = actor.joints.get(name);
    if (!node) throw new Error('Missing Y Bot ally joint: ' + name);
    return node;
  }
  const chain = (side: Side): JointChain => [
    joint(side + 'Arm'),
    joint(side + 'ForeArm'),
    joint(side + 'Hand'),
  ];
  const arms = { Left: chain('Left'), Right: chain('Right') };
  const spine = joint('Spine'),
    chest = joint('Spine2'),
    neck = joint('Neck');
  const baseArm = Quaternion.Identity(),
    baseElbow = Quaternion.Identity();
  return {
    sample(speed: number, dt: number, lean: number, tuck: number) {
      // The clip owns the frame. Apply only the requested upper-body offset after sampling it.
      actor.update(speed, false, dt);
      spine.rotationQuaternion!.multiplyInPlace(
        Quaternion.RotationAxis(Vector3.RightReadOnly, lean),
      );
      neck.rotationQuaternion!.multiplyInPlace(
        Quaternion.RotationAxis(Vector3.RightReadOnly, tuck),
      );
      chest.computeWorldMatrix(true);
    },
    hand(side: Side, x: number, y: number, z: number, weight: number, roll = 0) {
      if (weight <= 0) return;
      const arm = arms[side];
      const shoulder = arm[0].rotationQuaternion!,
        elbow = arm[1].rotationQuaternion!;
      baseArm.copyFrom(shoulder);
      baseElbow.copyFrom(elbow);
      const facing = root.getWorldMatrix();
      const target = Vector3.TransformNormal(new Vector3(x, y, z), facing).addInPlace(
        chest.getAbsolutePosition(),
      );
      const pole = Vector3.TransformNormal(
        new Vector3(side === 'Left' ? -1 : 1, -0.72, -0.16),
        facing,
      );
      reach(arm, target, pole);
      if (weight < 1) {
        Quaternion.SlerpToRef(baseArm, shoulder, weight, shoulder);
        Quaternion.SlerpToRef(baseElbow, elbow, weight, elbow);
      }
      if (roll)
        arm[2].rotationQuaternion!.multiplyInPlace(
          Quaternion.RotationAxis(Vector3.UpReadOnly, roll * weight),
        );
    },
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const talkDuration = MIRA_TALK[MIRA_TALK.length - 1]!.time;

export class MiraMotion {
  private readonly rig: ReturnType<typeof bindAllyRig>;
  private elapsed = 0;
  private talkTime: number = talkDuration;
  constructor(actor: Ally, root: TransformNode) {
    this.rig = bindAllyRig(actor, root);
    this.update(0);
  }
  talk() {
    if (this.talkTime >= talkDuration) this.talkTime = 0;
  }
  update(dt: number) {
    this.elapsed += dt;
    this.talkTime = Math.min(this.talkTime + dt, talkDuration);
    let offer = 0,
      aside = 0;
    if (this.talkTime < talkDuration) {
      const i = MIRA_TALK.findIndex((cue) => cue.time > this.talkTime);
      const from = MIRA_TALK[i - 1]!,
        to = MIRA_TALK[i]!;
      const blend = smooth((this.talkTime - from.time) / (to.time - from.time));
      offer = from.offer + (to.offer - from.offer) * blend;
      aside = from.aside + (to.aside - from.aside) * blend;
    }
    const turn = Math.sin(this.elapsed * 1.55),
      lift = Math.sin(this.elapsed * 2.1);
    const { left, right } = MIRA_HANDS;
    this.rig.sample(0, dt, 0.035 + 0.07 * offer, 0.04 * aside);
    this.rig.hand(
      'Left',
      left[0] - 0.055 * aside,
      left[1] + 0.01 * lift + 0.09 * aside,
      left[2],
      1,
      -0.16,
    );
    this.rig.hand(
      'Right',
      right[0] + 0.032 * turn + 0.2 * aside,
      right[1] + 0.026 * lift + 0.25 * offer,
      right[2] + 0.11 * offer,
      1,
      0.18 * turn + 0.85 * offer,
    );
  }
}

export class HostageMotion {
  private readonly rig: ReturnType<typeof bindAllyRig>;
  private released = 0;
  private stride = 0;
  constructor(actor: Ally, root: TransformNode) {
    this.rig = bindAllyRig(actor, root);
    this.reset();
  }
  reset() {
    this.released = this.stride = 0;
    this.update(0, false, 0);
  }
  update(dt: number, escorting: boolean, speed: number) {
    const standStep = dt / HOSTAGE_GUARD.standSeconds;
    this.released = Math.max(0, Math.min(1, this.released + (escorting ? standStep : -standStep)));
    const walking = speed >= 0.035;
    this.stride = Math.max(0, Math.min(1, this.stride + ((walking ? 1 : -1) * dt) / 0.3));
    // While following, release the walking arms completely. At a stop the hands come in slightly.
    const guard = 1 - smooth(this.released) * (0.76 + 0.24 * smooth(this.stride));
    const { left, right, spinePitch, neckPitch } = HOSTAGE_GUARD;
    this.rig.sample(speed, dt, spinePitch * guard, neckPitch * guard);
    this.rig.hand('Left', ...left, guard, -0.38);
    this.rig.hand('Right', ...right, guard, 0.28);
  }
}
