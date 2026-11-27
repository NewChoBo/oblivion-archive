import { Engine } from '@babylonjs/core/Engines/engine.js';

export async function createRenderer(
  canvas: HTMLCanvasElement,
  params: URLSearchParams,
  { antialias = false } = {},
) {
  if (params.get('renderer') === 'webgpu') {
    try {
      const { createWebGpuRenderer } = await import('./webgpu-renderer.ts');
      return await createWebGpuRenderer(canvas, antialias);
    } catch (cause) {
      // Keep the driver failure as the cause; startup localizes the recovery prompt.
      const error = new Error('WebGPU renderer initialization failed', { cause });
      error.name = 'WebGPUInitializationError';
      throw error;
    }
  }
  return new Engine(canvas, antialias, {
    alpha: false,
    stencil: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: params.get('capture') === '1',
  });
}
