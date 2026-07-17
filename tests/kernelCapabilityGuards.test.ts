/**
 * Runtime tests for the kernel capability type guards and the importGLB
 * error path. The guards narrow a KernelAdapter to a capability-bearing
 * subtype by probing for method presence; public-api-types.test.ts only
 * asserts they are exported, never invokes them.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { getKernel } from '@/kernel/index.js';
import { supportsProjection, supportsConstraintSketch } from '@/kernel/index.js';
import {
  UnsupportedKernelOperationError,
  isUnsupportedKernelOperationError,
} from '@/kernel/unsupported.js';
import { importGLB } from '@/io/gltfImportFns.js';
import { box } from '@/index.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { isErr } from '@/core/result.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('kernel capability guards', () => {
  it('detects projection support by probing for projectEdges', () => {
    const kernel = getKernel();
    expect(supportsProjection(kernel)).toBe('projectEdges' in kernel);
  });

  it('detects constraint-sketch support by probing for sketchNew/sketchDof', () => {
    const kernel = getKernel();
    expect(supportsConstraintSketch(kernel)).toBe('sketchNew' in kernel && 'sketchDof' in kernel);
  });

  it('returns false for a plain object lacking the capability methods', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercising the guard's runtime probe
    const fake = {} as any;
    expect(supportsProjection(fake)).toBe(false);
    expect(supportsConstraintSketch(fake)).toBe(false);
  });
});

describe('importGLB error handling', () => {
  it('returns an Err when the kernel cannot import the GLB data', async () => {
    const blob = new Blob([new Uint8Array([0, 1, 2, 3])]);
    const result = await importGLB(blob);
    expect(isErr(result)).toBe(true);
  });
});

describe('UnsupportedKernelOperationError', () => {
  it('the guard recognizes the marked error and rejects lookalikes', () => {
    expect(isUnsupportedKernelOperationError(new UnsupportedKernelOperationError('x'))).toBe(true);
    // A plain error that merely *reads* like the old sentinels must not match —
    // this is the whole point of moving off message-substring detection.
    expect(isUnsupportedKernelOperationError(new Error('sharedEdges is not yet implemented'))).toBe(
      false
    );
    expect(isUnsupportedKernelOperationError('is only available with the brepkit kernel')).toBe(
      false
    );
    expect(isUnsupportedKernelOperationError(undefined)).toBe(false);
  });

  it('a stubbed kernel op throws an error the guard recognizes', () => {
    // This suite runs on the occt (OpenCascade) kernel, which stubs sharedEdges.
    using b = box(10, 10, 10);
    const face = getFaces(b)[0];
    if (!face) throw new Error('box must have a face');
    let caught: unknown;
    try {
      getKernel().sharedEdges(face.wrapped, face.wrapped);
    } catch (e) {
      caught = e;
    }
    expect(isUnsupportedKernelOperationError(caught)).toBe(true);
  });
});
