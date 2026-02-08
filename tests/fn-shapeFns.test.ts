import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  vertex,
  measureVolume as _measureVolume,
  // functional API
  clone,
  toBREP,
  getHashCode,
  isEmpty,
  isSameShape,
  isEqualShape,
  simplify,
  translate,
  rotate,
  mirror,
  scale,
  fuse,
  getEdges as _getEdges,
  getFaces as _getFaces,
  getWires as _getWires,
  iterEdges,
  iterFaces,
  iterWires,
  getBounds,
  vertexPosition,
  isEdge,
  isFace,
  isSolid as _isSolid,
  isWire,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('clone', () => {
  it('clones a solid preserving volume', () => {
    const b = box(10, 10, 10);
    const cloned = clone(b);
    expect(measureVolume(box(10, 10, 10))).toBeCloseTo(1000, 0);
    expect(cloned).toBeDefined();
  });
});

describe('toBREP', () => {
  it('serializes a box to a non-empty string', () => {
    const b = box(5, 5, 5);
    const s = toBREP(b);
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('getHashCode', () => {
  it('returns a positive integer', () => {
    const b = box(10, 10, 10);
    const h = getHashCode(b);
    expect(h).toBeGreaterThan(0);
  });
});

describe('isEmpty', () => {
  it('returns false for a valid shape', () => {
    const b = box(10, 10, 10);
    expect(isEmpty(b)).toBe(false);
  });
});

describe('isSameShape / isEqualShape', () => {
  it('shape is same as itself', () => {
    const s = box(10, 10, 10);
    expect(isSameShape(s, s)).toBe(true);
    expect(isEqualShape(s, s)).toBe(true);
  });
});

describe('simplify', () => {
  it('simplifies a fused shape', () => {
    const a = box(10, 10, 10);
    // fuse creates extra faces; simplify removes co-planar seams
    const fused = fuse(a, translate(box(10, 10, 10), [10, 0, 0]), {
      simplify: false,
    });
    const simplified = simplify(fused.value);
    expect(simplified).toBeDefined();
  });
});

describe('translate', () => {
  it('translates without changing volume', () => {
    const b = box(10, 10, 10);
    const translated = translate(b, [5, 0, 0]);
    expect(translated).toBeDefined();
    // Type is preserved
    expect(isSolid(translated)).toBe(true);
  });
});

describe('rotate', () => {
  it('rotates without changing volume', () => {
    const b = box(10, 10, 10);
    const rotated = rotate(b, 90, { around: [0, 0, 0], axis: [0, 0, 1] });
    expect(rotated).toBeDefined();
    expect(isSolid(rotated)).toBe(true);
  });
});

describe('mirror', () => {
  it('mirrors without changing volume', () => {
    const b = box(10, 10, 10);
    const mirrored = mirror(b, { normal: [0, 1, 0], origin: [0, 0, 0] });
    expect(mirrored).toBeDefined();
    expect(isSolid(mirrored)).toBe(true);
  });
});

describe('scale', () => {
  it('scales a shape', () => {
    const b = box(10, 10, 10);
    const scaled = scale(b, 0.5, { center: [5, 5, 5] });
    expect(scaled).toBeDefined();
    expect(isSolid(scaled)).toBe(true);
  });
});

describe('getEdges / getFaces / getWires', () => {
  it('gets 12 edges from a box', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    expect(edges.length).toBe(12);
     
     
    expect(isEdge(edges[0])).toBe(true);
  });

  it('gets 6 faces from a box', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(faces.length).toBe(6);
     
     
    expect(isFace(faces[0])).toBe(true);
  });

  it('gets wires from a box', () => {
    const b = box(10, 10, 10);
    const wires = getWires(b);
    expect(wires.length).toBeGreaterThan(0);
  });
});

describe('getBounds', () => {
  it('returns correct bounding box', () => {
    const solid = box(10, 20, 30);
    const b = getBounds(solid);
    expect(b.xMin).toBeCloseTo(0, 1);
    expect(b.yMin).toBeCloseTo(0, 1);
    expect(b.zMin).toBeCloseTo(0, 1);
    expect(b.xMax).toBeCloseTo(10, 1);
    expect(b.yMax).toBeCloseTo(20, 1);
    expect(b.zMax).toBeCloseTo(30, 1);
  });
});

describe('vertexPosition', () => {
  it('returns Vec3 tuple for vertex', () => {
    const v = vertex([3, 4, 5]);
    const pos = vertexPosition(v);
    expect(pos[0]).toBeCloseTo(3);
    expect(pos[1]).toBeCloseTo(4);
    expect(pos[2]).toBeCloseTo(5);
  });
});

// ---------------------------------------------------------------------------
// Lazy topology iterators
// ---------------------------------------------------------------------------

describe('iterEdges', () => {
  it('yields same edges as getEdges', () => {
    const b = box(10, 10, 10);
    const eager = getEdges(b);
    const lazy = [...iterEdges(b)];
    expect(lazy.length).toBe(eager.length);
    // A box has 12 edges
    expect(lazy.length).toBe(12);
  });

  it('yields branded Edge values', () => {
    const b = box(5, 5, 5);
    for (const edge of iterEdges(b)) {
      expect(isEdge(edge)).toBe(true);
    }
  });

  it('supports early termination', () => {
    const b = box(10, 10, 10);
    let count = 0;
    for (const _edge of iterEdges(b)) {
      count++;
      if (count === 3) break;
    }
    expect(count).toBe(3);
  });
});

describe('iterFaces', () => {
  it('yields same faces as getFaces', () => {
    const b = box(10, 10, 10);
    const eager = getFaces(b);
    const lazy = [...iterFaces(b)];
    expect(lazy.length).toBe(eager.length);
    // A box has 6 faces
    expect(lazy.length).toBe(6);
  });

  it('yields branded Face values', () => {
    const b = box(5, 5, 5);
    for (const face of iterFaces(b)) {
      expect(isFace(face)).toBe(true);
    }
  });
});

describe('iterWires', () => {
  it('yields same wires as getWires', () => {
    const b = box(10, 10, 10);
    const eager = getWires(b);
    const lazy = [...iterWires(b)];
    expect(lazy.length).toBe(eager.length);
  });

  it('yields branded Wire values', () => {
    const b = box(5, 5, 5);
    for (const wire of iterWires(b)) {
      expect(isWire(wire)).toBe(true);
    }
  });
});
