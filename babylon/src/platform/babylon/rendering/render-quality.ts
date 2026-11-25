const adaptiveMsaaTiers = [
  { scale: 1, samples: 2 },
  { scale: 1, samples: 1 },
  { scale: 1.25, samples: 1 },
  { scale: 1.5, samples: 1 },
  { scale: 1.75, samples: 1 },
];

// WebGPU keys every pipeline by its sample count and color attachment format.
const fixedMsaaTiers = [1, 1.15, 1.35, 1.6, 2].map((scale) => ({ scale, samples: 2 }));

export function createRenderQuality(
  apply: (tier: { scale: number; samples: number }) => void,
  { fixedMsaa = false } = {},
) {
  const tiers = fixedMsaa ? fixedMsaaTiers : adaptiveMsaaTiers;
  let tier = 0;
  let frames = 0,
    elapsed = 0;
  let slowWindows = 0,
    fastWindows = 0;
  let settle = 0.5;
  let slowFps = 44,
    fastFps = 56;

  function resetSamples() {
    frames = elapsed = slowWindows = fastWindows = 0;
    settle = 0.5;
  }

  return {
    setFrameLimit(fpsLimit: number | null | undefined) {
      // The cap intentionally controls frame intervals. Scale the quality
      // thresholds for low caps and retain the existing target at 60 and up.
      const targetRatio = Math.min(fpsLimit ?? 60, 60) / 60;
      slowFps = 44 * targetRatio;
      fastFps = 56 * targetRatio;
      resetSamples();
    },
    sample(seconds: number, active: boolean) {
      if (!active) {
        resetSamples();
        return;
      }
      if (seconds <= 0) return;
      if (settle > 0) {
        settle -= seconds;
        return;
      }
      frames++;
      elapsed += seconds;
      if (elapsed < 0.8) return;

      const fps = frames / elapsed;
      frames = elapsed = 0;
      slowWindows = fps < slowFps ? slowWindows + 1 : 0;
      fastWindows = fps > fastFps ? fastWindows + 1 : 0;
      const next =
        slowWindows >= 2
          ? Math.min(tier + 1, tiers.length - 1)
          : fastWindows >= 7
            ? Math.max(tier - 1, 0)
            : tier;
      if (next === tier) return;

      // Give the framebuffer time to settle and recover quality more slowly than we cut it.
      tier = next;
      resetSamples();
      apply(tiers[tier]!);
    },
  };
}
