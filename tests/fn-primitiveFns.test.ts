import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  ellipsoid,
  filledFace,
  subFace,
  sewShells,
  addHoles,
  offsetFace,
  circle,
  box,
  sketchRectangle,
  sketchCircle,
  castShape,
  measureVolume,
  measureArea,
  isSolid,
  isFace,
  isOk,
  unwrap,
  getFaces,
} from '../src/index.js';
import type { Wire, Face } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('ellipsoid', () => {
  it('creates a solid with expected volume', () => {
    const rx = 10;
    const ry = 5;
    const rz = 3;
    const s = ellipsoid(rx, ry, rz);
    expect(isSolid(s)).toBe(true);
    const expectedVolume = (4 / 3) * Math.PI * rx * ry * rz;
    expect(unwrap(measureVolume(s))).toBeCloseTo(expectedVolume, -1);
  });

  it('creates a sphere when all radii are equal', () => {
    const r = 7;
    const s = ellipsoid(r, r, r);
    expect(isSolid(s)).toBe(true);
    const expectedVolume = (4 / 3) * Math.PI * r * r * r;
    expect(unwrap(measureVolume(s))).toBeCloseTo(expectedVolume, -1);
  });
});

describe('filledFace', () => {
  it('creates a face from a closed wire', () => {
    const c = circle(10);
    const w = castShape(c.wrapped) as Wire;
    const result = filledFace(w);
    expect(isOk(result)).toBe(true);
    const face = unwrap(result);
    expect(isFace(face)).toBe(true);
  });
});

describe('subFace', () => {
  it('creates a face bounded by a wire on an existing face surface', () => {
    // Create a large planar face
    const rect = sketchRectangle(20, 20);
    const outerFace = castShape(rect.face().wrapped) as Face;
    // Create a smaller wire on the same plane
    const innerRect = sketchRectangle(5, 5);
    const innerWire = castShape(innerRect.wire.wrapped) as Wire;

    const result = subFace(outerFace, innerWire);
    expect(isFace(result)).toBe(true);
    // Sub-face area should be approximately 5*5 = 25
    expect(unwrap(measureArea(result))).toBeCloseTo(25, 0);
  });
});

describe('sewShells', () => {
  it('sews multiple faces into a shell', () => {
    // Get faces from a box — they share edges and can be sewn back together
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const result = sewShells(faces);
    expect(isOk(result)).toBe(true);
  });
});

describe('addHoles', () => {
  it('creates a face with holes that has less area than the original', () => {
    const rect = sketchRectangle(20, 20);
    const outerFace = castShape(rect.face().wrapped) as Face;
    const originalArea = unwrap(measureArea(outerFace));

    // Create a circular hole
    const holeCircle = sketchCircle(3);
    const holeWire = castShape(holeCircle.wire.wrapped) as Wire;

    const faceWithHole = addHoles(outerFace, [holeWire]);
    expect(isFace(faceWithHole)).toBe(true);
    expect(unwrap(measureArea(faceWithHole))).toBeLessThan(originalArea);
  });
});

describe('offsetFace', () => {
  it('offsets a face and returns a result', () => {
    const rect = sketchRectangle(10, 10);
    const f = castShape(rect.face().wrapped) as Face;
    const result = offsetFace(f, 2);
    expect(isOk(result)).toBe(true);
  });
});
