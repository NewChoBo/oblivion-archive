import { Quaternion, Vector3, type Bone, type Matrix, type Skeleton } from '@babylonjs/core';
import { DEFAULT_HUMANOID } from '../../../content/catalogs/humanoids.ts';

const { clips } = DEFAULT_HUMANOID;
// One cycle returns to the same supporting foot. Distances are in unscaled rig units,
// measured from the stance ankle's travel per source frame times the clip period.
// Offsets put the right ankle under the pelvis at phase zero for every moving clip.
function gaitSample(source: Skeleton, clip: string, offset: number, stride: number) {
  const range = source.getAnimationRange(clip);
  if (!range) throw Error('Missing Y Bot clip: ' + clip);
  // The last key closes the loop and does not add a stationary frame.
  return {
    clip,
    from: range.from,
    period: range.to - range.from,
    offset,
    stride,
    target: 0,
    weight: 0,
    a: 0,
    b: 0,
    fraction: 0,
    blend: 0,
  };
}

// The lateral clips turn the hips but hold their height constant, floating the
// boot soles at mid-step. Project the bind-pose heel, ball and toe through the
// authored leg chains at load time. This preserves every knee and ankle angle.
function groundStrafes(source: Skeleton, positions: Vector3[]) {
  const toes = source.bones.filter((b) => b.name.endsWith('Toe_End'));
  if (toes.length !== 2) throw Error('Missing Y Bot toe joints');
  const heel = Vector3.Zero(),
    ball = Vector3.Zero(),
    toe = Vector3.Zero();
  for (const name of [clips.left, clips.right]) {
    const range = source.getAnimationRange(name)!;
    for (let frame = range.from; frame < range.to; frame++) {
      let sole = Infinity;
      for (const tip of toes) {
        toe.set(0, 0.01, 0);
        ball.setAll(0);
        heel.set(0, -0.096, -0.056);
        const base = tip.getParent()!;
        for (let bone: Bone | null = tip; bone; bone = bone.getParent()) {
          const m: Matrix = bone.animations[0]!.getKeys()[frame]!.value;
          Vector3.TransformCoordinatesToRef(toe, m, toe);
          if (bone !== tip) Vector3.TransformCoordinatesToRef(ball, m, ball);
          if (bone !== tip && bone !== base) Vector3.TransformCoordinatesToRef(heel, m, heel);
        }
        sole = Math.min(sole, heel.y, ball.y, toe.y);
      }
      positions[frame]!.y -= sole;
    }
  }
}

// All dummy3 tracks have one local matrix per integer frame, unit scale, and
// fixed bone lengths. Only the hips translate. Decode once for all scene instances.
function readTracks(source: Skeleton) {
  const positions: Vector3[] = [];
  const rotations = source.bones.map((bone) => {
    const track = bone.animations[0];
    if (track?.targetProperty !== '_matrix')
      throw Error('Missing Y Bot matrix track: ' + bone.name);
    const keys = track.getKeys();
    const values = keys.map((key, i) => {
      if (key.frame !== i) throw Error('Unexpected Y Bot key spacing: ' + bone.name);
      const rotation = new Quaternion();
      const matrix: Matrix = key.value;
      matrix.decompose(undefined, rotation);
      if (!bone.getParent()) positions.push(matrix.getTranslation());
      return rotation;
    });
    // End sites and eyes have no animated rotation.
    return values.every((q) => Math.abs(Quaternion.Dot(q, values[0]!)) > 1 - 1e-10) ? null : values;
  });
  groundStrafes(source, positions);
  return { positions, rotations };
}

const decoded = new WeakMap<Skeleton, ReturnType<typeof readTracks>>();

export class HumanoidGait {
  private readonly tracks;
  private readonly samples;
  private readonly motions;
  private readonly active: ReturnType<typeof gaitSample>[] = [];
  private readonly fps;
  private backwardStance = false;
  private readonly hips;
  private readonly positions;
  private readonly localPosition = Vector3.Zero();
  private readonly rotation = Quaternion.Identity();
  private readonly localRotation = Quaternion.Identity();
  private idleTime = 0;
  cycle = 0;
  clip: string = clips.idle;

