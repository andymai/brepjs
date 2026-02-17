import { describe, expect, it } from 'vitest';
import { computeStraightSkeleton } from '../src/operations/straightSkeleton.js';

describe('computeStraightSkeleton', () => {
  it('computes skeleton for a square', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.nodes.length).toBeGreaterThanOrEqual(1);
    const center = skeleton.nodes.find((n) => Math.abs(n.x - 5) < 0.1 && Math.abs(n.y - 5) < 0.1);
    expect(center).toBeDefined();
    expect(skeleton.faces.length).toBe(4);
  });

  it('computes skeleton for an L-shape', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(6);
  });

  it('computes skeleton for a triangle', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8.66 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(3);
    expect(skeleton.nodes.length).toBe(1);
  });
});
