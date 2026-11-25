// Offsets from the Y Bot's upper chest, in metres in the actor's facing direction.
export const MIRA_HANDS = {
  left: [-0.12, -0.18, 0.16],
  right: [0.07, -0.15, 0.18],
} as const;

// Mira raises an open hand, indicates the quarry, then draws both hands back.
export const MIRA_TALK = [
  { time: 0, offer: 0, aside: 0 },
  { time: 0.42, offer: 1, aside: 0 },
  { time: 0.78, offer: 0.92, aside: 0 },
  { time: 1.35, offer: 0.68, aside: 1 },
  { time: 1.68, offer: 0.58, aside: 0.9 },
  { time: 2.25, offer: 0, aside: 0 },
] as const;

export const HOSTAGE_GUARD = {
  left: [-0.04, 0.08, 0.15],
  right: [0.07, 0.13, 0.17],
  spinePitch: 0.76,
  neckPitch: 0.22,
  standSeconds: 0.68,
} as const;
