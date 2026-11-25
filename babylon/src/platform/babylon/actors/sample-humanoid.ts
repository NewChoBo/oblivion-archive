import type { AbstractMesh, AssetContainer, Bone, Scene, Skeleton } from '@babylonjs/core';
import { MultiMaterial, StandardMaterial } from '@babylonjs/core';
import type { HumanoidRole } from '../../../content/catalogs/humanoids.ts';
import type {
  CharacterPose,
  ConstrainTorchGrip,
  PoseMovement,
} from '../equipment/equipment-pose.ts';
import type { JointChain } from './joint-reach.ts';
import {
  Color3,
  LoadAssetContainerAsync,
  Matrix,
  Quaternion,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/core/Loading/Plugins/babylonFileLoader.js';
import { DEFAULT_HUMANOID, HUMANOID_METRICS } from '../../../content/catalogs/humanoids.ts';
import { pointJoint, reach } from './joint-reach.ts';
import { HumanoidGait } from './humanoid-gait.ts';
import { addEnemyHitSurfaces } from './humanoid-hit-surface.ts';
import { loadHumanoidPostures } from './humanoid-postures.ts';

const containers = new WeakMap<Scene, Promise<AssetContainer>>();
const { file, clothing } = DEFAULT_HUMANOID;

// Link only the chains used by each role's pose, leaving the other bones on their authored tracks.
function linkPoseJoints(scene: Scene, skin: AbstractMesh, skeleton: Skeleton, role: HumanoidRole) {
  const nodes = new Map<Bone, TransformNode>();
  function link(bone: Bone): TransformNode {
    const existing = nodes.get(bone);
    if (existing) return existing;
    const node = new TransformNode(bone.name, scene);
    const parent = bone.getParent();
    node.parent = parent ? link(parent) : skin;
    node.rotationQuaternion = Quaternion.Identity();
    bone.getLocalMatrix().decompose(node.scaling, node.rotationQuaternion, node.position);
    bone.linkTransformNode(node);
    nodes.set(bone, node);
    return node;
  }
  for (const bone of skeleton.bones) {
    if (
      /:(?:Left|Right)Hand$/.test(bone.name) ||
      (role !== 'enemy' && bone.name.endsWith(':Head')) ||
      (role === 'player' && /:(?:Left|Right)ToeBase$/.test(bone.name))
    )
      link(bone);
  }
  return new Map([...nodes].map(([bone, node]) => [bone.name.split(':').at(-1)!, node]));
}

export async function instantiateHumanoid(scene: Scene, root: TransformNode, role: HumanoidRole) {
  if (!containers.has(scene)) containers.set(scene, LoadAssetContainerAsync(file, scene));
  const container = await containers.get(scene)!;
  const model = container.instantiateModelsToScene((name) => name, false, {
    doNotInstantiate: true,
  });
  const mount = new TransformNode('Y Bot · ' + role, scene);
  mount.parent = root;
  mount.scaling.setAll(HUMANOID_METRICS[role].scale);
  for (const node of model.rootNodes) node.parent = mount;
  const meshes = mount.getChildMeshes().filter((mesh) => mesh.getTotalVertices() > 0);
  const skin = meshes.find((mesh) => mesh.skeleton);
  if (!skin?.skeleton) throw Error('Y Bot skin missing');
  // Clone the authored MultiMaterial and its submaterials before applying team colors.
  if (!(skin.material instanceof MultiMaterial)) throw Error('Y Bot MultiMaterial missing');
  const material = skin.material.clone('Y Bot · ' + role, true);
  skin.material = material;
  const surface = material.subMaterials.find((material) =>
    material?.name.endsWith('Alpha_Surface_MAT'),
  );
  if (surface instanceof StandardMaterial && role !== 'player')
    surface.diffuseColor = Color3.FromHexString(clothing[role]);
  for (const mesh of meshes) {
    mesh.receiveShadows = true;
    mesh.isPickable = role !== 'player';
    mesh.metadata = { ...mesh.metadata, humanoidRole: role, playerVisual: role === 'player' };
  }

  const skeleton = skin.skeleton;
  const joints = linkPoseJoints(scene, skin, skeleton, role);
  const gait = new HumanoidGait(container.skeletons[0]!, skeleton);
  const invalidateHitSurfaces = role === 'enemy' ? addEnemyHitSurfaces(skin, skeleton) : null;
  function update(
    speed: number,
    backward: boolean,
    dt: number,
    strafe = 0,
    running = false,
    distance = speed * dt,
  ) {
    gait.update(speed, backward, dt, strafe, running, distance, mount.scaling.y);
    invalidateHitSurfaces?.();
  }
  return {
    mount,
    meshes,
    joints,
    update,
    reset() {
      gait.reset();
      invalidateHitSurfaces?.();
    },
    get supportFoot() {
      return gait.supportFoot;
    },
    get clip() {
      return gait.clip;
    },
    get cycle() {
      return gait.cycle;
    },
  };
}

export async function loadSamplePlayer(
  scene: Scene,
  root: TransformNode,
  constrainTorchGrip: ConstrainTorchGrip,
) {
  const actor = await instantiateHumanoid(scene, root, 'player');
  const postures = await loadHumanoidPostures(scene, actor.joints);
  function joint(name: string) {
    const node = actor.joints.get(name);
    if (!node) throw Error('Babylon humanoid joint missing: ' + name);
    return node;
  }
  const arm = (side: string): JointChain => [
    joint(side + 'Arm'),
    joint(side + 'ForeArm'),
    joint(side + 'Hand'),
  ];
  const leg = (side: string): JointChain => [
    joint(side + 'UpLeg'),
    joint(side + 'Leg'),
    joint(side + 'Foot'),
  ];
  const arms = [arm('Left'), arm('Right')] as const;
  const legs = [leg('Left'), leg('Right')] as const;
  const slots = [arms[0][2], arms[1][2]] as const;
  const feet = [legs[0][2], legs[1][2]] as const;
  const head = joint('Head');
  const back = joint('Spine2');
  const bowDirection = Vector3.Forward();
  let supportFoot: number | null = null;
  let bowSpan = 0.3,
    action = '',
    landing = 0,
    wasAirborne = false;
  function poseLegs(dt: number, movement: PoseMovement) {
    const { airborne, verticalSpeed, speed, crouch, prone } = movement;
    if (wasAirborne && !airborne && speed < 0.1) landing = 0.16;
    landing = Math.max(0, landing - dt);
    wasAirborne = airborne;
    supportFoot = null;
    if (airborne || landing > 0) {
      const bend = airborne
        ? 0.24 + 0.17 * Math.min(1, Math.abs(verticalSpeed) / 5)
        : (0.26 * landing) / 0.16;
      for (const [thigh, shin] of legs) {
        thigh.rotationQuaternion!.multiplyInPlace(
          Quaternion.RotationAxis(Vector3.RightReadOnly, -bend),
        );
        shin.rotationQuaternion!.multiplyInPlace(
          Quaternion.RotationAxis(Vector3.RightReadOnly, 1.7 * bend),
        );
      }
      return;
    }
    if (speed >= 0.12 && crouch === 0 && prone === 0) supportFoot = actor.supportFoot;
  }
  const reset = () => {
    wasAirborne = false;
    landing = 0;
    supportFoot = null;
    postures.reset();
    actor.reset();
  };
  function pose(
    dt: number,
    movement: PoseMovement,
    tool: CharacterPose & { bowRoll: number },
    reticle: Vector3 | null,
  ) {
    const { speed, localZ, pitch, crouch, prone } = movement;
    actor.update(
      movement.airborne || crouch + prone >= 0.99 ? 0 : speed,
      localZ < -0.05,
      dt,
      movement.localX,
      movement.running,
      movement.distance,
    );
    postures.update(dt, movement);
    const matrix = root.computeWorldMatrix(true);
    poseLegs(dt, movement);
    if (tool.firearm) action = '';
    else if (tool.bowRelease) action = 'bow-release';
    else if (tool.nock > 0) action = 'bow-nock';
    else if (tool.reload > 0) action = 'wand-reload';
    else if (tool.bow && tool.ready > 0.04) action = 'bow-aim';
    else if (!tool.bow && !tool.torch && tool.castAge < 0.28) action = 'wand-cast';
    else action = '';
    const handHeight = 1.28 - 0.41 * crouch - 0.97 * prone;
    const forward = new Vector3(0, -Math.sin(pitch), Math.cos(pitch));
    const rightPole = Vector3.TransformNormal(new Vector3(0.8, -0.6, 0), matrix).normalize();
    if (tool.firearm) {
      const grip = new Vector3(0.2, 1.19 - 0.33 * crouch - 0.85 * prone, 0.32);
      reach(arms[1], Vector3.TransformCoordinates(grip, matrix), rightPole);
      const hand = slots[1];
      const pivot = hand.computeWorldMatrix(true).getTranslation();
      const direction = reticle
        ? reticle.subtract(pivot).normalize()
        : Vector3.TransformNormal(forward, matrix);
      pointJoint(
        hand,
        Vector3.TransformCoordinates(Vector3.UpReadOnly, hand.getWorldMatrix()),
        pivot.add(direction),
      );
      const support = pivot.add(direction.scale(tool.rifle ? 0.27 : 0.09));
      reach(arms[0], support, Vector3.TransformNormal(new Vector3(-0.8, -0.7, 0.1), matrix));
    } else if (tool.bow) {
      // Lower the bow so the drawing hand can leave it to reach the quiver.
      const recharging = tool.motion?.present ?? 0;
      const drawWeight = tool.ready * (1 - recharging);
      const carry = new Vector3(0.42, -0.44, 0.79).normalize();
      if (tool.motion) Vector3.LerpToRef(carry, new Vector3(-0.62, 0.16, 0.77), recharging, carry);
      const draw = 0.18 + 0.22 * tool.draw;
      const lookingDown = Math.max(0, Math.sin(pitch));
      head.computeWorldMatrix(true);
      // Follow the animated neck as the shoulders dip between release and charge.
      const belowHood = head.getAbsolutePosition().y - root.position.y - 0.13;
      const nock = Vector3.Lerp(
        new Vector3(0.02, 0.67, 0.34),
        new Vector3(
          -0.23,
          Math.min(1.12 - 0.06 * lookingDown, belowHood),
          0.43 - 0.11 * tool.draw + 0.07 * lookingDown,
        ),
        drawWeight,
      );
      if (tool.motion) Vector3.LerpToRef(nock, new Vector3(0.24, 0.94, 0.24), recharging, nock);
      nock.y -= (0.15 * crouch + 0.42 * prone) * (1 - drawWeight);
      nock.z += 0.27 * prone;
      const [shoulder, elbow, palm] = arms[0];
      const string = arms[1][2];
      for (const joint of [shoulder, elbow, palm]) joint.computeWorldMatrix(true);
      const base = shoulder.getAbsolutePosition();
      const radius =
        Vector3.Distance(base, elbow.getAbsolutePosition()) +
        Vector3.Distance(elbow.getAbsolutePosition(), palm.getAbsolutePosition()) -
        0.003;

      const inverse = Matrix.Invert(matrix);
      const carryAxis = Vector3.TransformNormal(carry, matrix).normalize();
      let stringGoal = Vector3.TransformCoordinates(nock, matrix),
        grip: Vector3;
      // Pull the string hand back when the supporting arm reaches its limit.
      // Reserve the requested draw length between the two hands as the bow rises.
      for (let i = 0; i < 6; i++) {
        reach(arms[1], stringGoal, rightPole);
        string.computeWorldMatrix(true);
        const anchor = string.getAbsolutePosition();
        const axis = reticle
          ? Vector3.Lerp(carryAxis, reticle.subtract(anchor).normalize(), drawWeight).normalize()
          : carryAxis;
        Vector3.TransformNormalToRef(axis, inverse, bowDirection);
        bowDirection.normalize();
        const shelfBasis = Matrix.RotationYawPitchRoll(
          Math.atan2(bowDirection.x, bowDirection.z),
          -Math.asin(bowDirection.y),
          tool.bowRoll,
        );
        const offset = Vector3.TransformNormal(tool.bowRest, shelfBasis).scaleInPlace(tool.scale);
        const gripLine = anchor.subtract(Vector3.TransformNormal(offset, matrix));
        grip = gripLine.add(axis.scale(draw));
        const toGrip = grip.subtract(base),
          excess = toGrip.length() - radius;
        if (excess < 0.0001) break;
        stringGoal = anchor.subtract(toGrip.normalize().scale(excess + 0.001));
      }
      reach(arms[0], grip!, Vector3.TransformNormal(new Vector3(-0.7, -1, 0.1), matrix));
      palm.computeWorldMatrix(true);
      const anchor = string.getAbsolutePosition();
      const axis = Vector3.TransformNormal(bowDirection, matrix).normalize();
      bowSpan = Vector3.Dot(palm.getAbsolutePosition().subtract(anchor), axis);
      if (tool.bowRelease) {
        const { back, side, open } = tool.bowRelease;
        const follow = anchor
          .subtract(axis.scale(back))
          .addInPlace(Vector3.TransformNormal(new Vector3(side, 0, 0), matrix));
        reach(arms[1], follow, rightPole);
        slots[1].rotationQuaternion!.multiplyInPlace(
          Quaternion.RotationAxis(Vector3.UpReadOnly, 0.27 * open),
        );
      }
    } else if (tool.torch) {
      reach(
        arms[1],
        constrainTorchGrip(new Vector3(0.27, handHeight, 0.3), matrix, tool, dt),
        rightPole,
      );
    } else {
      const { alignment, sweep, lift } = tool.stroke;
      const aim = Vector3.Lerp(
        forward,
        new Vector3(0.23 + 0.62 * sweep, 0.93 + 0.18 * lift, 0.29 + 0.22 * tool.ready),
        1 - alignment,
      ).normalize();
      const shoulder = arms[1][0];
      shoulder.computeWorldMatrix(true);
      const offset = new Vector3(0.1 + 0.1 * sweep, -0.24 + 0.09 * lift, 0.18).addInPlace(
        aim.scale(0.16 * alignment),
      );
      if (tool.motion)
        Vector3.LerpToRef(offset, new Vector3(-0.16, -0.18, 0.23), tool.motion.present, offset);
      const grip = shoulder.getAbsolutePosition().add(Vector3.TransformNormal(offset, matrix));
      if (prone > 0) {
        // Carry the wand on the crawling hand until the cast or recharge needs it.
        const hand = slots[1].computeWorldMatrix(true).getTranslation();
        const gesture = Math.min(
          1,
          Math.abs(sweep) + alignment + tool.ready + (tool.motion?.present ?? 0),
        );
        Vector3.LerpToRef(grip, hand, prone * (1 - gesture), grip);
        grip.y = Math.max(grip.y, root.position.y + 0.09 * prone);
      }
      reach(arms[1], grip, rightPole);
      const hand = slots[1];
      hand.computeWorldMatrix(true);
      const pivot = hand.getAbsolutePosition();
      const from = pivot.add(Vector3.TransformNormal(Vector3.UpReadOnly, hand.getWorldMatrix()));
      const direction = Vector3.TransformNormal(aim, matrix).normalize();
      if (reticle && !tool.motion)
        Vector3.LerpToRef(direction, reticle.subtract(pivot).normalize(), alignment, direction);
      pointJoint(hand, from, pivot.add(direction));
    }
  }
  return {
    meshes: actor.meshes,
    slots,
    feet,
    bowDirection,
    get bowSpan() {
      return bowSpan;
    },
    pose,
    reset,
    quiverPoint: (lift: number) =>
      Vector3.TransformCoordinates(
        new Vector3(0.25, 0.21 + 0.24 * lift, -0.17),
        back.computeWorldMatrix(true),
      ),
    reachRecharge(bow: boolean, target: Vector3, weight: number) {
      const i = bow ? 1 : 0,
        hand = slots[i];
      hand.computeWorldMatrix(true);
      const pole = Vector3.TransformNormal(
        new Vector3(i ? 0.8 : -0.8, -0.6, 0),
        root.getWorldMatrix(),
      ).normalize();
      reach(arms[i], Vector3.Lerp(hand.getAbsolutePosition(), target, weight), pole);
    },
    state: () => ({
      locomotion: postures.name ?? actor.clip,
      gaitPhase: postures.name ? postures.phase : actor.cycle,
      supportFoot,
      action,
      airborne: wasAirborne,
      landing: landing > 0,
    }),
  };
}
