import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { drawRectangle, drawCircle, Drawing } from '../src/index.js';
import {
  drawingToSketchOnPlane,
  drawingFuse,
  drawingCut,
  drawingIntersect,
  drawingFillet,
  drawingChamfer,
  translateDrawing,
  rotateDrawing,
  scaleDrawing,
  mirrorDrawing,
} from '../src/sketching/drawFns.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function rect(w = 10, h = 20): Drawing {
  return drawRectangle(w, h);
}

function _circ(r = 5): Drawing {
  return drawCircle(r);
}

describe('drawingToSketchOnPlane', () => {
  it('sketches a drawing on the XY plane', () => {
    const d = rect(10, 10);
    const sketch = drawingToSketchOnPlane(d, 'XY');
    expect(sketch).toBeDefined();
  });
});

describe('drawingFuse', () => {
  it('fuses two overlapping drawings', () => {
    const a = rect(10, 10);
    const b = translateDrawing(rect(10, 10), 5, 0);
    const result = drawingFuse(a, b);
    expect(result).toBeInstanceOf(Drawing);
  });
});

describe('drawingCut', () => {
  it('cuts one drawing from another', () => {
    const a = rect(10, 10);
    const b = translateDrawing(rect(10, 10), 5, 0);
    const result = drawingCut(a, b);
    expect(result).toBeInstanceOf(Drawing);
  });
});

describe('drawingIntersect', () => {
  it('intersects two overlapping drawings', () => {
    const a = rect(10, 10);
    const b = translateDrawing(rect(10, 10), 3, 0);
    const result = drawingIntersect(a, b);
    expect(result).toBeInstanceOf(Drawing);
  });
});

describe('drawingFillet', () => {
  it('fillets corners of a rectangle', () => {
    const d = rect(20, 20);
    const filleted = drawingFillet(d, 2);
    expect(filleted).toBeInstanceOf(Drawing);
  });
});

describe('drawingChamfer', () => {
  it('chamfers corners of a rectangle', () => {
    const d = rect(20, 20);
    const chamfered = drawingChamfer(d, 2);
    expect(chamfered).toBeInstanceOf(Drawing);
  });
});

describe('translateDrawing', () => {
  it('translates with dx, dy', () => {
    const d = rect(10, 10);
    const translated = translateDrawing(d, 5, 5);
    expect(translated).toBeInstanceOf(Drawing);
    expect(translated.boundingBox.center[0]).toBeCloseTo(5, 1);
  });

  it('translates with vector', () => {
    const d = rect(10, 10);
    const translated = translateDrawing(d, [5, 5]);
    expect(translated).toBeInstanceOf(Drawing);
    expect(translated.boundingBox.center[0]).toBeCloseTo(5, 1);
  });
});

describe('rotateDrawing', () => {
  it('rotates drawing', () => {
    const d = rect(10, 10);
    const rotated = rotateDrawing(d, 45);
    expect(rotated).toBeInstanceOf(Drawing);
    expect(rotated.boundingBox.width).toBeGreaterThan(10);
  });
});

describe('scaleDrawing', () => {
  it('scales drawing', () => {
    const d = rect(10, 20);
    const scaled = scaleDrawing(d, 2);
    expect(scaled).toBeInstanceOf(Drawing);
    expect(scaled.boundingBox.width).toBeCloseTo(20, 1);
  });
});

describe('mirrorDrawing', () => {
  it('mirrors drawing', () => {
    const d = translateDrawing(rect(10, 10), 5, 0);
    const mirrored = mirrorDrawing(d, [0, 0]);
    expect(mirrored).toBeInstanceOf(Drawing);
    expect(mirrored.boundingBox.center[0]).toBeCloseTo(-5, 1);
  });
});
