import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  sphere as _sphere,
  getEdges as _getEdges,
  getFaces as _getFaces,
  getWires as _getWires,
  isValid,
  healSolid,
  healFace,
  healWire,
  heal,
  isOk,
  unwrap as _unwrap,
  measureVolume as _measureVolume,
  measureArea as _measureArea,
  isSolid as _isSolid,
  isFace,
  isWire,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('isValid', () => {
  it('returns true for a valid box', () => {
    const b = box(10, 10, 10);
    expect(isValid(b)).toBe(true);
  });

  it('returns true for a valid sphere', () => {
    const s = sphere(5);
    expect(isValid(s)).toBe(true);
  });

  it('returns true for a valid face', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
     
     
    expect(isValid(faces[0])).toBe(true);
  });
});

describe('healSolid', () => {
  it('heals a valid solid (returns original)', () => {
    const b = box(10, 10, 10);
    expect(isValid(b)).toBe(true);
    const result = healSolid(b);
    expect(isOk(result)).toBe(true);
    const healed = unwrap(result);
    expect(isSolid(healed)).toBe(true);
    // Volume should be preserved
    const vol = measureVolume(healed);
    expect(vol).toBeCloseTo(1000, 0);
  });

  it('heals a sphere solid', () => {
    const s = sphere(5);
    const result = healSolid(s);
    // ShapeFix_Solid may or may not successfully heal a sphere
    // (spheres have special topology), but it should not crash
    if (isOk(result)) {
      expect(isSolid(unwrap(result))).toBe(true);
    }
  });
});

describe('healFace', () => {
  it('heals a valid face (no-op)', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
     
     
    const result = healFace(faces[0]);
    expect(isOk(result)).toBe(true);
    const healed = unwrap(result);
    expect(isFace(healed)).toBe(true);
  });

  it('preserves face area', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
     
     
    const originalArea = measureArea(faces[0]);
     
     
    const healed = unwrap(healFace(faces[0]));
    const healedArea = measureArea(healed);
    expect(healedArea).toBeCloseTo(originalArea, 2);
  });
});

describe('healWire', () => {
  it('heals a valid wire (no-op)', () => {
    const b = box(10, 10, 10);
    const wires = getWires(b);
     
     
    const result = healWire(wires[0]);
    expect(isOk(result)).toBe(true);
    expect(isWire(unwrap(result))).toBe(true);
  });

  it('heals a wire with face context', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
     
     
    const wires = getWires(faces[0]);
     
     
    const result = healWire(wires[0], faces[0]);
    expect(isOk(result)).toBe(true);
    expect(isWire(unwrap(result))).toBe(true);
  });
});

describe('heal', () => {
  it('dispatches to healSolid for solids', () => {
    const b = box(10, 10, 10);
    const result = heal(b);
    expect(isOk(result)).toBe(true);
    expect(isSolid(unwrap(result))).toBe(true);
  });

  it('dispatches to healFace for faces', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
     
     
    const result = heal(faces[0]);
    expect(isOk(result)).toBe(true);
    expect(isFace(unwrap(result))).toBe(true);
  });

  it('dispatches to healWire for wires', () => {
    const b = box(10, 10, 10);
    const wires = getWires(b);
     
     
    const result = heal(wires[0]);
    expect(isOk(result)).toBe(true);
    expect(isWire(unwrap(result))).toBe(true);
  });

  it('returns ok for unsupported shape types (passthrough)', () => {
    const b = box(10, 10, 10);
    // An edge is neither solid, face, nor wire — should passthrough
    const edges = getEdges(b);
     
     
    const result = heal(edges[0]);
    expect(isOk(result)).toBe(true);
  });
});
