/**
 * Kernel-agnostic coverage for multiSectionSweep and guidedSweep.
 *
 * The legacy multiSweepFns/guidedSweepFns suites build their section and spine
 * geometry with raw `oc` (gp_Circ_2, BRepBuilderAPI_MakeEdge), so they are
 * skipped under occt-wasm — leaving the functions and their validation helpers
 * (validateSectionLocations / computeSectionParams) uncovered on the default
 * kernel. These tests build the same fixtures through the public brepjs API so
 * they run everywhere.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { initKernel } from './setup.js';
import {
  sketchCircle,
  line,
  wire,
  castShape,
  multiSectionSweep,
  guidedSweep,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isShape3D,
} from '@/index.js';
import type { Wire } from '@/core/shapeTypes.js';

function circleWire(radius: number): Wire {
  return castShape(sketchCircle(radius).wire.wrapped) as Wire;
}

function lineSpine(from: [number, number, number], to: [number, number, number]): Wire {
  return castShape(unwrap(wire([line(from, to)])).wrapped) as Wire;
}

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('multiSectionSweep (public-API fixtures)', () => {
  it('lofts two sections along a spine into a 3D shape', () => {
    using spine = lineSpine([0, 0, 0], [0, 0, 50]);
    using c1 = circleWire(10);
    using c2 = circleWire(5);
    const result = multiSectionSweep([{ wire: c1 }, { wire: c2 }], spine, { solid: true });
    expect(isOk(result)).toBe(true);
    using shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
  });

  it('honours explicit, strictly-increasing section locations', () => {
    using spine = lineSpine([0, 0, 0], [0, 0, 50]);
    using c1 = circleWire(8);
    using c2 = circleWire(6);
    const result = multiSectionSweep(
      [
        { wire: c1, location: 0.1 },
        { wire: c2, location: 0.9 },
      ],
      spine
    );
    expect(isOk(result)).toBe(true);
    unwrap(result)[Symbol.dispose]();
  });

  it('errors with fewer than 2 sections', () => {
    using spine = lineSpine([0, 0, 0], [0, 0, 50]);
    using c1 = circleWire(10);
    const result = multiSectionSweep([{ wire: c1 }], spine);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('MULTI_SWEEP_INSUFFICIENT_SECTIONS');
  });

  it('errors when a section location is out of [0, 1]', () => {
    using spine = lineSpine([0, 0, 0], [0, 0, 50]);
    using c1 = circleWire(8);
    using c2 = circleWire(6);
    const result = multiSectionSweep(
      [
        { wire: c1, location: 0.2 },
        { wire: c2, location: 1.5 },
      ],
      spine
    );
    expect(isErr(result)).toBe(true);
  });

  it('errors when section locations are not strictly increasing', () => {
    using spine = lineSpine([0, 0, 0], [0, 0, 50]);
    using c1 = circleWire(8);
    using c2 = circleWire(6);
    const result = multiSectionSweep(
      [
        { wire: c1, location: 0.7 },
        { wire: c2, location: 0.3 },
      ],
      spine
    );
    expect(isErr(result)).toBe(true);
  });
});

describe('guidedSweep (public-API fixtures)', () => {
  it('sweeps a profile along a spine with a guide wire', () => {
    using profile = circleWire(3);
    using spine = lineSpine([0, 0, 0], [0, 0, 30]);
    using guide = lineSpine([5, 0, 0], [5, 0, 30]);
    const result = guidedSweep(profile, spine, [guide]);
    expect(isOk(result)).toBe(true);
    using shape = unwrap(result);
    expect(isShape3D(shape)).toBe(true);
  });

  it('sweeps without guides (no auxiliary spine) in shell mode', () => {
    using profile = circleWire(3);
    using spine = lineSpine([0, 0, 0], [0, 0, 30]);
    const result = guidedSweep(profile, spine, [], { solid: false });
    expect(isOk(result)).toBe(true);
    unwrap(result)[Symbol.dispose]();
  });
});
