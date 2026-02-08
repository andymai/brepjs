import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  line,
  vertex,
  wire,
  castShape,
  getShapeKind,
  isVertex,
  isEdge,
  isWire,
  isFace,
  isShell,
  isSolid,
  isCompound,
  isShape3D,
  isShape1D,
  compound,
  getFaces,
  getEdges,
  type AnyShape,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('getShapeKind', () => {
  it('returns solid for a box', () => {
    const b = castShape(box(10, 10, 10).wrapped);
    expect(getShapeKind(b)).toBe('solid');
  });

  it('returns edge for a line', () => {
    const l = castShape(line([0, 0, 0], [10, 0, 0]).wrapped);
    expect(getShapeKind(l)).toBe('edge');
  });

  it('returns vertex for a point', () => {
    const v = castShape(vertex([5, 5, 5]).wrapped);
    expect(getShapeKind(v)).toBe('vertex');
  });

  it('returns compound for multiple shapes', () => {
    const b1 = castShape(box(10, 10, 10).wrapped);
    const b2 = castShape(box(10, 10, 10).wrapped);
    const c = compound([b1, b2]);
    expect(getShapeKind(c)).toBe('compound');
  });
});

describe('type guards', () => {
  // Create shapes fresh for each test to avoid reuse issues
  function createTestVertex() {
    return castShape(vertex([5, 5, 5]).wrapped);
  }

  function createEdge() {
    return castShape(line([0, 0, 0], [10, 0, 0]).wrapped);
  }

  function createWire() {
    const edge1 = line([0, 0, 0], [10, 0, 0]);
    const edge2 = line([10, 0, 0], [10, 10, 0]);
    const wireResult = wire([edge1, edge2]);
    if (!wireResult.ok) throw new Error('Failed to create wire');
    return castShape(wireResult.value.wrapped);
  }

  function createSolid() {
    return castShape(box(10, 10, 10).wrapped);
  }

  function createFace() {
    const s = createSolid();
    return getFaces(s)[0]!;
  }

  function createTestCompound() {
    const s1 = castShape(box(10, 10, 10).wrapped);
    const s2 = castShape(box(10, 10, 10).wrapped);
    return compound([s1, s2]);
  }

  describe('isVertex', () => {
    it('returns true for vertex', () => expect(isVertex(createTestVertex())).toBe(true));
    it('returns false for edge', () => expect(isVertex(createEdge())).toBe(false));
    it('returns false for solid', () => expect(isVertex(createSolid())).toBe(false));
  });

  describe('isEdge', () => {
    it('returns true for edge', () => expect(isEdge(createEdge())).toBe(true));
    it('returns false for vertex', () => expect(isEdge(createTestVertex())).toBe(false));
    it('returns false for solid', () => expect(isEdge(createSolid())).toBe(false));
  });

  describe('isWire', () => {
    it('returns true for wire', () => expect(isWire(createWire())).toBe(true));
    it('returns false for edge', () => expect(isWire(createEdge())).toBe(false));
    it('returns false for solid', () => expect(isWire(createSolid())).toBe(false));
  });

  describe('isFace', () => {
    it('returns true for face', () => expect(isFace(createFace())).toBe(true));
    it('returns false for edge', () => expect(isFace(createEdge())).toBe(false));
    it('returns false for solid', () => expect(isFace(createSolid())).toBe(false));
  });

  describe('isShell', () => {
    // Shells are harder to create directly, test negative cases
    it('returns false for solid', () => expect(isShell(createSolid())).toBe(false));
    it('returns false for face', () => expect(isShell(createFace())).toBe(false));
    it('returns false for compound', () => expect(isShell(createTestCompound())).toBe(false));
  });

  describe('isSolid', () => {
    it('returns true for solid', () => expect(isSolid(createSolid())).toBe(true));
    it('returns false for face', () => expect(isSolid(createFace())).toBe(false));
    it('returns false for compound', () => expect(isSolid(createTestCompound())).toBe(false));
  });

  describe('isCompound', () => {
    it('returns true for compound', () => expect(isCompound(createTestCompound())).toBe(true));
    it('returns false for solid', () => expect(isCompound(createSolid())).toBe(false));
    it('returns false for face', () => expect(isCompound(createFace())).toBe(false));
  });

  describe('isShape3D', () => {
    it('returns true for solid', () => expect(isShape3D(createSolid())).toBe(true));
    it('returns true for compound', () => expect(isShape3D(createTestCompound())).toBe(true));
    it('returns false for edge', () => expect(isShape3D(createEdge())).toBe(false));
    it('returns false for face', () => expect(isShape3D(createFace())).toBe(false));
  });

  describe('isShape1D', () => {
    it('returns true for edge', () => expect(isShape1D(createEdge())).toBe(true));
    it('returns true for wire', () => expect(isShape1D(createWire())).toBe(true));
    it('returns false for solid', () => expect(isShape1D(createSolid())).toBe(false));
    it('returns false for face', () => expect(isShape1D(createFace())).toBe(false));
    it('returns false for vertex', () => expect(isShape1D(createTestVertex())).toBe(false));
  });
});
