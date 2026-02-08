import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  sketchRectangle,
  sketchCircle,
  wire,
  line,
  castShape,
  extrude,
  revolve,
  sweep,
  complexExtrude,
  twistExtrude,
  measureVolume,
  isOk,
  unwrap,
  isSolid,
  isShape3D,
} from '../src/index.js';
import type { Wire } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('extrude', () => {
  it('extrudes a rectangle into a box', () => {
    const rect = sketchRectangle(10, 20);
    const f = castShape(rect.face().wrapped);
    const result = extrude(f, [0, 0, 30]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(isSolid(solid)).toBe(true);
    expect(measureVolume(solid)).toBeCloseTo(10 * 20 * 30, 0);
  });

  it('extrudes a circle into a cylinder', () => {
    const c = sketchCircle(5);
    const f = castShape(c.face().wrapped);
    const result = extrude(f, [0, 0, 10]);
    expect(isOk(result)).toBe(true);
    expect(measureVolume(unwrap(result))).toBeCloseTo(Math.PI * 25 * 10, 0);
  });
});

describe('revolve', () => {
  it('revolves a rectangle 360 degrees into a cylinder', () => {
    const rect = sketchRectangle(2, 5, { origin: [6, 0] });
    const f = castShape(rect.face().wrapped);
    const result = revolve(f, { around: [0, 0, 0], axis: [0, 1, 0], angle: 360 });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('revolves a rectangle 90 degrees', () => {
    const rect = sketchRectangle(2, 5, { origin: [6, 0] });
    const f = castShape(rect.face().wrapped);
    const result = revolve(f, { around: [0, 0, 0], axis: [0, 1, 0], angle: 90 });
    expect(isOk(result)).toBe(true);
  });
});

describe('sweep', () => {
  it('sweeps a circle along a line', () => {
    const c = sketchCircle(2);
    const profile = castShape(c.wire.wrapped) as Wire;
    const e = line([0, 0, 0], [0, 0, 20]);
    const spine = castShape(unwrap(wire([e])).wrapped) as Wire;
    const result = sweep(profile, spine);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });
});

describe('complexExtrude', () => {
  it('extrudes with linear profile', () => {
    const c = sketchCircle(5);
    const w = castShape(c.wire.wrapped) as Wire;
    const result = complexExtrude(w, [0, 0, 0], [0, 0, 10], {
      profile: 'linear',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });

  it('extrudes with s-curve profile', () => {
    const c = sketchCircle(5);
    const w = castShape(c.wire.wrapped) as Wire;
    const result = complexExtrude(w, [0, 0, 0], [0, 0, 10], {
      profile: 's-curve',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
  });

  it('extrudes without profile (simple)', () => {
    const c = sketchCircle(5);
    const w = castShape(c.wire.wrapped) as Wire;
    const result = complexExtrude(w, [0, 0, 0], [0, 0, 10]);
    expect(isOk(result)).toBe(true);
  });
});

describe('twistExtrude', () => {
  it('extrudes with twist', () => {
    const rect = sketchRectangle(6, 6);
    const w = castShape(rect.wire.wrapped) as Wire;
    const result = twistExtrude(w, 90, [0, 0, 0], [0, 0, 20]);
    expect(isOk(result)).toBe(true);
    expect(isShape3D(unwrap(result))).toBe(true);
  });
});
