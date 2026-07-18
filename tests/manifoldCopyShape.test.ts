// @vitest-environment node
/**
 * Manifold copyShape independence — clone() must not alias the native solid.
 *
 * The adapter's dispose() frees `handle.manifold`, so an identity copyShape
 * makes clone-then-delete a use-after-free on the source (surfaced as
 * "Cannot pass deleted object as a pointer of type Manifold" the first time
 * a boolean or mesh() materializes the source, e.g. via subShapeHashes).
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel, initOCCT } from './setup.js';
import { withKernel, box, clone, mesh, unwrap } from '@/index.js';

let haveManifold = false;
beforeAll(async () => {
  await initOCCT();
  try {
    await initKernel('manifold');
    haveManifold = true;
  } catch {
    haveManifold = false;
  }
}, 60_000);

describe('manifold copyShape', () => {
  it('disposing a clone leaves the source usable', () => {
    if (!haveManifold) return;
    withKernel('manifold', () => {
      const source = box(10, 10, 10);
      const copy = unwrap(clone(source));
      copy.delete();
      expect(mesh(source).vertices.length).toBeGreaterThan(0);
      source.delete();
    });
  });

  it('disposing the source leaves the clone usable', () => {
    if (!haveManifold) return;
    withKernel('manifold', () => {
      const source = box(10, 10, 10);
      const copy = unwrap(clone(source));
      source.delete();
      expect(mesh(copy).vertices.length).toBeGreaterThan(0);
      copy.delete();
    });
  });
});