  constructor(source: Skeleton, skeleton: Skeleton) {
    const keys = decoded.get(source) ?? readTracks(source);
    decoded.set(source, keys);
    this.positions = keys.positions;
    this.hips = skeleton.bones[0]!.getTransformNode()!;
    this.tracks = skeleton.bones.flatMap((bone, i) => {
      const rotations = keys.rotations[i];
      return rotations ? [{ bone, rotations, node: bone.getTransformNode() }] : [];
    });
    this.fps = source.bones[0]!.animations[0]!.framePerSecond;
    this.motions = {
      idle: gaitSample(source, clips.idle, 0, 0),
      walk: gaitSample(source, clips.walk, 34, 1.72),
      backWalk: gaitSample(source, clips.walk, 34, -1.72),
      run: gaitSample(source, clips.run, 20, 3),
      backRun: gaitSample(source, clips.run, 20, -3),
      left: gaitSample(source, clips.left, 0, 1.72),
      right: gaitSample(source, clips.right, 0, 1.72),
      backLeft: gaitSample(source, clips.right, 0, -1.72),
      backRight: gaitSample(source, clips.left, 0, -1.72),
    };
    this.samples = Object.values(this.motions);
    this.reset();
  }

  reset() {
    this.idleTime = this.cycle = 0;
    this.backwardStance = false;
    for (const s of this.samples) s.weight = Number(s.clip === clips.idle);
    this.update(0, false, 0, 0, false, 0, 1);
  }

  update(
    speed: number,
    backward: boolean,
    dt: number,
    x: number,
    running: boolean,
    distance: number,
    scale: number,
  ) {
    const side = Math.min(1, Math.abs(x));
    const front = Math.sqrt(1 - side * side);
    const lateral = side / (side + front);
    const { idle, walk, backWalk, run, backRun, left, right, backLeft, backRight } = this.motions;
    for (const s of this.samples) s.target = 0;
    if (speed >= 0.035) {
      // Keep the pelvis facing the same way when a rear diagonal becomes a pure
      // strafe. A little steering noise must not turn it through 150 degrees.
      if (front > 0.3) this.backwardStance = backward;
      const along = this.backwardStance ? (running ? backRun : backWalk) : running ? run : walk;
      // The opposite strafe, played backwards, shares the backing walk's stance.
      const across = this.backwardStance ? (x < 0 ? backLeft : backRight) : x < 0 ? left : right;
      along.target = 1 - lateral;
      across.target = lateral;
      const stride =
        Math.abs(along.stride) * along.target + Math.abs(across.stride) * across.target;
      this.cycle = (this.cycle + distance / (scale * stride)) % 1;
      this.clip = (lateral > 0.5 ? across : along).clip;
    } else {
      idle.target = 1;
      this.clip = idle.clip;
      if (idle.weight === 1) this.backwardStance = false;
    }
    this.idleTime = (this.idleTime + dt * this.fps) % idle.period;

    let largestChange = 0;
    for (const s of this.samples)
      largestChange = Math.max(largestChange, Math.abs(s.target - s.weight));
    const blendStep = largestChange > 0 ? Math.min(1, dt / (0.16 * largestChange)) : 1;
    let sum = 0;
    this.active.length = 0;
    for (const s of this.samples) {
      s.weight = blendStep === 1 ? s.target : s.weight + (s.target - s.weight) * blendStep;
      if (!s.weight) continue;
      this.active.push(s);
      const phase = s.stride
        ? s.offset + this.cycle * s.period * Math.sign(s.stride)
        : this.idleTime;
      const frame = (phase + s.period) % s.period;
      const integer = Math.floor(frame);
      s.a = s.from + integer;
      s.b = s.from + ((integer + 1) % s.period);
      s.fraction = frame - integer;
      sum += s.weight;
      s.blend = s.weight / sum;
      Vector3.LerpToRef(this.positions[s.a]!, this.positions[s.b]!, s.fraction, this.localPosition);
      if (s.blend === 1) this.hips.position.copyFrom(this.localPosition);
      else Vector3.LerpToRef(this.hips.position, this.localPosition, s.blend, this.hips.position);
    }
    for (const { node, bone, rotations } of this.tracks) {
      // Never blend from a previous frame's IK or equipment overlay.
      const output = node?.rotationQuaternion ?? this.rotation;
      for (const s of this.active) {
        const q = s.blend === 1 ? output : this.localRotation;
        Quaternion.SlerpToRef(rotations[s.a]!, rotations[s.b]!, s.fraction, q);
        if (s.blend < 1) Quaternion.SlerpToRef(output, q, s.blend, output);
      }
      if (!node) bone.setRotationQuaternion(output);
    }
  }

  get supportFoot() {
    // In the middle of stance the ankle travels opposite the body; heel strike and
    // toe-off roll on the foot, and the run includes a flight interval.
    const { idle, run, backRun } = this.motions;
    if (idle.weight > 0.5) return null;
    const halfWindow = 0.17 - 0.085 * (run.weight + backRun.weight);
    if (this.cycle < halfWindow || this.cycle > 1 - halfWindow) return 1;
    if (Math.abs(this.cycle - 0.5) < halfWindow) return 0;
    return null;
  }
}
