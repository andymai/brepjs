import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  drawRectangle,
  drawCircle,
  Blueprint,
  box,
  getFaces,
  createBlueprint,
  blueprintBoundingBox,
  blueprintOrientation,
  translateBlueprint,
  rotateBlueprint,
  scaleBlueprint,
  mirrorBlueprint,
  stretchBlueprint,
  blueprintToSVGPathD,
  blueprintIsInside,
  sketchBlueprintOnPlane,
  sketchBlueprintOnFace,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function rect(w = 10, h = 20): Blueprint {
  return drawRectangle(w, h).blueprint;
}

function circ(r = 5): Blueprint {
  return drawCircle(r).blueprint;
}

describe('blueprintBoundingBox', () => {
  it('returns correct dimensions', () => {
    const bp = rect(10, 20);
    const bb = blueprintBoundingBox(bp);
    expect(bb.width).toBeCloseTo(10, 1);
    expect(bb.height).toBeCloseTo(20, 1);
  });
});

describe('blueprintOrientation', () => {
  it('returns clockwise or counterClockwise', () => {
    const bp = rect();
    const orientation = blueprintOrientation(bp);
    expect(['clockwise', 'counterClockwise']).toContain(orientation);
  });
});

describe('translateBlueprint', () => {
  it('translates blueprint by dx, dy', () => {
    const bp = rect(10, 10);
    const translated = translateBlueprint(bp, 5, 5);
    expect(translated).toBeInstanceOf(Blueprint);
    expect(translated.boundingBox.center[0]).toBeCloseTo(5, 1);
    expect(translated.boundingBox.center[1]).toBeCloseTo(5, 1);
  });
});

describe('rotateBlueprint', () => {
  it('rotates blueprint by angle', () => {
    const bp = rect(10, 10);
    const rotated = rotateBlueprint(bp, 45);
    expect(rotated).toBeInstanceOf(Blueprint);
    // After 45 degree rotation, bounding box should be larger
    expect(rotated.boundingBox.width).toBeGreaterThan(10);
  });

  it('rotates around custom center', () => {
    const bp = rect(10, 10);
    const rotated = rotateBlueprint(bp, 90, [0, 0]);
    expect(rotated).toBeInstanceOf(Blueprint);
  });
});

describe('scaleBlueprint', () => {
  it('scales blueprint by factor', () => {
    const bp = rect(10, 20);
    const scaled = scaleBlueprint(bp, 2);
    expect(scaled.boundingBox.width).toBeCloseTo(20, 1);
    expect(scaled.boundingBox.height).toBeCloseTo(40, 1);
  });

  it('scales around custom center', () => {
    const bp = rect(10, 10);
    const scaled = scaleBlueprint(bp, 0.5, [0, 0]);
    expect(scaled).toBeInstanceOf(Blueprint);
    expect(scaled.boundingBox.width).toBeCloseTo(5, 1);
  });
});

describe('mirrorBlueprint', () => {
  it('mirrors around center point', () => {
    const bp = translateBlueprint(rect(10, 10), 5, 0);
    const mirrored = mirrorBlueprint(bp, [0, 0]);
    expect(mirrored).toBeInstanceOf(Blueprint);
    // Mirrored center should be on opposite side
    expect(mirrored.boundingBox.center[0]).toBeCloseTo(-5, 1);
  });
});

describe('stretchBlueprint', () => {
  it('stretches in a direction', () => {
    const bp = rect(10, 10);
    const stretched = stretchBlueprint(bp, 2, [1, 0]);
    expect(stretched).toBeInstanceOf(Blueprint);
    // Affinity transform along [1,0] scales the Y coordinates by ratio
    expect(stretched.boundingBox.width).toBeCloseTo(10, 1);
    expect(stretched.boundingBox.height).toBeCloseTo(20, 1);
  });
});

describe('blueprintToSVGPathD', () => {
  it('returns valid SVG path data', () => {
    const bp = rect();
    const d = blueprintToSVGPathD(bp);
    expect(d).toMatch(/^M /);
    expect(d).toContain('Z');
  });
});

describe('blueprintIsInside', () => {
  it('center point is inside', () => {
    const bp = rect(10, 10);
    expect(blueprintIsInside(bp, [0, 0])).toBe(true);
  });

  it('distant point is outside', () => {
    const bp = rect(10, 10);
    expect(blueprintIsInside(bp, [100, 100])).toBe(false);
  });
});

describe('sketchBlueprintOnPlane', () => {
  it('sketches on XY plane', () => {
    const bp = rect(10, 10);
    const sketch = sketchBlueprintOnPlane(bp, 'XY');
    expect(sketch).toBeDefined();
    expect(sketch.wire).toBeDefined();
  });
});

describe('createBlueprint', () => {
  it('creates a blueprint from curves', () => {
    const source = rect(10, 10);
    const bp = createBlueprint(source.curves);
    expect(bp).toBeInstanceOf(Blueprint);
    expect(bp.curves.length).toBe(source.curves.length);
  });
});

describe('sketchBlueprintOnFace', () => {
  it('sketches on a box face', () => {
    const bp = rect(5, 5);
    const b = box(20, 20, 20);
    const f = getFaces(b)[0];
    const sketch = sketchBlueprintOnFace(bp, f, 'original');
    expect(sketch).toBeDefined();
    expect(sketch.wire).toBeDefined();
  });
});
