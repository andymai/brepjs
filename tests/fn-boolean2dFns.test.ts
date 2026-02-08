import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import type { Blueprint } from '../src/index.js';
import { drawRectangle, drawCircle } from '../src/index.js';
import {
  fuseBlueprint2D,
  cutBlueprint2D,
  intersectBlueprint2D,
} from '../src/2d/blueprints/boolean2dFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function rect(w = 10, h = 10, cx = 0, cy = 0): Blueprint {
  return drawRectangle(w, h).translate(cx, cy).blueprint;
}

function circ(r = 5, cx = 0, cy = 0): Blueprint {
  return drawCircle(r).translate(cx, cy).blueprint;
}

describe('fuseBlueprint2D', () => {
  it('fuses overlapping blueprints', () => {
    const a = rect(10, 10, 0, 0);
    const b = rect(10, 10, 5, 0);
    const result = fuseBlueprint2D(a, b);
    expect(result).not.toBeNull();
  });

  it('fuses non-overlapping blueprints', () => {
    const a = rect(10, 10, 0, 0);
    const b = rect(10, 10, 50, 0);
    const result = fuseBlueprint2D(a, b);
    expect(result).not.toBeNull();
  });
});

describe('cutBlueprint2D', () => {
  it('cuts overlapping blueprints', () => {
    const base = rect(10, 10, 0, 0);
    const tool = rect(10, 10, 5, 0);
    const result = cutBlueprint2D(base, tool);
    expect(result).not.toBeNull();
  });

  it('returns base when tool does not overlap', () => {
    const base = rect(10, 10, 0, 0);
    const tool = rect(10, 10, 50, 0);
    const result = cutBlueprint2D(base, tool);
    expect(result).not.toBeNull();
  });
});

describe('intersectBlueprint2D', () => {
  it('intersects overlapping blueprints', () => {
    const a = rect(10, 10, 0, 0);
    const b = rect(10, 10, 3, 0);
    const result = intersectBlueprint2D(a, b);
    expect(result).not.toBeNull();
  });

  it('returns null for non-overlapping', () => {
    const a = rect(10, 10, 0, 0);
    const b = rect(10, 10, 50, 0);
    const result = intersectBlueprint2D(a, b);
    expect(result).toBeNull();
  });
});
