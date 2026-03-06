import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
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
} from '../src/index.js';

beforeAll(async () => {
  await initKernel();
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
    return getFaces(s)[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
  }

  function createTestCompound() {
    const s1 = castShape(box(10, 10, 10).wrapped);
    const s2 = castShape(box(10, 10, 10).wrapped);
    return compound([s1, s2]);
  }

  describe('isVertex', () => {
    it('returns true for vertex', () => expect(isVertex(createTestVertex())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for edge', () => expect(isVertex(createEdge())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for solid', () => expect(isVertex(createSolid())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isEdge', () => {
    it('returns true for edge', () => expect(isEdge(createEdge())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for vertex', () => expect(isEdge(createTestVertex())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for solid', () => expect(isEdge(createSolid())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isWire', () => {
    it('returns true for wire', () => expect(isWire(createWire())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for edge', () => expect(isWire(createEdge())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for solid', () => expect(isWire(createSolid())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isFace', () => {
    it('returns true for face', () => expect(isFace(createFace())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for edge', () => expect(isFace(createEdge())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for solid', () => expect(isFace(createSolid())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isShell', () => {
    // Shells are harder to create directly, test negative cases
    it('returns false for solid', () => expect(isShell(createSolid())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for face', () => expect(isShell(createFace())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for compound', () => expect(isShell(createTestCompound())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isSolid', () => {
    it('returns true for solid', () => expect(isSolid(createSolid())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for face', () => expect(isSolid(createFace())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for compound', () => expect(isSolid(createTestCompound())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isCompound', () => {
    it('returns true for compound', () => expect(isCompound(createTestCompound())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for solid', () => expect(isCompound(createSolid())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for face', () => expect(isCompound(createFace())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isShape3D', () => {
    it('returns true for solid', () => expect(isShape3D(createSolid())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns true for compound', () => expect(isShape3D(createTestCompound())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for edge', () => expect(isShape3D(createEdge())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for face', () => expect(isShape3D(createFace())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });

  describe('isShape1D', () => {
    it('returns true for edge', () => expect(isShape1D(createEdge())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns true for wire', () => expect(isShape1D(createWire())).toBe(true)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for solid', () => expect(isShape1D(createSolid())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for face', () => expect(isShape1D(createFace())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
    it('returns false for vertex', () => expect(isShape1D(createTestVertex())).toBe(false)); // eslint-disable-line @typescript-eslint/no-confusing-void-expression
  });
});
