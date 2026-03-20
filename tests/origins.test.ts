import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  getFaces,
  getHashCode,
  setShapeOrigin,
  getFaceOrigins,
  translate,
  rotate,
  fuse,
  cut,
  fuseAll,
  cutAll,
  unwrap,
  fillet,
  mesh,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('setShapeOrigin / getFaceOrigins', () => {
  it('tags all faces of a shape with an origin', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 42);

    const origins = getFaceOrigins(b);
    expect(origins).toBeDefined();
    if (!origins) return; // narrowing for TypeScript

    const faces = getFaces(b);
    expect(faces.length).toBe(6); // box has 6 faces
    for (const f of faces) {
      expect(origins.get(getHashCode(f))).toBe(42);
    }
  });

  it('returns undefined for shapes with no origin set', () => {
    const b = box(10, 10, 10);
    expect(getFaceOrigins(b)).toBeUndefined();
  });

  it('overwrites previous origins', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 1);
    setShapeOrigin(b, 2);

    const origins = getFaceOrigins(b);
    expect(origins).toBeDefined();
    if (!origins) return;
    const faces = getFaces(b);
    for (const f of faces) {
      expect(origins.get(getHashCode(f))).toBe(2);
    }
  });
});

describe('origin propagation through fuse', () => {
  it('propagates origins from both inputs to the fuse result', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [10, 0, 0]);
    setShapeOrigin(a, 1);
    setShapeOrigin(b, 2);

    const result = unwrap(fuse(a, b));
    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;

    const faces = getFaces(result);
    expect(faces.length).toBeGreaterThan(0);
    const originValues = new Set<number>();
    for (const f of faces) {
      const o = origins.get(getHashCode(f));
      expect(o).toBeDefined();
      originValues.add(o ?? -1);
    }
    expect(originValues.has(1)).toBe(true);
    expect(originValues.has(2)).toBe(true);
  });

  it('preserves origins through chained fuse', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [10, 0, 0]);
    const c = translate(box(10, 10, 10), [20, 0, 0]);
    setShapeOrigin(a, 10);
    setShapeOrigin(b, 20);
    setShapeOrigin(c, 30);

    const ab = unwrap(fuse(a, b));
    const abc = unwrap(fuse(ab, c));

    const origins = getFaceOrigins(abc);
    expect(origins).toBeDefined();
    if (!origins) return;

    const originValues = new Set<number>();
    for (const f of getFaces(abc)) {
      originValues.add(origins.get(getHashCode(f)) ?? -1);
    }
    expect(originValues.has(10)).toBe(true);
    expect(originValues.has(20)).toBe(true);
    expect(originValues.has(30)).toBe(true);
  });

  it('result has no origins when inputs have no origins', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [10, 0, 0]);
    const result = unwrap(fuse(a, b));
    expect(getFaceOrigins(result)).toBeUndefined();
  });
});

describe('origin propagation through cut', () => {
  it('propagates origins from base shape', () => {
    const base = box(20, 20, 20);
    const tool = translate(box(10, 10, 30), [5, 5, -5]);
    setShapeOrigin(base, 1);
    setShapeOrigin(tool, 2);

    const result = unwrap(cut(base, tool));
    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;

    const originValues = new Set<number>();
    for (const f of getFaces(result)) {
      originValues.add(origins.get(getHashCode(f)) ?? -1);
    }
    expect(originValues.has(1)).toBe(true);
  });
});

