import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  getEdges,
  getFaces,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  kernelCall,
  kernelCallRaw,
  pipeline,
  isSolid,
  measureVolume,
  filletShape,
  shellShape,
  thickenSurface,
  offsetShape,
  sketchRectangle,
  castShape,
} from '../src/index.js';
import { getKernel } from '../src/kernel/index.js';
import type { Shape3D } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

// ---------------------------------------------------------------------------
// kernelCall
// ---------------------------------------------------------------------------

describe('kernelCall', () => {
  it('wraps a successful kernel operation', () => {
    const result = kernelCall(
      () => getKernel().makeBox(10, 10, 10),
      'BOX_FAILED',
      'Box creation failed'
    );
    expect(isOk(result)).toBe(true);
    expect(isSolid(unwrap(result))).toBe(true);
  });

  it('catches exceptions and returns Err', () => {
    const result = kernelCall(
      () => {
        throw new Error('simulated failure');
      },
      'TEST_FAILED',
      'Test operation failed'
    );
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.code).toBe('TEST_FAILED');
    expect(error.message).toContain('simulated failure');
    expect(error.kind).toBe('OCCT_OPERATION');
  });

  it('supports custom error kind', () => {
    const result = kernelCall(
      () => {
        throw new Error('bad input');
      },
      'INVALID',
      'Validation failed',
      'VALIDATION'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('VALIDATION');
  });
});

// ---------------------------------------------------------------------------
// kernelCallRaw
// ---------------------------------------------------------------------------

describe('kernelCallRaw', () => {
  it('wraps a successful raw kernel call', () => {
    const result = kernelCallRaw(
      () => getKernel().volume(getKernel().makeBox(10, 10, 10)),
      'VOLUME_FAILED',
      'Volume failed'
    );
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBeCloseTo(1000, 0);
  });

  it('catches exceptions for raw calls', () => {
    const result = kernelCallRaw(
      () => {
        throw new Error('raw fail');
      },
      'RAW_FAILED',
      'Raw operation failed'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('RAW_FAILED');
  });
});

// ---------------------------------------------------------------------------
// pipeline
// ---------------------------------------------------------------------------

describe('pipeline', () => {
  it('chains successful operations', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(box);
    const faces = getFaces(box);

    const result = pipeline(box as Shape3D)
      .then((s) => filletShape(s, edges.slice(0, 4), 1))
      .then((s) => shellShape(s, [faces[0]], 0.5)).result;

    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(1000);
  });

  it('short-circuits on first error', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]) as Shape3D;

    const result = pipeline(box)
      .then((s) => filletShape(s, undefined, -1)) // invalid radius → Err
      .then((s) => shellShape(s, [], 1)).result; // should not execute

    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_FILLET_RADIUS');
  });

  it('accepts a Result as input', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]) as Shape3D;
    const filletResult = filletShape(box, getEdges(box).slice(0, 2), 1);
    expect(isOk(filletResult)).toBe(true);

    // Pipeline from a Result, apply another fillet
    const result = pipeline(filletResult).then((s) => {
      const edges = getEdges(s);
      return filletShape(s, edges.slice(0, 2), 0.5);
    }).result;

    expect(isOk(result)).toBe(true);
    const vol = measureVolume(unwrap(result));
    expect(vol).toBeLessThan(1000);
  });

  it('propagates Err input immediately', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]) as Shape3D;
    const errResult = filletShape(box, undefined, -1); // Err

    const result = pipeline(errResult).then((s) => shellShape(s, [], 1)).result;

    expect(isErr(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Refactored thickenSurface / offsetShape still work
// ---------------------------------------------------------------------------

describe('refactored operations', () => {
  it('thickenSurface works with kernelCall', () => {
    const sketch = sketchRectangle(10, 10);
    const face = castShape(sketch.face().wrapped);
    const result = thickenSurface(face, 5);
    expect(isOk(result)).toBe(true);
    expect(isSolid(unwrap(result))).toBe(true);
  });

  it('offsetShape works with kernelCall', () => {
    const sphere = makeSphere(5);
    const result = offsetShape(sphere, 1);
    expect(isOk(result)).toBe(true);
  });
});
