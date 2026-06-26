import { initFromOC, registerKernel, OcctWasmAdapter } from './kernel/index.js';
import { importOptionalBackend } from './kernel/optionalBackend.js';

// occt-wasm first (the default kernel); fall back to brepjs-opencascade.
// Both imports are dynamic so an install with only one of the two packages
// doesn't fail at module load.
try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import of optional peer
  const { OcctKernel } = (await importOptionalBackend('occt-wasm')) as any;
  const kernel = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
} catch {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import of optional peer
  const { default: opencascade } = (await importOptionalBackend('brepjs-opencascade')) as any;
  const oc = await opencascade();
  initFromOC(oc);
}

export * from './index.js';
