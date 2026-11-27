import { WebGPUEngine } from '@babylonjs/core';
import glslangJs from '@babylonjs/core/assets/glslang/glslang.js?url&no-inline';
import glslangWasm from '@babylonjs/core/assets/glslang/glslang.wasm?url&no-inline';
import twgslJs from '@babylonjs/core/assets/twgsl/twgsl.js?url&no-inline';
import twgslWasm from '@babylonjs/core/assets/twgsl/twgsl.wasm?url&no-inline';

export async function createWebGpuRenderer(canvas: HTMLCanvasElement, antialias: boolean) {
  if (!(await WebGPUEngine.IsSupportedAsync)) throw Error('WebGPU adapter unavailable');
  const engine = new WebGPUEngine(canvas, {
    antialias,
    stencil: true,
    powerPreference: 'high-performance',
  });
  // The shader translators load their WASM at runtime and need absolute asset URLs.
  const url = (path: string) => new URL(path, document.baseURI).href;
  try {
    await engine.initAsync(
      { jsPath: url(glslangJs), wasmPath: url(glslangWasm) },
      { jsPath: url(twgslJs), wasmPath: url(twgslWasm) },
    );
    return engine;
  } catch (error) {
    engine.dispose();
    throw error;
  }
}
