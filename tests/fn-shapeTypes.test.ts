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
  fnIsVertex,
  fnIsEdge,
  fnIsWire,
  fnIsFace,
  fnIsShell,
  fnIsSolid,
  fnIsCompound,
  fnIsShape3D,
  fnIsShape1D,
  fnBuildCompound,
  getFaces,
  getEdges,
  type FnAnyShape,
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
    const compound = fnBuildCompound([box1, box2]);
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
    return fnBuildCompound([s1, s2]);
  }

  describe('fnIsVertex', () => {
    it('returns true for vertex', () => expect(fnIsVertex(createVertex())).toBe(true));
    it('returns false for edge', () => expect(fnIsVertex(createEdge())).toBe(false));
    it('returns false for solid', () => expect(fnIsVertex(createSolid())).toBe(false));
  });

  describe('fnIsEdge', () => {
    it('returns true for edge', () => expect(fnIsEdge(createEdge())).toBe(true));
    it('returns false for vertex', () => expect(fnIsEdge(createVertex())).toBe(false));
    it('returns false for solid', () => expect(fnIsEdge(createSolid())).toBe(false));
  });

  describe('fnIsWire', () => {
    it('returns true for wire', () => expect(fnIsWire(createWire())).toBe(true));
    it('returns false for edge', () => expect(fnIsWire(createEdge())).toBe(false));
    it('returns false for solid', () => expect(fnIsWire(createSolid())).toBe(false));
  });

  describe('fnIsFace', () => {
    it('returns true for face', () => expect(fnIsFace(createFace())).toBe(true));
    it('returns false for edge', () => expect(fnIsFace(createEdge())).toBe(false));
    it('returns false for solid', () => expect(fnIsFace(createSolid())).toBe(false));
  });

  describe('fnIsShell', () => {
    // Shells are harder to create directly, test negative cases
    it('returns false for solid', () => expect(fnIsShell(createSolid())).toBe(false));
    it('returns false for face', () => expect(fnIsShell(createFace())).toBe(false));
    it('returns false for compound', () => expect(fnIsShell(createCompound())).toBe(false));
  });

  describe('fnIsSolid', () => {
    it('returns true for solid', () => expect(fnIsSolid(createSolid())).toBe(true));
    it('returns false for face', () => expect(fnIsSolid(createFace())).toBe(false));
    it('returns false for compound', () => expect(fnIsSolid(createCompound())).toBe(false));
  });

  describe('fnIsCompound', () => {
    it('returns true for compound', () => expect(fnIsCompound(createCompound())).toBe(true));
    it('returns false for solid', () => expect(fnIsCompound(createSolid())).toBe(false));
    it('returns false for face', () => expect(fnIsCompound(createFace())).toBe(false));
  });

  describe('fnIsShape3D', () => {
    it('returns true for solid', () => expect(fnIsShape3D(createSolid())).toBe(true));
    it('returns true for compound', () => expect(fnIsShape3D(createCompound())).toBe(true));
    it('returns false for edge', () => expect(fnIsShape3D(createEdge())).toBe(false));
    it('returns false for face', () => expect(fnIsShape3D(createFace())).toBe(false));
  });

  describe('fnIsShape1D', () => {
    it('returns true for edge', () => expect(fnIsShape1D(createEdge())).toBe(true));
    it('returns true for wire', () => expect(fnIsShape1D(createWire())).toBe(true));
    it('returns false for solid', () => expect(fnIsShape1D(createSolid())).toBe(false));
    it('returns false for face', () => expect(fnIsShape1D(createFace())).toBe(false));
    it('returns false for vertex', () => expect(fnIsShape1D(createVertex())).toBe(false));
  });
});
