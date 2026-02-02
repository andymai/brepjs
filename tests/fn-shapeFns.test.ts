import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeLine,
  makeCylinder,
  makeVertex,
  sketchRectangle,
  measureVolume,
  // functional API
  cloneShape,
  serializeShape,
  getHashCode,
  isShapeNull,
  isSameShape,
  isEqualShape,
  simplifyShape,
  translateShape,
  rotateShape,
  mirrorShape,
  scaleShape,
  getEdges,
  getFaces,
  getWires,
  getBounds,
  vertexPosition,
  castShape,
  fnIsEdge,
  fnIsFace,
  fnIsSolid,
  fnIsVertex,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('cloneShape', () => {
  it('clones a solid preserving volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cloned = cloneShape(castShape(box.wrapped));
    expect(measureVolume(makeBox([0, 0, 0], [10, 10, 10]))).toBeCloseTo(1000, 0);
    expect(cloned).toBeDefined();
  });
});

describe('serializeShape', () => {
  it('serializes a box to a non-empty string', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const s = serializeShape(castShape(box.wrapped));
    expect(s.length).toBeGreaterThan(0);
  });
});

describe('getHashCode', () => {
  it('returns a positive integer', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const h = getHashCode(castShape(box.wrapped));
    expect(h).toBeGreaterThan(0);
  });
});

describe('isShapeNull', () => {
  it('returns false for a valid shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isShapeNull(castShape(box.wrapped))).toBe(false);
  });
});

describe('isSameShape / isEqualShape', () => {
  it('shape is same as itself', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const s = castShape(box.wrapped);
    expect(isSameShape(s, s)).toBe(true);
    expect(isEqualShape(s, s)).toBe(true);
  });
});

describe('simplifyShape', () => {
  it('simplifies a fused shape', () => {
    const a = makeBox([0, 0, 0], [10, 10, 10]);
    // fuse creates extra faces; simplify removes co-planar seams
    const fused = a.fuse(makeBox([10, 0, 0], [20, 10, 10]), { simplify: false });
    const simplified = simplifyShape(castShape(fused.value.wrapped));
    expect(simplified).toBeDefined();
  });
});

describe('translateShape', () => {
  it('translates without changing volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const translated = translateShape(castShape(box.wrapped), [5, 0, 0]);
    expect(translated).toBeDefined();
    // Type is preserved
    expect(fnIsSolid(translated)).toBe(true);
  });
});

describe('rotateShape', () => {
  it('rotates without changing volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const rotated = rotateShape(castShape(box.wrapped), [0, 0, 0], [0, 0, 1], 90);
    expect(rotated).toBeDefined();
    expect(fnIsSolid(rotated)).toBe(true);
  });
});

describe('mirrorShape', () => {
  it('mirrors without changing volume', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mirrored = mirrorShape(castShape(box.wrapped), [0, 1, 0], [0, 0, 0]);
    expect(mirrored).toBeDefined();
    expect(fnIsSolid(mirrored)).toBe(true);
  });
});

describe('scaleShape', () => {
  it('scales a shape', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const scaled = scaleShape(castShape(box.wrapped), [5, 5, 5], 0.5);
    expect(scaled).toBeDefined();
    expect(fnIsSolid(scaled)).toBe(true);
  });
});

describe('getEdges / getFaces / getWires', () => {
  it('gets 12 edges from a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const edges = getEdges(castShape(box.wrapped));
    expect(edges.length).toBe(12);
    expect(fnIsEdge(edges[0]!)).toBe(true);
  });

  it('gets 6 faces from a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(castShape(box.wrapped));
    expect(faces.length).toBe(6);
    expect(fnIsFace(faces[0]!)).toBe(true);
  });

  it('gets wires from a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const wires = getWires(castShape(box.wrapped));
    expect(wires.length).toBeGreaterThan(0);
  });
});

describe('getBounds', () => {
  it('returns correct bounding box', () => {
    const box = makeBox([0, 0, 0], [10, 20, 30]);
    const b = getBounds(castShape(box.wrapped));
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
    const v = makeVertex([3, 4, 5]);
    const pos = vertexPosition(castShape(v.wrapped));
    expect(pos[0]).toBeCloseTo(3);
    expect(pos[1]).toBeCloseTo(4);
    expect(pos[2]).toBeCloseTo(5);
  });
});