describe('origin propagation through fuseAll', () => {
  it('propagates origins from all inputs (pairwise)', () => {
    const shapes = [
      box(10, 10, 10),
      translate(box(10, 10, 10), [10, 0, 0]),
      translate(box(10, 10, 10), [20, 0, 0]),
    ];
    for (let i = 0; i < shapes.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      setShapeOrigin(shapes[i]!, i + 1);
    }

    const result = unwrap(fuseAll(shapes, { strategy: 'pairwise' }));
    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;

    const originValues = new Set<number>();
    for (const f of getFaces(result)) {
      originValues.add(origins.get(getHashCode(f)) ?? -1);
    }
    expect(originValues.has(1)).toBe(true);
    expect(originValues.has(2)).toBe(true);
    expect(originValues.has(3)).toBe(true);
  });

  it('propagates some origins via native strategy (hash fallback)', () => {
    const shapes = [
      box(10, 10, 10),
      translate(box(10, 10, 10), [10, 0, 0]),
      translate(box(10, 10, 10), [20, 0, 0]),
    ];
    for (let i = 0; i < shapes.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      setShapeOrigin(shapes[i]!, i + 1);
    }

    const result = unwrap(fuseAll(shapes, { strategy: 'native' }));
    const origins = getFaceOrigins(result);
    // Native path uses hash fallback — at least some faces should have origins
    expect(origins).toBeDefined();
    if (!origins) return;
    expect(origins.size).toBeGreaterThan(0);
  });
});

describe('origin propagation through cutAll', () => {
  it('propagates origins from base and tools', () => {
    const base = box(30, 30, 30);
    const tools = [
      translate(box(10, 10, 40), [0, 0, -5]),
      translate(box(10, 10, 40), [15, 15, -5]),
    ];
    setShapeOrigin(base, 1);
    for (const [i, t] of tools.entries()) {
      setShapeOrigin(t, i + 2);
    }

    const result = unwrap(cutAll(base, tools));
    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;

    const originValues = new Set<number>();
    for (const f of getFaces(result)) {
      originValues.add(origins.get(getHashCode(f)) ?? -1);
    }
    expect(originValues.has(1)).toBe(true);
  });
});

describe('origin propagation through transforms', () => {
  it('preserves origins through translate', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 5);
    const moved = translate(b, [100, 0, 0]);
    const origins = getFaceOrigins(moved);
    expect(origins).toBeDefined();
    if (!origins) return;
    for (const f of getFaces(moved)) {
      expect(origins.get(getHashCode(f))).toBe(5);
    }
  });

  it('preserves origins through rotate', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 7);
    const rotated = rotate(b, 45);
    const origins = getFaceOrigins(rotated);
    expect(origins).toBeDefined();
    if (!origins) return;
    for (const f of getFaces(rotated)) {
      expect(origins.get(getHashCode(f))).toBe(7);
    }
  });

  it('preserves origins through chained transforms', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 3);
    const result = translate(rotate(b, 90), [50, 0, 0]);
    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;
    for (const f of getFaces(result)) {
      expect(origins.get(getHashCode(f))).toBe(3);
    }
  });
});

describe('origin propagation through modifiers', () => {
  it('preserves origins through fillet', () => {
    const b = box(20, 20, 20);
    setShapeOrigin(b, 8);

    const result = unwrap(fillet(b, undefined, 2));
    const origins = getFaceOrigins(result);
    expect(origins).toBeDefined();
    if (!origins) return;

    // Original box faces (modified by fillet) should keep origin 8
    // Fillet surfaces (generated) may get origin 0
    const originValues = new Set<number>();
    for (const f of getFaces(result)) {
      const o = origins.get(getHashCode(f));
      if (o !== undefined) originValues.add(o);
    }
    expect(originValues.has(8)).toBe(true);
  });
});

describe('mesh origin output', () => {
  it('includes origin in faceGroups for tagged shapes', () => {
    const b = box(10, 10, 10);
    setShapeOrigin(b, 42);

    const m = mesh(b);
    expect(m.faceGroups.length).toBe(6);
    for (const g of m.faceGroups) {
      expect(g.origin).toBe(42);
    }
  });

  it('defaults origin to 0 for untagged shapes', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    for (const g of m.faceGroups) {
      expect(g.origin).toBe(0);
    }
  });

  it('includes correct origins for fused shapes', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [10, 0, 0]);
    setShapeOrigin(a, 1);
    setShapeOrigin(b, 2);

    const result = unwrap(fuse(a, b));
    const m = mesh(result);

    const originValues = new Set(m.faceGroups.map((g) => g.origin));
    expect(originValues.has(1)).toBe(true);
    expect(originValues.has(2)).toBe(true);
  });
});
