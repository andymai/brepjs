import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  sketchCircle,
  assembleWire,
  makeLine,
  // functional API
  castShape,
  extrudeFace,
  revolveFace,
  sweep,
  fnComplexExtrude,
  fnTwistExtrude,
  fnMeasureVolume,
  fnMeasureArea,
  isOk,
  unwrap,
  fnIsSolid,
  fnIsShape3D,
  getFaces,
} from '../src/index.js';
import type { Wire as FnWire } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('extrudeFace', () => {
  it('extrudes a rectangle into a box', () => {
    const rect = sketchRectangle(10, 20);
    const face = castShape(rect.face().wrapped);
    const solid = extrudeFace(face, [0, 0, 30]);
    expect(fnIsSolid(solid)).toBe(true);
    expect(fnMeasureVolume(solid)).toBeCloseTo(10 * 20 * 30, 0);
  });

  it('extrudes a circle into a cylinder', () => {
    const circle = sketchCircle(5);
    const face = castShape(circle.face().wrapped);
    const solid = extrudeFace(face, [0, 0, 10]);
    expect(fnMeasureVolume(solid)).toBeCloseTo(Math.PI * 25 * 10, 0);
  });
});

describe('revolveFace', () => {
  it('revolves a rectangle 360 degrees into a cylinder', () => {
    const rect = sketchRectangle(2, 5, { origin: [6, 0] });
    const face = castShape(rect.face().wrapped);
    const result = revolveFace(face, [0, 0, 0], [0, 1, 0], 360);
    expect(isOk(result)).toBe(true);
    expect(fnIsShape3D(unwrap(result))).toBe(true);
  });

  it('revolves a rectangle 90 degrees', () => {
    const rect = sketchRectangle(2, 5, { origin: [6, 0] });
    const face = castShape(rect.face().wrapped);
    const result = revolveFace(face, [0, 0, 0], [0, 1, 0], 90);
    expect(isOk(result)).toBe(true);
  });
});

describe('sweep', () => {
  it('sweeps a circle along a line', () => {
    const circle = sketchCircle(2);
    const profile = castShape(circle.wire.wrapped) as FnWire;
    const e = makeLine([0, 0, 0], [0, 0, 20]);
    const spine = castShape(unwrap(assembleWire([e])).wrapped) as FnWire;
    const result = sweep(profile, spine);
    expect(isOk(result)).toBe(true);
    expect(fnIsShape3D(unwrap(result))).toBe(true);
  });
});

describe('fnComplexExtrude', () => {
  it('extrudes with linear profile', () => {
    const circle = sketchCircle(5);
    const wire = castShape(circle.wire.wrapped) as FnWire;
    const result = fnComplexExtrude(wire, [0, 0, 0], [0, 0, 10], {
      profile: 'linear',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    expect(fnIsShape3D(unwrap(result))).toBe(true);
  });

  it('extrudes with s-curve profile', () => {
    const circle = sketchCircle(5);
    const wire = castShape(circle.wire.wrapped) as FnWire;
    const result = fnComplexExtrude(wire, [0, 0, 0], [0, 0, 10], {
      profile: 's-curve',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
  });

  it('extrudes without profile (simple)', () => {
    const circle = sketchCircle(5);
    const wire = castShape(circle.wire.wrapped) as FnWire;
    const result = fnComplexExtrude(wire, [0, 0, 0], [0, 0, 10]);
    expect(isOk(result)).toBe(true);
  });
});

describe('fnTwistExtrude', () => {
  it('extrudes with twist', () => {
    const rect = sketchRectangle(6, 6);
    const wire = castShape(rect.wire.wrapped) as FnWire;
    const result = fnTwistExtrude(wire, 90, [0, 0, 0], [0, 0, 20]);
    expect(isOk(result)).toBe(true);
    expect(fnIsShape3D(unwrap(result))).toBe(true);
  });
});
