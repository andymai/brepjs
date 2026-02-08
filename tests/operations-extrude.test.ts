import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  Sketcher,
  sketchCircle,
  sketchRectangle,
  genericSweep,
  complexExtrude,
  twistExtrude,
  measureVolume,
  unwrap,
  isOk,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('genericSweep', () => {
  it('sweeps a circle along a straight spine', () => {
    const profile = sketchCircle(2);
    const wire = profile.wire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 20]).done().wire;

    const result = genericSweep(wire, spine, { frenet: true });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    const vol = measureVolume(solid);
    expect(vol).toBeCloseTo(Math.PI * 4 * 20, -1);
  });

  it('sweeps a rectangle along a straight spine with frenet mode', () => {
    const profile = sketchRectangle(4, 4);
    const wire = profile.wire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 10]).done().wire;

    const result = genericSweep(wire, spine, { frenet: true });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    const vol = measureVolume(solid);
    expect(vol).toBeCloseTo(160, -1);
  });

  it('sweeps with transformed transition mode', () => {
    const profile = sketchCircle(2);
    const wire = profile.wire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 15]).done().wire;

    const result = genericSweep(wire, spine, {
      frenet: true,
      transitionMode: 'transformed',
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });

  it('sweeps with round transition mode', () => {
    const profile = sketchCircle(2);
    const wire = profile.wire;
    const spine = new Sketcher('XZ').movePointerTo([0, 0]).lineTo([0, 15]).done().wire;

    const result = genericSweep(wire, spine, {
      frenet: true,
      transitionMode: 'round',
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});

describe('complexExtrude', () => {
  it('extrudes a circle with linear profile', () => {
    const profile = sketchCircle(5);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 10], {
      profile: 'linear',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });

  it('extrudes a circle with s-curve profile', () => {
    const profile = sketchCircle(5);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 10], {
      profile: 's-curve',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });

  it('extrudes a rectangle without profile (no law)', () => {
    const profile = sketchRectangle(6, 8);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 15]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    const vol = measureVolume(solid);
    expect(vol).toBeCloseTo(720, -1);
  });

  it('extrudes in shell mode and returns tuple', () => {
    const profile = sketchCircle(5);
    const wire = profile.wire;

    const result = complexExtrude(wire, [0, 0, 0], [0, 0, 10], undefined, true);
    expect(isOk(result)).toBe(true);
    const [shape, startWire, endWire] = unwrap(result);
    expect(shape).toBeDefined();
    expect(startWire).toBeDefined();
    expect(endWire).toBeDefined();
  });
});

describe('twistExtrude', () => {
  it('twist-extrudes a rectangle 90 degrees', () => {
    const profile = sketchRectangle(6, 6);
    const wire = profile.wire;

    const result = twistExtrude(wire, 90, [0, 0, 0], [0, 0, 20]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(solid).toBeDefined();
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });

  it('twist-extrudes a circle with s-curve profile', () => {
    const profile = sketchCircle(4);
    const wire = profile.wire;

    const result = twistExtrude(wire, 180, [0, 0, 0], [0, 0, 15], {
      profile: 's-curve',
      endFactor: 0.5,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });

  it('twist-extrudes with linear profile', () => {
    const profile = sketchCircle(3);
    const wire = profile.wire;

    const result = twistExtrude(wire, 45, [0, 0, 0], [0, 0, 10], {
      profile: 'linear',
      endFactor: 1,
    });
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });

  it('twist-extrudes without profile (no law)', () => {
    const profile = sketchRectangle(4, 4);
    const wire = profile.wire;

    const result = twistExtrude(wire, 60, [0, 0, 0], [0, 0, 12]);
    expect(isOk(result)).toBe(true);
    const solid = unwrap(result);
    expect(measureVolume(solid)).toBeGreaterThan(0);
  });
});
