import { graphicsInfo } from './graphics-info.ts';
import { EngineInstrumentation, SceneInstrumentation, type Scene } from '@babylonjs/core';

const maxFrames = 1200;

interface FrameTiming {
  interval: number;
  stages: Record<string, number>;
}
interface FrameSample extends FrameTiming {
  gpu: number | null;
  drawCalls: number;
  meshEvaluation: number;
  activeMeshes: number;
  renderSize: [number, number];
}

function summarize(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { mean: +mean.toFixed(3), p95: +sorted[Math.ceil(0.95 * values.length) - 1]!.toFixed(3) };
}

export function createFrameProfiler(scene: Scene) {
  const engine = scene.getEngine();
  let instrumentation: SceneInstrumentation | null = null,
    gpuInstrumentation: EngineInstrumentation | null = null;
  let frames: FrameSample[] = [],
    current: FrameTiming | null = null,
    previous = 0,
    gpuCount = 0,
    includePaused = false,
    skip = false;

  function report() {
    const stages: Record<string, ReturnType<typeof summarize>> = {};
    const names = new Set(frames.flatMap((frame) => Object.keys(frame.stages)));
    for (const name of names)
      stages[name] = summarize(frames.map((frame) => frame.stages[name] ?? 0));
    const interval = summarize(frames.map((frame) => frame.interval));
    const gpuSamples = frames.flatMap((frame) => (frame.gpu === null ? [] : [frame.gpu]));
    return {
      frames: frames.length,
      fps: interval?.mean ? +(1000 / interval.mean).toFixed(1) : null,
      interval,
      stages,
      meshEvaluation: summarize(frames.map((frame) => frame.meshEvaluation)),
      gpu: summarize(gpuSamples),
      gpuSamples: gpuSamples.length,
      graphics: { backend: engine.description, ...graphicsInfo(engine) },
      drawCalls: summarize(frames.map((frame) => frame.drawCalls)),
      activeMeshes: summarize(frames.map((frame) => frame.activeMeshes)),
      renderSize: frames.at(-1)?.renderSize ?? null,
    };
  }

  function endCapture() {
    instrumentation?.dispose();
    if (gpuInstrumentation) {
      gpuInstrumentation.captureGPUFrameTime = false;
      gpuInstrumentation.dispose();
    }
    instrumentation = gpuInstrumentation = current = null;
  }

  return {
    start(options: { includePaused?: boolean } = {}) {
      endCapture();
      frames = [];
      includePaused = options.includePaused === true;
      skip = true;
      instrumentation = new SceneInstrumentation(scene);
      instrumentation.captureActiveMeshesEvaluationTime = true;
      if (engine.getCaps().timerQuery) {
        gpuInstrumentation = new EngineInstrumentation(engine);
        gpuInstrumentation.captureGPUFrameTime = true;
        gpuCount = gpuInstrumentation.gpuFrameTimeCounter.count;
      }
    },
    stop() {
      endCapture();
      return report();
    },
    report,
    begin(seconds: number, paused: boolean) {
      if (!instrumentation || (paused && !includePaused)) return;
      if (skip) {
        skip = false;
        return;
      }
      current = { interval: seconds * 1000, stages: {} };
      previous = performance.now();
    },
    mark(stage: string) {
      if (!current) return;
      const now = performance.now();
      current.stages[stage] = now - previous;
      previous = now;
    },
    end(rendered = true) {
      if (!current || !instrumentation) return;
      // GPU timers complete asynchronously in nanoseconds. Record each result once, in milliseconds.
      const gpu = gpuInstrumentation?.gpuFrameTimeCounter;
      frames.push({
        ...current,
        gpu: rendered && gpu && gpu.count !== gpuCount ? gpu.current / 1e6 : null,
        drawCalls: rendered ? instrumentation.drawCallsCounter.current : 0,
        meshEvaluation: rendered ? instrumentation.activeMeshesEvaluationTimeCounter.current : 0,
        activeMeshes: rendered ? scene.getActiveMeshes().length : 0,
        renderSize: [engine.getRenderWidth(true), engine.getRenderHeight(true)],
      });
      if (gpu) gpuCount = gpu.count;
      current = null;
      if (frames.length === maxFrames) endCapture();
    },
  };
}
