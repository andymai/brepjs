import { initFromOC, registerKernel, OcctWasmAdapter } from './kernel/index.js';

// occt-wasm first (the default kernel); fall back to brepjs-opencascade.
// Both imports are dynamic so an install with only one of the two packages
// doesn't fail at module load.
try {
  const { OcctKernel } = await import('occt-wasm');
  const kernel = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
} catch {
  const { default: opencascade } = await import('brepjs-opencascade');
  const oc = await opencascade();
  initFromOC(oc);
}

export * from './index.js';
