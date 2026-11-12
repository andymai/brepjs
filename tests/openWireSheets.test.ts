import { describe, it, beforeAll, expect } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  extrude,
  getFaces,
  isErr,
  isShell,
  line,
  loft,
  measureArea,
  revolve,
  sweep,
  threePointArc,
  unwrap,
  unwrapErr,
  wire,
  type Vec3,
  type Wire,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

const isBrepkit = currentKernel === 'brepkit';
const sheets = isBrepkit || currentKernel === 'occt-wasm' ? describe : describe.skip;

// An open wire makes a sheet: one face for each of its edges, and no caps.
sheets('sheets from open wires', () => {
  // A line of 10 running into a half circle of radius 5: 10 + 5 pi long.
  const profile = (): Wire => {
    using straight = line([0, 0, 0], [10, 0, 0]);
    using round = threePointArc([10, 0, 0], [15, 5, 0], [20, 0, 0]);
    return unwrap(wire([straight, round]));
  };
  const lineWire = (from: Vec3, to: Vec3): Wire => {
    using edge = line(from, to);
    return unwrap(wire([edge]));
  };
  const length = 10 + 5 * Math.PI;

  it('extrudes an open wire into a shell', () => {
    using w = profile();
    using sheet = unwrap(extrude(w, [0, 0, 20]));
    expect(isShell(sheet)).toBe(true);
    expect(getFaces(sheet)).toHaveLength(2);
    expect(unwrap(measureArea(sheet))).toBeCloseTo(20 * length, 6);
  });

  it('revolves an open wire into a shell', () => {
    using w = profile();
    using sheet = unwrap(revolve(w, { at: [0, 0, 0], axis: [1, 0, 0], angle: 2 * Math.PI }));
    expect(isShell(sheet)).toBe(true);
    // The line lies on the axis and sweeps nothing; the half circle sweeps a sphere.
    expect(unwrap(measureArea(sheet))).toBeCloseTo(100 * Math.PI, 6);
  });

  it.runIf(isBrepkit)('lofts two open wires into a shell', () => {
    using a = lineWire([0, 0, 0], [10, 0, 0]);
    using b = lineWire([0, 5, 10], [10, 5, 10]);
    using sheet = unwrap(loft([a, b]));
    expect(isShell(sheet)).toBe(true);
    expect(unwrap(measureArea(sheet))).toBeCloseTo(10 * Math.sqrt(125), 6);
  });

  it.runIf(isBrepkit)('lofts three open wires into straight bands, and only when ruled', () => {
    using a = lineWire([0, 0, 0], [10, 0, 0]);
    using b = lineWire([0, 5, 10], [10, 5, 10]);
    using c = lineWire([0, 0, 20], [10, 0, 20]);
    using sheet = unwrap(loft([a, b, c]));
    expect(unwrap(measureArea(sheet))).toBeCloseTo(20 * Math.sqrt(125), 6);
    expect(isErr(loft([a, b, c], { ruled: false }))).toBe(true);
  });

  it.runIf(isBrepkit)('reports shell mode on an open profile as unsupported', () => {
    using w = profile();
    using spine = lineWire([0, 0, 0], [0, 0, 30]);
    const error = unwrapErr(sweep(w, spine, undefined, true));
    expect(error.code).toBe('UNSUPPORTED_CAPABILITY');
  });

  it('sweeps an open wire along a line into a shell', () => {
    using w = profile();
    using spine = lineWire([0, 0, 0], [0, 0, 30]);
    using sheet = unwrap(sweep(w, spine));
    expect(isShell(sheet)).toBe(true);
    expect(unwrap(measureArea(sheet))).toBeCloseTo(30 * length, 6);
  });

  it.runIf(isBrepkit)('pipes an open wire along a line into a shell', () => {
    using w = profile();
    using spine = lineWire([0, 0, 0], [0, 0, 30]);
    using sheet = unwrap(sweep(w, spine, { mode: 'simple' }));
    expect(isShell(sheet)).toBe(true);
    expect(unwrap(measureArea(sheet))).toBeCloseTo(30 * length, 6);
  });

  it('sweeps an open wire round a quarter circle into a shell', () => {
    using w = lineWire([10, 0, 0], [20, 0, 0]);
    using quarter = threePointArc(
      [0, 0, 0],
      [0, 10 - 10 * Math.SQRT1_2, 10 * Math.SQRT1_2],
      [0, 10, 10]
    );
    using spine = unwrap(wire([quarter]));
    using sheet = unwrap(sweep(w, spine));
    expect(isShell(sheet)).toBe(true);
    // A line of 10 along the arc's axis, a quarter turn at radius 10: a cylinder patch.
    expect(unwrap(measureArea(sheet))).toBeCloseTo(10 * 5 * Math.PI, 6);
  });
});
