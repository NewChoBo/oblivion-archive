import type { Scene, TargetCamera } from '@babylonjs/core';
import type { CharacterPose, HandToolPose, PlayerMovement } from '../equipment/equipment-pose.ts';
import {
  Color3,
  DynamicTexture,
  Matrix,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { postureGaze, POSTURES } from './player-posture.ts';
import { loadSamplePlayer } from '../actors/sample-humanoid.ts';

const boom = 2.85;
const shoulderOffsets = { left: -0.76, center: 0, right: 0.76 };
const bowRoll = 0.7;
const torchDirection = new Vector3(0.14, 0.96, 0.24).normalize();
// Seconds along the shared pose track at its normal crouch and rise speed.
const stanceMark = { standing: 0, crouch: 0.3, prone: 0.86 } as const;
const proneEntrySeconds = 0.34;

export type SweepView = (
  origin: Vector3,
  displacement: Vector3,
  radius: number,
  growth?: number,
) => number;
type Shoulder = keyof typeof shoulderOffsets;
type PlayerActor = Awaited<ReturnType<typeof loadSamplePlayer>>;

export function createPlayerView(
  scene: Scene,
  camera: TargetCamera,
  body: TransformNode,
  sweepView: SweepView,
  reticlePoint: () => Vector3,
) {
  const root = new TransformNode('scribe', scene);
  const toolAnchor = new TransformNode('scribe tool anchor', scene);
  toolAnchor.parent = root;
  root.setEnabled(false);
  const shadow = MeshBuilder.CreateGround(
    'player contact shadow',
    { width: 0.9, height: 0.58 },
    scene,
  );
  shadow.isPickable = false;
  shadow.metadata = { playerVisual: true };
  shadow.setEnabled(false);
  const shadowMap = new DynamicTexture('contact shadow opacity', 64, scene, false);
  const context = shadowMap.getContext(),
    falloff = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  falloff.addColorStop(0, 'rgba(0,0,0,.52)');
  falloff.addColorStop(0.45, 'rgba(0,0,0,.32)');
  falloff.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = falloff;
  context.fillRect(0, 0, 64, 64);
  shadowMap.hasAlpha = true;
  shadowMap.update();
  const shade = new StandardMaterial('player contact shadow ink', scene);
  shade.diffuseTexture = shadowMap;
  shade.useAlphaFromDiffuseTexture = true;
  shade.disableLighting = true;
  shade.diffuseColor = Color3.Black();
  shadow.material = shade;
  let floorY = 0;
  const inverse = Matrix.Identity();
  const localLeft = new Vector3(),
    localRight = new Vector3(),
    forward = new Vector3();
  const eye = new Vector3();
  let crouch = 0,
    prone = 0;
  let stanceTime = 0;
  let actor: PlayerActor | undefined,
    mode = 'first',
    cameraLength = boom,
    opacity = 1,
    bowSpan = 0.3;
  let walking = false,
    running = false,
    stride = 0,
    obstructed = false;
  let torchGripFraction = 1;

  function constrainTorchGrip(hand: Vector3, matrix: Matrix, tool: HandToolPose, dt: number) {
    const tucked = Vector3.TransformCoordinates(new Vector3(0.035, hand.y, -0.04), matrix);
    const desired = Vector3.TransformCoordinates(hand, matrix);
    const reach = desired.subtract(tucked);
    const flame = tucked.add(
      Vector3.TransformNormal(torchDirection.scale(tool.tip.z * tool.scale), matrix),
    );
    const fraction = sweepView(flame, reach, 0.12);
    torchGripFraction = Math.min(fraction, torchGripFraction + dt * 4);
    return tucked.add(reach.scale(torchGripFraction));
  }

  function attachTool(actor: PlayerActor, tool: CharacterPose, roll: number) {
    const { bow, motion } = tool;
    const [left, right] = actor.slots;
    root.computeWorldMatrix(true).invertToRef(inverse);
    for (const [slot, position] of [
      [left, localLeft],
      [right, localRight],
    ] as const) {
      slot.computeWorldMatrix(true);
      Vector3.TransformCoordinatesToRef(slot.getAbsolutePosition(), inverse, position);
    }
    if (bow) {
      // Use the solved draw span before the string hand follows through.
      forward.copyFrom(actor.bowDirection);
      bowSpan = actor.bowSpan;
      toolAnchor.position.copyFrom(localLeft);
    } else {
      if (tool.torch) {
        forward.copyFrom(torchDirection);
      } else {
        // The authored hand socket points along +Y down the length of a held prop.
        Vector3.TransformNormalToRef(Vector3.UpReadOnly, right.getWorldMatrix(), forward);
        Vector3.TransformNormalToRef(forward, inverse, forward);
        forward.normalize();
      }
      toolAnchor.position.copyFrom(localRight);
    }
    toolAnchor.rotation.set(
      -Math.asin(Math.max(-1, Math.min(1, forward.y))),
      Math.atan2(forward.x, forward.z),
      bow ? roll : 0,
    );
    const frame = toolAnchor.computeWorldMatrix(true);
    if (motion && motion.touch > 0) {
      let target;
      if (bow) {
        const nock = tool.bowRest.clone();
        nock.z = -bowSpan / tool.scale;
        const string = Vector3.TransformCoordinates(
          nock.subtract(tool.grip).scale(tool.scale),
          frame,
        );
        target = Vector3.Lerp(actor.quiverPoint(motion.withdraw), string, motion.carry);
      } else {
        target = Vector3.TransformCoordinates(
          motion.freeHand.subtract(tool.grip).scale(tool.scale),
          frame,
        );
      }
      actor.reachRecharge(bow, target, motion.touch);
      const free = bow ? right : left;
      free.computeWorldMatrix(true);
      Vector3.TransformCoordinatesToRef(
        free.getAbsolutePosition(),
        inverse,
        bow ? localRight : localLeft,
      );
      if (bow) {
        const inverseFrame = Matrix.Invert(frame);
        motion.grasp = Vector3.TransformCoordinates(free.getAbsolutePosition(), inverseFrame)
          .scaleInPlace(1 / tool.scale)
          .addInPlace(tool.grip);
        motion.looseDirection = Vector3.TransformNormal(
          Vector3.DownReadOnly,
          inverseFrame,
        ).normalize();
      }
    }
  }

  function placeCamera(dt: number, yaw: number, pitch: number, cameraShoulder: Shoulder) {
    const direction = new Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const shoulder =
      shoulderOffsets[cameraShoulder] * Math.min(1, scene.getEngine().getAspectRatio(camera) / 1.4);
    const arm = direction.scale(-boom).add(right.scale(shoulder));
    // A floor or ceiling contact retracts the whole arm along the view line.
    arm.y += -0.07 + 0.42 * prone;
    const fraction = sweepView(eye, arm, 0.2);
    const wanted = arm.length() * fraction;
    cameraLength =
      wanted < cameraLength ? wanted : cameraLength + (wanted - cameraLength) * Math.min(1, dt * 6);
    camera.position.copyFrom(eye.add(arm.normalize().scale(cameraLength)));
    obstructed = fraction < 0.995;
    opacity = Math.max(0, Math.min(1, (cameraLength - 0.85) / 0.7));
    if (actor) for (const mesh of actor.meshes) mesh.visibility = opacity;
  }

  return {
    toolAnchor,
    async load() {
      actor = await loadSamplePlayer(scene, root, constrainTorchGrip);
    },
    get bowSpan() {
      return bowSpan;
    },
    get eye() {
      return eye;
    },
    resetPosture() {
      stanceTime = crouch = prone = 0;
      actor?.reset();
      cameraLength = boom;
    },
    setDominantHand(hand: string) {
      const side = hand === 'left' ? -1 : 1;
      if (root.scaling.x !== side) {
        root.scaling.x = side;
        actor?.reset();
      }
    },
    setMode(value: string) {
      actor?.reset();
      mode = value;
      root.setEnabled(mode === 'third');
      shadow.setEnabled(mode === 'third');
      cameraLength = boom;
      torchGripFraction = 1;
    },
    update(
      dt: number,
      movement: PlayerMovement,
      tool: CharacterPose | null | undefined,
      cameraShoulder: Shoulder,
    ) {
      const { yaw, pitch, moving, speed, paused, posture = 'standing' } = movement;
      walking = moving;
      running = speed > 3.4;
      if (!paused) {
        stride += (Number(moving) - stride) * (1 - Math.exp(-dt * 12));
        // Drop quickly through the knee and brace keys. Reversals start at the displayed pose.
        const target = stanceMark[posture];
        const step = posture === 'prone' ? dt * (stanceMark.prone / proneEntrySeconds) : dt;
        stanceTime =
          target > stanceTime
            ? Math.min(target, stanceTime + step)
            : Math.max(target, stanceTime - step);
        prone = Math.max(
          0,
          (stanceTime - stanceMark.crouch) / (stanceMark.prone - stanceMark.crouch),
        );
        crouch = Math.min(1, stanceTime / stanceMark.crouch) - prone;
      }
      const floor = movement.groundY ?? body.position.y - POSTURES.standing.halfHeight;
      const rigLift = POSTURES.crouch.rigLift * crouch + POSTURES.prone.rigLift * prone;
      root.position.set(body.position.x, floor + rigLift, body.position.z);
      root.rotation.y = yaw;
      if (!movement.airborne) floorY = floor;
      const targetHeight = POSTURES[posture].eyeHeight;
      const { eyeHeight, eyeForward } = postureGaze(crouch + 2 * prone);
      eye.set(body.position.x, floor + eyeHeight, body.position.z);
      if (eyeHeight > targetHeight + 0.008) {
        // The collider can enter a low opening before the visual transition ends.
        const rise = new Vector3(0, eyeHeight - targetHeight, 0);
        eye.y -= rise.y;
        eye.y += rise.y * sweepView(eye, rise, 0.09);
      }
      // The head moves in front of the hips when crawling. Stop its gaze at cover.
      const lookOffset = new Vector3(Math.sin(yaw) * eyeForward, 0, Math.cos(yaw) * eyeForward);
      eye.addInPlace(lookOffset.scale(sweepView(eye, lookOffset, 0.1)));
      camera.rotation.set(pitch, yaw, 0);
      if (mode === 'first') {
        camera.position.copyFrom(eye);
        obstructed = false;
        return;
      }
      placeCamera(dt, yaw, pitch, cameraShoulder);
      if (actor && tool && !paused) {
        const roll = bowRoll - 0.64 * (tool.motion?.present ?? 0);
        actor.pose(
          dt,
          { ...movement, localX: movement.localX * root.scaling.x, running, stride, crouch, prone },
          { ...tool, bowRoll: roll },
          (tool.bow ? tool.ready : tool.stroke.alignment) > 0.001 ? reticlePoint() : null,
        );
        attachTool(actor, tool, roll);
      }
      shadow.position.set(body.position.x, floorY + 0.023, body.position.z);
      shadow.rotation.y = yaw;
      shadow.scaling.z = 1 + prone * 1.65;
      shadow.visibility =
        opacity * Math.max(0.16, 1 - Math.max(0, root.position.y - floorY) * 0.87);
    },
    snapshot() {
      const mirrored = root.scaling.x < 0;
      const state = actor?.state();
      const physicalPoints = (points: Vector3[]) =>
        (mirrored ? [...points].reverse() : points).map((p) => [p.x * root.scaling.x, p.y, p.z]);
      return {
        mode,
        rigOriginY: root.position.y,
        visible: root.isEnabled(),
        walking,
        running,
        stride,
        ...state,
        supportFoot:
          mirrored && state?.supportFoot != null ? 1 - state.supportFoot : state?.supportFoot,
        feet: physicalPoints(
          actor?.feet.map((foot) => {
            foot.computeWorldMatrix(true);
            return Vector3.TransformCoordinates(foot.getAbsolutePosition(), inverse);
          }) || [],
        ),
        hands: physicalPoints([localLeft, localRight]),
        opacity,
        cameraDistance: cameraLength,
        obstructed,
        toolAnchor: toolAnchor.getAbsolutePosition().asArray(),
        meshCount: actor?.meshes.length || 0,
      };
    },
  };
}
