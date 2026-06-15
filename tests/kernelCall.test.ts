import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  sphere,
  getEdges,
  getFaces,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  kernelCall,
  kernelCallRaw,
  kernelCallScoped,
  pipeline,
  isSolid,
  measureVolume,
  fillet,
  shell,
  thicken,
  offset,
  sketchRectangle,
  castShape,
} from '@/index.js';
import { getKernel } from '@/kernel/index.js';
import type { Face, Shape3D } from '@/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
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
    expect(error.kind).toBe('KERNEL_OPERATION');
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

  it('supports TYPE_CAST error kind', () => {
    const result = kernelCall(
      () => {
        throw new Error('wrong shape type');
      },
      'CAST_ERR',
      'Cast failed',
      'TYPE_CAST'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('TYPE_CAST');
  });

  it('supports IO error kind', () => {
    const result = kernelCall(
      () => {
        throw new Error('file read error');
      },
      'IO_ERR',
      'IO failed',
      'IO'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('IO');
  });

  it('supports COMPUTATION error kind', () => {
    const result = kernelCallRaw(
      () => {
        throw new Error('numeric overflow');
      },
      'COMP_ERR',
      'Computation failed',
      'COMPUTATION'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('COMPUTATION');
  });

  it('supports QUERY error kind', () => {
    const result = kernelCallRaw(
      () => {
        throw new Error('no results');
      },
      'QUERY_ERR',
      'Query failed',
      'QUERY'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('QUERY');
  });

  it('supports UNSUPPORTED error kind', () => {
    const result = kernelCallRaw(
      () => {
        throw new Error('not implemented');
      },
      'UNSUPPORTED_ERR',
      'Unsupported operation',
      'UNSUPPORTED'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('UNSUPPORTED');
  });

  it('supports SKETCHER_STATE error kind', () => {
    const result = kernelCall(
      () => {
        throw new Error('invalid state');
      },
      'SKETCH_ERR',
      'Sketcher error',
      'SKETCHER_STATE'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('SKETCHER_STATE');
  });

  it('supports MODULE_INIT error kind', () => {
    const result = kernelCallRaw(
      () => {
        throw new Error('init failed');
      },
      'INIT_ERR',
      'Module init failed',
      'MODULE_INIT'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('MODULE_INIT');
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
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const faces = getFaces(b);

    const result = pipeline(b as Shape3D)
      .then((s) => fillet(s, edges.slice(0, 4), 1))
      .then((s) => shell(s, [faces[0]], 0.5)).result;

    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(1000);
  });

  it('short-circuits on first error', () => {
    const b = box(10, 10, 10) as Shape3D;

    const result = pipeline(b)
      .then((s) => fillet(s, -1)) // invalid radius → Err
      .then((s) => shell(s, [], 1)).result; // should not execute

    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_FILLET_RADIUS');
  });

  it('accepts a Result as input', () => {
    const b = box(10, 10, 10) as Shape3D;
    const filletResult = fillet(b, getEdges(b).slice(0, 2), 1);
    expect(isOk(filletResult)).toBe(true);

    // Pipeline from a Result, apply another fillet
    const result = pipeline(filletResult).then((s) => {
      const edges = getEdges(s);
      return fillet(s, edges.slice(0, 2), 0.5);
    }).result;

    expect(isOk(result)).toBe(true);
    const vol = unwrap(measureVolume(unwrap(result)));
    expect(vol).toBeLessThan(1000);
  });

  it('propagates Err input immediately', () => {
    const b = box(10, 10, 10) as Shape3D;
    const errResult = fillet(b, -1); // Err

    const result = pipeline(errResult).then((s) => shell(s, [], 1)).result;

    expect(isErr(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Refactored thicken / offset still work
// ---------------------------------------------------------------------------

describe('refactored operations', () => {
  it('thicken works with kernelCall', () => {
    const sketch = sketchRectangle(10, 10);
    const f = castShape(sketch.face().wrapped) as Face;
    const result = thicken(f, 5);
    expect(isOk(result)).toBe(true);
    expect(isSolid(unwrap(result))).toBe(true);
  });

  it('offset works with kernelCall', () => {
    const s = sphere(5);
    const result = offset(s, 1);
    expect(isOk(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// kernelCallScoped
// ---------------------------------------------------------------------------

describe('kernelCallScoped', () => {
  it('returns Ok and disposes scope on success', () => {
    let deleted = false;
    const result = kernelCallScoped(
      (scope) => {
        scope.register({
          delete: () => {
            deleted = true;
          },
        });
        return getKernel().makeBox(1, 1, 1);
      },
      'BOX_FAILED',
      'Box failed'
    );
    expect(isOk(result)).toBe(true);
    expect(deleted).toBe(true);
  });

  it('returns Err and disposes scope on throw', () => {
    let deleted = false;
    const result = kernelCallScoped(
      (scope) => {
        scope.register({
          delete: () => {
            deleted = true;
          },
        });
        throw new Error('simulated kernel failure');
      },
      'TEST_FAILED',
      'Test failed'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('TEST_FAILED');
    expect(unwrapErr(result).kind).toBe('KERNEL_OPERATION');
    expect(deleted).toBe(true);
  });

  it('respects custom kind parameter', () => {
    const result = kernelCallScoped(
      () => {
        throw new Error('validation error');
      },
      'INVALID_INPUT',
      'Input was invalid',
      'VALIDATION'
    );
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).kind).toBe('VALIDATION');
  });
});
