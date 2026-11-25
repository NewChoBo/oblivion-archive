import type { AbstractEngine, Engine } from '@babylonjs/core';

// WebGL and WebGPU expose getInfo on their concrete engines, outside AbstractEngine's contract.
function reportsGraphicsInfo(
  engine: AbstractEngine,
): engine is AbstractEngine & Pick<Engine, 'getInfo'> {
  return 'getInfo' in engine && typeof engine.getInfo === 'function';
}

export function graphicsInfo(engine: AbstractEngine) {
  if (!reportsGraphicsInfo(engine))
    throw new Error(`Missing graphics information for ${engine.description}`);
  return engine.getInfo();
}
