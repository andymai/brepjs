import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeLine,
  makeFace,
  makeVertex,
  assembleWire,
  // functional API
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
  buildCompound,
  getFaces,
  getEdges,
  type AnyShape,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('getShapeKind', () => {
  it('returns solid for a box', () => {
    const box = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    expect(getShapeKind(box)).toBe('solid');
  });

  it('returns edge for a line', () => {
    const line = castShape(makeLine([0, 0, 0], [10, 0, 0]).wrapped);
    expect(getShapeKind(line)).toBe('edge');
  });

  it('returns vertex for a point', () => {
    const vertex = castShape(makeVertex([5, 5, 5]).wrapped);
    expect(getShapeKind(vertex)).toBe('vertex');
  });

  it('returns compound for multiple shapes', () => {
    const box1 = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const box2 = castShape(makeBox([20, 0, 0], [30, 10, 10]).wrapped);
    const compound = buildCompound([box1, box2]);
    expect(getShapeKind(compound)).toBe('compound');
  });
});

describe('type guards', () => {
  // Create shapes fresh for each test to avoid reuse issues
  function createVertex() {
    return castShape(makeVertex([5, 5, 5]).wrapped);
  }

  function createEdge() {
    return castShape(makeLine([0, 0, 0], [10, 0, 0]).wrapped);
  }

  function createWire() {
    // assembleWire takes Edge objects and returns Result<Wire>
    const edge1 = makeLine([0, 0, 0], [10, 0, 0]);
    const edge2 = makeLine([10, 0, 0], [10, 10, 0]);
    const wireResult = assembleWire([edge1, edge2]);
    if (!wireResult.ok) throw new Error('Failed to create wire');
    return castShape(wireResult.value.wrapped);
  }

  function createSolid() {
    return castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
  }

  function createFace() {
    const solid = createSolid();
    return getFaces(solid)[0]!;
  }

  function createCompound() {
    const s1 = castShape(makeBox([0, 0, 0], [10, 10, 10]).wrapped);
    const s2 = castShape(makeBox([20, 0, 0], [30, 10, 10]).wrapped);
    return buildCompound([s1, s2]);
  }

  describe('isVertex', () => {
    it('returns true for vertex', () => expect(isVertex(createVertex())).toBe(true));
    it('returns false for edge', () => expect(isVertex(createEdge())).toBe(false));
    it('returns false for solid', () => expect(isVertex(createSolid())).toBe(false));
  });

  describe('isEdge', () => {
    it('returns true for edge', () => expect(isEdge(createEdge())).toBe(true));
    it('returns false for vertex', () => expect(isEdge(createVertex())).toBe(false));
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
    it('returns false for compound', () => expect(isShell(createCompound())).toBe(false));
  });

  describe('isSolid', () => {
    it('returns true for solid', () => expect(isSolid(createSolid())).toBe(true));
    it('returns false for face', () => expect(isSolid(createFace())).toBe(false));
    it('returns false for compound', () => expect(isSolid(createCompound())).toBe(false));
  });

  describe('isCompound', () => {
    it('returns true for compound', () => expect(isCompound(createCompound())).toBe(true));
    it('returns false for solid', () => expect(isCompound(createSolid())).toBe(false));
    it('returns false for face', () => expect(isCompound(createFace())).toBe(false));
  });

  describe('isShape3D', () => {
    it('returns true for solid', () => expect(isShape3D(createSolid())).toBe(true));
    it('returns true for compound', () => expect(isShape3D(createCompound())).toBe(true));
    it('returns false for edge', () => expect(isShape3D(createEdge())).toBe(false));
    it('returns false for face', () => expect(isShape3D(createFace())).toBe(false));
  });

  describe('isShape1D', () => {
    it('returns true for edge', () => expect(isShape1D(createEdge())).toBe(true));
    it('returns true for wire', () => expect(isShape1D(createWire())).toBe(true));
    it('returns false for solid', () => expect(isShape1D(createSolid())).toBe(false));
    it('returns false for face', () => expect(isShape1D(createFace())).toBe(false));
    it('returns false for vertex', () => expect(isShape1D(createVertex())).toBe(false));
  });
});
