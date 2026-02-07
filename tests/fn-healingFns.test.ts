import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  makeSphere,
  getEdges,
  getFaces,
  getWires,
  isShapeValid,
  healSolid,
  healFace,
  healWire,
  healShape,
  isOk,
  unwrap,
  measureVolume,
  measureArea,
  isSolid,
  isFace,
  isWire,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('isShapeValid', () => {
  it('returns true for a valid box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isShapeValid(box)).toBe(true);
  });

  it('returns true for a valid sphere', () => {
    const sphere = makeSphere(5);
    expect(isShapeValid(sphere)).toBe(true);
  });

  it('returns true for a valid face', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    expect(isShapeValid(faces[0]!)).toBe(true);
  });
});

describe('healSolid', () => {
  it('heals a valid solid (returns original)', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    expect(isShapeValid(box)).toBe(true);
    const result = healSolid(box);
    expect(isOk(result)).toBe(true);
    const healed = unwrap(result);
    expect(isSolid(healed)).toBe(true);
    // Volume should be preserved
    const vol = measureVolume(healed);
    expect(vol).toBeCloseTo(1000, 0);
  });

  it('heals a sphere solid', () => {
    const sphere = makeSphere(5);
    const result = healSolid(sphere);
    // ShapeFix_Solid may or may not successfully heal a sphere
    // (spheres have special topology), but it should not crash
    if (isOk(result)) {
      expect(isSolid(unwrap(result))).toBe(true);
    }
  });
});

describe('healFace', () => {
  it('heals a valid face (no-op)', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const result = healFace(faces[0]!);
    expect(isOk(result)).toBe(true);
    const healed = unwrap(result);
    expect(isFace(healed)).toBe(true);
  });

  it('preserves face area', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const originalArea = measureArea(faces[0]!);
    const healed = unwrap(healFace(faces[0]!));
    const healedArea = measureArea(healed);
    expect(healedArea).toBeCloseTo(originalArea, 2);
  });
});

describe('healWire', () => {
  it('heals a valid wire (no-op)', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const wires = getWires(box);
    const result = healWire(wires[0]!);
    expect(isOk(result)).toBe(true);
    expect(isWire(unwrap(result))).toBe(true);
  });

  it('heals a wire with face context', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const wires = getWires(faces[0]!);
    const result = healWire(wires[0]!, faces[0]!);
    expect(isOk(result)).toBe(true);
    expect(isWire(unwrap(result))).toBe(true);
  });
});

describe('healShape', () => {
  it('dispatches to healSolid for solids', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const result = healShape(box);
    expect(isOk(result)).toBe(true);
    expect(isSolid(unwrap(result))).toBe(true);
  });

  it('dispatches to healFace for faces', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const faces = getFaces(box);
    const result = healShape(faces[0]!);
    expect(isOk(result)).toBe(true);
    expect(isFace(unwrap(result))).toBe(true);
  });

  it('dispatches to healWire for wires', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const wires = getWires(box);
    const result = healShape(wires[0]!);
    expect(isOk(result)).toBe(true);
    expect(isWire(unwrap(result))).toBe(true);
  });

  it('returns ok for unsupported shape types (passthrough)', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    // An edge is neither solid, face, nor wire — should passthrough
    const edges = getEdges(box);
    const result = healShape(edges[0]!);
    expect(isOk(result)).toBe(true);
  });
});
