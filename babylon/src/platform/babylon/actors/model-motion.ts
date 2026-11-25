import {
  Quaternion,
  TransformNode,
  Vector3,
  type Animation,
  type AnimationGroup,
} from '@babylonjs/core';

type Track =
  | { rotation: true; animation: Animation; value: Quaternion; previous: Quaternion }
  | { rotation: false; animation: Animation; value: Vector3; previous: Vector3 };

interface Clip {
  group: AnimationGroup;
  seconds: number;
  tracks: Track[];
}

/** Sample imported glTF tracks on the gameplay clock, including while seeking an attack. */
export class ModelMotion {
  private readonly clips = new Map<string, Clip>();
  private playing?: Clip;
  private blendTime = 0;

  constructor(groups: readonly AnimationGroup[], names: readonly string[]) {
    for (const name of names) {
      const group = groups.find((candidate) => candidate.name === name);
      if (!group?.targetedAnimations.length || group.to <= group.from)
        throw Error('Missing model animation: ' + name);
      const tracks = group.targetedAnimations.map(({ target, animation }): Track => {
        if (!(target instanceof TransformNode)) throw Error('Expected animated node: ' + name);
        if (animation.targetProperty === 'position')
          return { rotation: false, animation, value: target.position, previous: Vector3.Zero() };
        if (animation.targetProperty !== 'rotationQuaternion')
          throw Error('Unexpected model animation channel: ' + animation.targetProperty);
        const value = (target.rotationQuaternion ??= Quaternion.FromEulerVector(target.rotation));
        return { rotation: true, animation, value, previous: Quaternion.Identity() };
      });
      const fps = tracks[0]!.animation.framePerSecond;
      this.clips.set(name, { group, tracks, seconds: (group.to - group.from) / fps });
    }
  }

  loop(name: string, seconds: number, dt: number) {
    const clip = this.clips.get(name)!;
    this.sample(clip, (seconds % clip.seconds) / clip.seconds, dt);
  }

  seek(name: string, fraction: number, dt: number, blend = true) {
    this.sample(this.clips.get(name)!, Math.min(1, Math.max(0, fraction)), dt, blend);
  }

  private sample(clip: Clip, fraction: number, dt: number, blend = true) {
    const transition = 0.1;
    const changing = this.playing !== clip;
    if (changing) {
      this.blendTime = this.playing && blend ? 0 : transition;
      this.playing = clip;
    }
    this.blendTime = Math.min(transition, this.blendTime + dt);
    const weight = this.blendTime / transition;
    const frame = clip.group.from + (clip.group.to - clip.group.from) * fraction;
    for (const track of clip.tracks) {
      if (track.rotation) {
        if (changing && weight < 1) track.previous.copyFrom(track.value);
        const pose: Quaternion = track.animation.evaluate(frame);
        if (weight === 1) track.value.copyFrom(pose);
        else Quaternion.SlerpToRef(track.previous, pose, weight, track.value);
      } else {
        if (changing && weight < 1) track.previous.copyFrom(track.value);
        const pose: Vector3 = track.animation.evaluate(frame);
        if (weight === 1) track.value.copyFrom(pose);
        else Vector3.LerpToRef(track.previous, pose, weight, track.value);
      }
    }
  }
}
