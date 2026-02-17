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

  it('computes skeleton for a rectangle (non-square)', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(4);
    // Rectangle produces 2 ridge nodes (not 1 center like a square)
    expect(skeleton.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('handles degenerate input (fewer than 3 vertices)', () => {
    expect(computeStraightSkeleton([]).faces.length).toBe(0);
    expect(computeStraightSkeleton([{ x: 0, y: 0 }]).faces.length).toBe(0);
    expect(
      computeStraightSkeleton([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]).faces.length
    ).toBe(0);
  });

  it('handles CW polygon (auto-reverses to CCW)', () => {
    // CW square (reversed winding)
    const polygon = [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(4);
    expect(skeleton.nodes.length).toBeGreaterThanOrEqual(1);
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

  it('computes skeleton for a cross/plus shape (triggers split events)', () => {
    // Plus sign shape — concave vertices create reflex angles that trigger split events
    const polygon = [
      { x: 3, y: 0 },
      { x: 7, y: 0 },
      { x: 7, y: 3 },
      { x: 10, y: 3 },
      { x: 10, y: 7 },
      { x: 7, y: 7 },
      { x: 7, y: 10 },
      { x: 3, y: 10 },
      { x: 3, y: 7 },
      { x: 0, y: 7 },
      { x: 0, y: 3 },
      { x: 3, y: 3 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(12);
    expect(skeleton.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('computes skeleton for a pentagon', () => {
    const polygon = [
      { x: 5, y: 0 },
      { x: 10, y: 3.5 },
      { x: 8, y: 9 },
      { x: 2, y: 9 },
      { x: 0, y: 3.5 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(5);
    expect(skeleton.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('computes skeleton for arrow shape (reflex vertex)', () => {
    // Arrow pointing right — has one reflex vertex
    const polygon = [
      { x: 0, y: 2 },
      { x: 6, y: 2 },
      { x: 6, y: 0 },
      { x: 10, y: 4 },
      { x: 6, y: 8 },
      { x: 6, y: 6 },
      { x: 0, y: 6 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(7);
    expect(skeleton.nodes.length).toBeGreaterThanOrEqual(1);
  });
});
