import { describe, it, expect, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  wireFinder,
  box,
  cylinder as _cylinder,
  castShape,
  isOk,
  isErr as _isErr,
  isWire,
  getWires as _getWires,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function fnBox(x = 10, y = 10, z = 10) {
  return castShape(box(x, y, z).wrapped);
}

function fnCylinder(r = 5, h = 20) {
  return castShape(cylinder(r, h).wrapped);
}

describe('wireFinder', () => {
  it('finds all wires of a box', () => {
    const wires = wireFinder().findAll(fnBox());
    // A box has 6 faces, each with 1 outer wire = 6 wires
    expect(wires.length).toBe(6);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(isWire(wires[0]!)).toBe(true);
  });

  it('filters closed wires', () => {
    const b = fnBox();
    const closed = wireFinder().isClosed().findAll(b);
    // All box wires are closed
    expect(closed.length).toBe(6);
  });

  it('filters open wires (box has none)', () => {
    const b = fnBox();
    const open = wireFinder().isOpen().findAll(b);
    expect(open.length).toBe(0);
  });

  it('filters by edge count (box wires have 4 edges each)', () => {
    const b = fnBox();
    const fourEdge = wireFinder().ofEdgeCount(4).findAll(b);
    expect(fourEdge.length).toBe(6);
  });

  it('ofEdgeCount returns empty for no match', () => {
    const b = fnBox();
    const threeEdge = wireFinder().ofEdgeCount(3).findAll(b);
    expect(threeEdge.length).toBe(0);
  });

  it('finds wires on a cylinder', () => {
    const cyl = fnCylinder();
    const wires = wireFinder().findAll(cyl);
    // Cylinder: 1 top circle + 1 bottom circle + 1 side seam = 3 wires
    expect(wires.length).toBeGreaterThanOrEqual(2);
  });

  it('supports when() custom predicate', () => {
    const b = fnBox();
    const wires = wireFinder()
      .when(() => true)
      .findAll(b);
    expect(wires.length).toBe(6);
  });

  it('supports not() negation', () => {
    const b = fnBox();
    // not(accept all) = nothing
    const notAll = wireFinder()
      .not((f) => f.when(() => true))
      .findAll(b);
    expect(notAll.length).toBe(0);
  });

  it('supports chaining multiple filters', () => {
    const b = fnBox();
    const result = wireFinder().isClosed().ofEdgeCount(4).findAll(b);
    expect(result.length).toBe(6);
  });

  it('find with unique returns Ok when exactly one match', () => {
    const b = fnBox(10, 20, 30);
    const allWires = getWires(b);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = wireFinder().inList([allWires[0]!]).findUnique(b);
    expect(isOk(result)).toBe(true);
  });

  it('find with unique returns Err when multiple matches', () => {
    const result = wireFinder().findUnique(fnBox());
    expect(isErr(result)).toBe(true);
  });
});
