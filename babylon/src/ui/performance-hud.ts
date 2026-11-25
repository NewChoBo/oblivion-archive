import { controlText } from '../content/locales/controls.ts';
import { graphicsInfo } from '../platform/babylon/rendering/graphics-info.ts';
import { requireElement } from './dom.ts';
import { SceneInstrumentation, type Scene, type PostProcess } from '@babylonjs/core';

export function createPerformanceHud(
  panel: HTMLElement,
  scene: Scene,
  {
    baseRenderScale,
    scenePass,
  }: {
    baseRenderScale: number;
    scenePass: Pick<PostProcess, 'samples'>;
  },
) {
  const engine = scene.getEngine();
  const stat = (id: string) => requireElement(panel, `[data-stat="${id}"]`, HTMLElement);
  const fields = {
    adapter: stat('adapter'),
    fps: stat('fps'),
    frame: stat('frame'),
    peak: stat('peak'),
    resolution: stat('resolution'),
    quality: stat('quality'),
    meshes: stat('meshes'),
    draws: stat('draws'),
  };
  let instrumentation: SceneInstrumentation | null = null;
  let frames = 0,
    elapsed = 0,
    peak = 0;
  let skipNextFrame = true;

  return {
    setVisible(visible: boolean) {
      // The hidden HUD releases instrumentation to avoid collecting counters every frame.
      if (visible === Boolean(instrumentation)) return;
      if (visible) {
        instrumentation = new SceneInstrumentation(scene);
        const { renderer } = graphicsInfo(engine);
        const name = /^ANGLE \([^,]+, (.+?)(?: \(0x[\da-f]+\))? (?:Direct3D|OpenGL|Vulkan)/i.exec(
          renderer,
        )?.[1];
        fields.adapter.textContent = name || renderer || controlText('performance.unknown');
        fields.adapter.title = `${engine.description} · ${renderer || controlText('performance.unknown-gpu')}`;
      } else {
        instrumentation?.dispose();
        instrumentation = null;
        for (const field of Object.values(fields)) field.textContent = '—';
        fields.adapter.removeAttribute('title');
      }
      frames = elapsed = peak = 0;
      skipNextFrame = true;
      panel.hidden = !visible;
    },
    sample(seconds: number, active: boolean) {
      if (!instrumentation) return;
      if (!active) {
        frames = elapsed = peak = 0;
        skipNextFrame = true;
        return;
      }
      if (skipNextFrame) {
        skipNextFrame = false;
        return;
      }
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      frames++;
      elapsed += seconds;
      peak = Math.max(peak, seconds);
      if (elapsed < 0.5) return;

      const scale = Math.round((100 * baseRenderScale) / engine.getHardwareScalingLevel());
      const samples = scenePass.samples;
      fields.fps.textContent = (frames / elapsed).toFixed(1);
      fields.frame.textContent = `${((1000 * elapsed) / frames).toFixed(1)} ms`;
      fields.peak.textContent = `${(1000 * peak).toFixed(1)} ms`;
      fields.resolution.textContent = `${engine.getRenderWidth(true)} × ${engine.getRenderHeight(true)}`;
      fields.quality.textContent = `${scale}% · ${samples > 1 ? `${samples}×` : controlText('performance.off')}`;
      fields.meshes.textContent = String(scene.getActiveMeshes().length);
      fields.draws.textContent = String(instrumentation.drawCallsCounter.current);
      frames = elapsed = peak = 0;
    },
  };
}
