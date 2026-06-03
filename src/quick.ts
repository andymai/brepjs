import { initFromOC, registerKernel, OcctWasmAdapter } from './kernel/index.js';

// occt-wasm first (the default kernel); fall back to brepjs-opencascade.
// Both imports are dynamic so an install with only one of the two packages
// doesn't fail at module load.
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
  const { OcctKernel } = (await import(/* @vite-ignore */ 'occt-wasm')) as any;
  const kernel = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
} catch {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
  const { default: opencascade } = (await import(/* @vite-ignore */ 'brepjs-opencascade')) as any;
  const oc = await opencascade();
  initFromOC(oc);
}

export * from './index.js';
