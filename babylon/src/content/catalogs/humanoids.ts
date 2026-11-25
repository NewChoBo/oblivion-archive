export type HumanoidRole = 'player' | 'ally' | 'enemy';

// The imported, skinned Y Bot in its neutral idle frame is 1.7904 units tall.
// Scale the whole rig uniformly to the standing player's existing 1.68 m clearance.
const standingHeight = 1.68;
const yBot = { height: standingHeight, eyeHeight: 1.56, scale: standingHeight / 1.7904 };
export const HUMANOID_METRICS = { player: yBot, ally: yBot, enemy: yBot } as const satisfies Record<
  HumanoidRole,
  typeof yBot
>;

// The shipped posture clips were baked at this mount scale, with strides in metres.
export const POSTURE_BAKE = {
  scale: 0.84,
  crouchStride: 0.7,
  crawlStride: 0.46,
} as const;
const strideScale = HUMANOID_METRICS.player.scale / POSTURE_BAKE.scale;
export const POSTURE_MOTION = {
  file: './assets/characters/ybot-postures.glb',
  crouchStride: POSTURE_BAKE.crouchStride * strideScale,
  crawlStride: POSTURE_BAKE.crawlStride * strideScale,
} as const;

// Clip names are authored asset identifiers shared by all roles on this rig.
export const DEFAULT_HUMANOID = {
  file: './assets/characters/dummy3.babylon',
  clips: {
    idle: 'YBot_Idle',
    walk: 'YBot_Walk',
    run: 'YBot_Run',
    left: 'YBot_LeftStrafeWalk',
    right: 'YBot_RightStrafeWalk',
  },
  clothing: { ally: '#7b9778', enemy: '#ad565e' } satisfies Record<
    Exclude<HumanoidRole, 'player'>,
    string
  >,
} as const;
