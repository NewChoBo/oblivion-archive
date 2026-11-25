import type { workLayout } from '../../../content/citadel-layout.ts';

type Hoist = Pick<
  typeof workLayout.freight,
  | 'mast'
  | 'radius'
  | 'turnDegrees'
  | 'pickupBottom'
  | 'carryBottom'
  | 'landingBottom'
  | 'liftSeconds'
  | 'turnSeconds'
  | 'lowerSeconds'
>;

// A load is raised clear of the parapet before the arm turns, then lowered
// onto the quay. Evaluate from elapsed time so checkpoint resets are exact.
export function hoistPose(spec: Hoist, elapsed: number) {
  const { liftSeconds: lift, turnSeconds: turn, lowerSeconds: lower } = spec,
    total = lift + turn + lower;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const raised = clamp(elapsed / lift),
    turned = clamp((elapsed - lift) / turn),
    lowered = clamp((elapsed - lift - turn) / lower);
  const angle = (turned * spec.turnDegrees * Math.PI) / 180;
  const bottom =
    elapsed < lift
      ? spec.pickupBottom + (spec.carryBottom - spec.pickupBottom) * raised
      : spec.carryBottom + (spec.landingBottom - spec.carryBottom) * lowered;
  return {
    angle,
    bottom,
    x: spec.mast[0] + spec.radius * Math.cos(angle),
    z: spec.mast[1] + spec.radius * Math.sin(angle),
    door: clamp(elapsed / 1.6),
    progress: clamp(elapsed / total),
    stage:
      elapsed <= 0
        ? 'waiting'
        : elapsed < lift
          ? 'lifting'
          : elapsed < lift + turn
            ? 'turning'
            : elapsed < total
              ? 'lowering'
              : 'landed',
  };
}
