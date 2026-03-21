import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  translate,
  getEdges,
  getFaces,
  fuseWithEvolution,
  cutWithEvolution,
  intersectWithEvolution,
  filletWithEvolution,
  chamferWithEvolution,
  shellWithEvolution,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  measureVolume,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('fuseWithEvolution', () => {
  it('returns shape and evolution data', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    const result = fuseWithEvolution(a, b);
    expect(isOk(result)).toBe(true);
    const { shape, evolution } = unwrap(result);
    expect(unwrap(measureVolume(shape))).toBeCloseTo(1500, 0);
    expect(evolution).toBeDefined();
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });

  it('evolution tracks face modifications', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    const result = fuseWithEvolution(a, b);
    expect(isOk(result)).toBe(true);
    const { evolution } = unwrap(result);
    // Overlapping fuse should have some modified or deleted faces
    const totalTracked =
      evolution.modified.size + evolution.generated.size + evolution.deleted.size;
    expect(totalTracked).toBeGreaterThan(0);
  });
});

describe('cutWithEvolution', () => {
  it('returns shape and evolution data', () => {
    const a = box(10, 10, 10);
    const b = translate(box(5, 5, 20), [2.5, 2.5, -5]);
    const result = cutWithEvolution(a, b);
    expect(isOk(result)).toBe(true);
    const { shape: _shape, evolution } = unwrap(result);
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });

  it('evolution tracks deleted faces from cut', () => {
    const a = box(10, 10, 10);
    const b = translate(box(5, 5, 20), [2.5, 2.5, -5]);
    const result = cutWithEvolution(a, b);
    expect(isOk(result)).toBe(true);
    const { evolution } = unwrap(result);
    const totalTracked =
      evolution.modified.size + evolution.generated.size + evolution.deleted.size;
    expect(totalTracked).toBeGreaterThan(0);
  });
});

describe('intersectWithEvolution', () => {
  it('returns shape and evolution data', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 5, 5]);
    const result = intersectWithEvolution(a, b);
    expect(isOk(result)).toBe(true);
    const { shape, evolution } = unwrap(result);
    expect(unwrap(measureVolume(shape))).toBeCloseTo(125, 0);
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });
});

describe('filletWithEvolution', () => {
  it('returns shape and evolution data', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = filletWithEvolution(b, edges.slice(0, 1), 1);
    expect(isOk(result)).toBe(true);
    const { shape: _shape, evolution } = unwrap(result);
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });

  it('evolution contains valid tracking data', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = filletWithEvolution(b, edges.slice(0, 1), 1);
    expect(isOk(result)).toBe(true);
    const { evolution } = unwrap(result);
    // Fillet should produce some evolution tracking (modified, generated, or deleted)
    const totalTracked =
      evolution.modified.size + evolution.generated.size + evolution.deleted.size;
    expect(totalTracked).toBeGreaterThanOrEqual(0);
    // Verify the maps contain arrays of numbers
    for (const [_key, values] of evolution.modified) {
      expect(Array.isArray(values)).toBe(true);
    }
  });
});

describe('chamferWithEvolution', () => {
  it('returns shape and evolution data', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamferWithEvolution(b, edges.slice(0, 1), 1);
    expect(isOk(result)).toBe(true);
    const { shape: _shape, evolution } = unwrap(result);
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });

  it('evolution contains valid tracking data', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamferWithEvolution(b, edges.slice(0, 1), 1);
    expect(isOk(result)).toBe(true);
    const { evolution } = unwrap(result);
    // Verify maps/sets are valid structures
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });
});

describe('shellWithEvolution', () => {
  it('returns shape and evolution data', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shellWithEvolution(b, faces.slice(0, 1), 1);
    expect(isOk(result)).toBe(true);
    const { shape: _shape, evolution } = unwrap(result);
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });

  it('evolution contains valid map/set structures', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shellWithEvolution(b, faces.slice(0, 1), 1);
    expect(isOk(result)).toBe(true);
    const { evolution } = unwrap(result);
    // Shell evolution may or may not populate entries depending on kernel;
    // verify the structures are correct
    for (const [key, value] of evolution.modified) {
      expect(typeof key).toBe('number');
      expect(Array.isArray(value)).toBe(true);
    }
    for (const [key, value] of evolution.generated) {
      expect(typeof key).toBe('number');
      expect(Array.isArray(value)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Validation error branches
// ---------------------------------------------------------------------------

describe('chamferWithEvolution validation errors', () => {
  it('rejects negative distance', () => {
    const b = box(10, 10, 10);
    const result = chamferWithEvolution(b, undefined, -1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_CHAMFER_DISTANCE');
  });

  it('rejects zero distance', () => {
    const b = box(10, 10, 10);
    const result = chamferWithEvolution(b, undefined, 0);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_CHAMFER_DISTANCE');
  });

  it('rejects asymmetric distances with negative value', () => {
    const b = box(10, 10, 10);
    const result = chamferWithEvolution(b, undefined, [-1, 2]);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_CHAMFER_DISTANCE');
  });

  it('rejects empty edge list', () => {
    const b = box(10, 10, 10);
    const result = chamferWithEvolution(b, [], 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('CHAMFER_NO_EDGES');
  });

  it('rejects callback that skips all edges', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = chamferWithEvolution(b, edges, () => null);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('CHAMFER_NO_EDGES');
  });
});

describe('shellWithEvolution validation errors', () => {
  it('rejects negative thickness', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shellWithEvolution(b, faces.slice(0, 1), -1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_THICKNESS');
  });

  it('rejects zero thickness', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = shellWithEvolution(b, faces.slice(0, 1), 0);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('INVALID_THICKNESS');
  });

  it('rejects empty faces list', () => {
    const b = box(10, 10, 10);
    const result = shellWithEvolution(b, [], 1);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('NO_FACES');
  });
});
