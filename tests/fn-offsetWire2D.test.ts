import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, getFaces, getWires, offsetWire2D, isOk, unwrap, curveLength } from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('offsetWire2D chamfer join', () => {
  // Get a rectangular wire from a box face
  function getRectWire() {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const wires = getWires(faces[0]);
    return wires[0];
  }

  it('offsets with chamfer join type', () => {
    const wire = getRectWire();
    const result = offsetWire2D(wire, 2, 'chamfer');
    expect(isOk(result)).toBe(true);
    const offset = unwrap(result);
    const len = curveLength(offset);
    expect(len).toBeGreaterThan(0);
  });

  it('chamfer produces same result as intersection (alias)', () => {
    const wire = getRectWire();
    const intResult = unwrap(offsetWire2D(wire, 2, 'intersection'));
    const chamferResult = unwrap(offsetWire2D(wire, 2, 'chamfer'));
    expect(curveLength(chamferResult)).toBeCloseTo(curveLength(intResult), 4);
  });

  it('chamfer differs from arc', () => {
    const wire = getRectWire();
    const arcResult = unwrap(offsetWire2D(wire, 2, 'arc'));
    const chamferResult = unwrap(offsetWire2D(wire, 2, 'chamfer'));
    // Arc rounds corners (longer), chamfer/intersection produces sharp corners
    expect(curveLength(arcResult)).not.toBeCloseTo(curveLength(chamferResult), 1);
  });
});
