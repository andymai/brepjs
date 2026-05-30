/**
 * OcctWasmAdapter unit tests — `fromKernel` wrapper retention.
 *
 * Plain stub objects suffice: the adapter constructor never calls into the
 * kernel, so no WASM init is required here.
 */

import { describe, expect, it, vi } from 'vitest';
import { OcctWasmAdapter } from '@/kernel/occtWasm/occtWasmAdapter.js';
import type { OcctWasmModule, OcctKernelWasm } from '@/kernel/occtWasm/occtWasmTypes.js';

const stubModule = (): OcctWasmModule => ({}) as unknown as OcctWasmModule;
const stubKernel = (): OcctKernelWasm => ({}) as unknown as OcctKernelWasm;

describe('OcctWasmAdapter.fromKernel', () => {
  it('derives module and raw kernel from an occt-wasm OcctKernel wrapper', () => {
    const module = stubModule();
    const kernel = stubKernel();
    const owner = {
      getRawModule: vi.fn(() => module),
      getRawKernel: vi.fn(() => kernel),
    };

    const adapter = OcctWasmAdapter.fromKernel(owner);

    expect(adapter).toBeInstanceOf(OcctWasmAdapter);
    expect(adapter.kernelId).toBe('occt-wasm');
    expect(owner.getRawModule).toHaveBeenCalledTimes(1);
    expect(owner.getRawKernel).toHaveBeenCalledTimes(1);
  });

  it('retains a strong reference to the wrapper for the adapter lifetime', () => {
    const owner = {
      getRawModule: () => stubModule(),
      getRawKernel: () => stubKernel(),
    };

    const adapter = OcctWasmAdapter.fromKernel(owner);

    expect(adapter.retainedKernelOwner).toBe(owner);
  });

  it('retains nothing when built from a raw module and kernel', () => {
    const adapter = new OcctWasmAdapter(stubModule(), stubKernel());

    expect(adapter.retainedKernelOwner).toBeUndefined();
  });
});
