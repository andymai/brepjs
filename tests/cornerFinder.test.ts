import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { roundedRectangleBlueprint, polysidesBlueprint } from '../src/index.js';
import { CornerFinder } from '../src/query/cornerFinder.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('CornerFinder', () => {
  it('finds all corners of a rectangle', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const corners = new CornerFinder().find(rect);
    expect(corners.length).toBe(4);
  });

  it('inList filters to specific points', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const allCorners = new CornerFinder().find(rect);
    const subset = [allCorners[0]!.point];
    const found = new CornerFinder().inList(subset).find(rect);
    expect(found.length).toBe(1);
  });

  it('atDistance from origin finds all equidistant corners of a square', () => {
    // polysidesBlueprint(r, 4) makes a square with corners at distance r
    const sq = polysidesBlueprint(10, 4);
    const corners = new CornerFinder().find(sq);
    // all corners at distance 10 from origin
    const found = new CornerFinder().atDistance(10).find(sq);
    expect(found.length).toBe(corners.length);
  });

  it('atDistance with custom point', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const allCorners = new CornerFinder().find(rect);
    const pt = allCorners[0]!.point;
    const found = new CornerFinder().atDistance(0, pt).find(rect);
    expect(found.length).toBe(1);
  });

  it('atPoint finds a specific corner', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const allCorners = new CornerFinder().find(rect);
    const pt = allCorners[0]!.point;
    const found = new CornerFinder().atPoint(pt).find(rect);
    expect(found.length).toBe(1);
  });

  it('atPoint returns empty for non-corner', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const found = new CornerFinder().atPoint([999, 999]).find(rect);
    expect(found.length).toBe(0);
  });

  it('inBox filters corners within a bounding box', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const allCorners = new CornerFinder().find(rect);
    const pt = allCorners[0]!.point;
    const found = new CornerFinder()
      .inBox([pt[0] - 0.1, pt[1] - 0.1], [pt[0] + 0.1, pt[1] + 0.1])
      .find(rect);
    expect(found.length).toBe(1);
  });

  it('inBox finds all corners with large box', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const found = new CornerFinder().inBox([-100, -100], [100, 100]).find(rect);
    expect(found.length).toBe(4);
  });

  it('inBox finds no corners outside', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const found = new CornerFinder().inBox([50, 50], [60, 60]).find(rect);
    expect(found.length).toBe(0);
  });

  it('ofAngle finds 90-degree corners on a rectangle', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const found = new CornerFinder().ofAngle(90).find(rect);
    expect(found.length).toBe(4);
  });

  it('ofAngle finds no 45-degree corners on a rectangle', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const found = new CornerFinder().ofAngle(45).find(rect);
    expect(found.length).toBe(0);
  });

  it('corner has firstCurve and secondCurve', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const corners = new CornerFinder().find(rect);
    for (const corner of corners) {
      expect(corner.firstCurve).toBeDefined();
      expect(corner.secondCurve).toBeDefined();
      expect(corner.point).toBeDefined();
      expect(corner.point.length).toBe(2);
    }
  });

  it('not() negation works', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const allCorners = new CornerFinder().find(rect);
    const pt = allCorners[0]!.point;
    const found = new CornerFinder().not((f) => f.atPoint(pt)).find(rect);
    expect(found.length).toBe(3);
  });

  it('either() or logic works', () => {
    const rect = roundedRectangleBlueprint(10, 20);
    const allCorners = new CornerFinder().find(rect);
    const pt0 = allCorners[0]!.point;
    const pt1 = allCorners[1]!.point;
    const found = new CornerFinder()
      .either([(f) => f.atPoint(pt0), (f) => f.atPoint(pt1)])
      .find(rect);
    expect(found.length).toBe(2);
  });
});
