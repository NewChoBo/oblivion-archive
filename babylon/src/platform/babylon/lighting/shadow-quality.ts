import { ShadowGenerator, type Light, type ShadowLight } from '@babylonjs/core';

export const SHADOW_QUALITY = {
  performance: { fixtures: 128, exterior: 512, torch: 0 },
  balanced: { fixtures: 256, exterior: 1024, torch: 256 },
  sharp: { fixtures: 512, exterior: 2048, torch: 512 },
};

export type ShadowQuality = keyof typeof SHADOW_QUALITY;

export function applyStaticShadowQuality(lights: readonly Light[], preset: ShadowQuality) {
  const { fixtures, exterior } = SHADOW_QUALITY[preset];
  for (const light of lights) {
    // Fixed scene lights use Babylon’s ShadowGenerator for both cube and planar maps.
    const shadows = light.getShadowGenerator() as ShadowGenerator | null;
    if (!shadows) continue;
    const current = shadows.getShadowMap();
    if (!current) continue;
    const cube = (light as ShadowLight).needCube();
    const size = cube ? fixtures : exterior;
    const { renderList, refreshRate } = current;
    if (shadows.mapSize !== size) {
      shadows.mapSize = size;
      const map = shadows.getShadowMap();
      if (!map) continue;
      map.renderList = renderList;
      map.refreshRate = refreshRate;
    }
    if (cube) {
      shadows.usePoissonSampling = preset === 'sharp';
      if (preset !== 'sharp') shadows.useCloseExponentialShadowMap = true;
    } else {
      shadows.filteringQuality =
        preset === 'performance' ? ShadowGenerator.QUALITY_LOW : ShadowGenerator.QUALITY_MEDIUM;
    }
    shadows.getShadowMap()?.resetRefreshCounter();
  }
}
