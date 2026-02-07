import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  wireFinder,
  makeBox,
  makeCylinder,
  castShape,
  isOk,
  isErr,
  isWire,
  getWires,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function fnBox(x = 10, y = 10, z = 10) {
  return castShape(makeBox([0, 0, 0], [x, y, z]).wrapped);
}

function fnCylinder(r = 5, h = 20) {
  return castShape(makeCylinder(r, h).wrapped);
}

describe('wireFinder', () => {
  it('finds all wires of a box', () => {
    const wires = wireFinder().find(fnBox());
    // A box has 6 faces, each with 1 outer wire = 6 wires
    expect(wires.length).toBe(6);
    expect(isWire(wires[0]!)).toBe(true);
  });

  it('filters closed wires', () => {
    const box = fnBox();
    const closed = wireFinder().isClosed().find(box);
    // All box wires are closed
    expect(closed.length).toBe(6);
  });

  it('filters open wires (box has none)', () => {
    const box = fnBox();
    const open = wireFinder().isOpen().find(box);
    expect(open.length).toBe(0);
  });

  it('filters by edge count (box wires have 4 edges each)', () => {
    const box = fnBox();
    const fourEdge = wireFinder().ofEdgeCount(4).find(box);
    expect(fourEdge.length).toBe(6);
  });

  it('ofEdgeCount returns empty for no match', () => {
    const box = fnBox();
    const threeEdge = wireFinder().ofEdgeCount(3).find(box);
    expect(threeEdge.length).toBe(0);
  });

  it('finds wires on a cylinder', () => {
    const cyl = fnCylinder();
    const wires = wireFinder().find(cyl);
    // Cylinder: 1 top circle + 1 bottom circle + 1 side seam = 3 wires
    expect(wires.length).toBeGreaterThanOrEqual(2);
  });

  it('supports when() custom predicate', () => {
    const box = fnBox();
    const wires = wireFinder()
      .when(() => true)
      .find(box);
    expect(wires.length).toBe(6);
  });

  it('supports not() negation', () => {
    const box = fnBox();
    // not(accept all) = nothing
    const notAll = wireFinder()
      .not((f) => f.when(() => true))
      .find(box);
    expect(notAll.length).toBe(0);
  });

  it('supports chaining multiple filters', () => {
    const box = fnBox();
    const result = wireFinder().isClosed().ofEdgeCount(4).find(box);
    expect(result.length).toBe(6);
  });

  it('find with unique returns Ok when exactly one match', () => {
    const box = fnBox(10, 20, 30);
    const allWires = getWires(box);
    const result = wireFinder().inList([allWires[0]!]).find(box, { unique: true });
    expect(isOk(result)).toBe(true);
  });

  it('find with unique returns Err when multiple matches', () => {
    const result = wireFinder().find(fnBox(), { unique: true });
    expect(isErr(result)).toBe(true);
  });
});
