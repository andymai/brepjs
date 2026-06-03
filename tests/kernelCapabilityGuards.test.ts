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
import { importGLB } from '@/io/gltfImportFns.js';
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
