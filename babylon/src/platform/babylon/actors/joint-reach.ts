import type { TransformNode } from '@babylonjs/core';

export type JointChain = readonly [TransformNode, TransformNode, TransformNode];
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';

export function pointJoint(joint: TransformNode, end: Vector3, goal: Vector3) {
  // The pose supplies world-space targets. Apply the corrective rotation in joint space.
  const inverse = Matrix.Invert(joint.computeWorldMatrix(true));
  const from = Vector3.TransformCoordinates(end, inverse).normalize();
  const to = Vector3.TransformCoordinates(goal, inverse).normalize();
  const turn = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(from, to, turn);
  joint.rotationQuaternion!.multiplyInPlace(turn).normalize();
}

export function reach(arm: JointChain, target: Vector3, elbowPole: Vector3) {
  const [shoulder, elbow, socket] = arm;
  const point = (node: TransformNode) => {
    node.computeWorldMatrix(true);
    return node.getAbsolutePosition().clone();
  };
  const start = point(shoulder),
    middle = point(elbow),
    end = point(socket);
  const upper = Vector3.Distance(start, middle),
    lower = Vector3.Distance(middle, end);
  const axis = target.subtract(start).normalize();
  const distance = Math.max(
    Math.abs(upper - lower) + 0.001,
    Math.min(upper + lower - 0.001, Vector3.Distance(start, target)),
  );
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const outward = elbowPole.subtract(axis.scale(Vector3.Dot(elbowPole, axis))).normalize();
  const bend = start
    .add(axis.scale(along))
    .add(outward.scale(Math.sqrt(Math.max(0, upper * upper - along * along))));
  pointJoint(shoulder, middle, bend);
  pointJoint(elbow, point(socket), start.add(axis.scale(distance)));
}
