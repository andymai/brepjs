import { describe, expect, it, beforeAll, vi, afterEach } from 'vitest';
import { initKernel } from './setup.js';
import {
  surfaceFromGrid,
  surfaceFromImage,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  measureArea,
  isFace,
  isShell,
  BrepErrorCode,
  type Face,
  type Shape3D,
} from '../src/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('surfaceFromGrid', () => {
  it('creates a flat surface from uniform heights', () => {
    const heights = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const result = surfaceFromGrid(heights, { width: 10, depth: 10 });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result) as Face | Shape3D;
    const area = measureArea(shape);
    expect(area).toBeCloseTo(100, -1);
  });

  it('creates a surface with varying heights', () => {
    const heights = [
      [0, 0, 0],
      [0, 5, 0],
      [0, 0, 0],
    ];
    const result = surfaceFromGrid(heights, { width: 10, depth: 10 });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result) as Face | Shape3D;
    const area = measureArea(shape);
    expect(area).toBeGreaterThan(100);
  });

  it('rejects grids smaller than 2x2', () => {
    expect(isErr(surfaceFromGrid([[1]]))).toBe(true);
    expect(isErr(surfaceFromGrid([]))).toBe(true);
  });

  it('rejects jagged grids', () => {
    const jagged = [
      [0, 0, 0],
      [0, 0],
    ];
    expect(isErr(surfaceFromGrid(jagged))).toBe(true);
  });

  it('applies scaleZ option', () => {
    const heights = [
      [0, 0],
      [0, 1],
    ];
    const r1 = surfaceFromGrid(heights, { width: 10, depth: 10, scaleZ: 1 });
    const r2 = surfaceFromGrid(heights, { width: 10, depth: 10, scaleZ: 10 });
    expect(isOk(r1)).toBe(true);
    expect(isOk(r2)).toBe(true);
    const a1 = measureArea(unwrap(r1) as Face | Shape3D);
    const a2 = measureArea(unwrap(r2) as Face | Shape3D);
    expect(a2).toBeGreaterThan(a1);
  });

  it('uses default width and depth (cols-1 x rows-1)', () => {
    // 4 cols → width=3, 3 rows → depth=2 by default
    const heights = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const result = surfaceFromGrid(heights);
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result) as Face | Shape3D);
    // Default area should be 3*2 = 6
    expect(area).toBeCloseTo(6, 0);
  });

  it('creates a 5x5 flat grid surface', () => {
    const heights = [
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ];
    const result = surfaceFromGrid(heights, { width: 20, depth: 20 });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result) as Face | Shape3D;
    expect(isFace(shape) || isShell(shape)).toBe(true);
    const area = measureArea(shape);
    expect(area).toBeCloseTo(400, -1);
  });

  it('creates a surface from a 5x5 curved (non-planar) grid', () => {
    // Gaussian bump in the middle
    const heights = [
      [0, 0, 0, 0, 0],
      [0, 1, 2, 1, 0],
      [0, 2, 5, 2, 0],
      [0, 1, 2, 1, 0],
      [0, 0, 0, 0, 0],
    ];
    const result = surfaceFromGrid(heights, { width: 10, depth: 10 });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result) as Face | Shape3D;
    const area = measureArea(shape);
    // Curved surface must be larger than the 10x10=100 flat projection
    expect(area).toBeGreaterThan(100);
  });

  it('creates a surface from a minimum 2x2 grid', () => {
    const heights = [
      [0, 1],
      [1, 0],
    ];
    const result = surfaceFromGrid(heights, { width: 5, depth: 5 });
    expect(isOk(result)).toBe(true);
  });

  it('creates a surface from a 2x3 asymmetric grid', () => {
    const heights = [
      [0, 0, 0],
      [0, 2, 0],
    ];
    const result = surfaceFromGrid(heights, { width: 10, depth: 5 });
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result) as Face | Shape3D);
    expect(area).toBeGreaterThan(0);
  });

  it('creates a surface from a 3x2 asymmetric grid', () => {
    const heights = [
      [0, 0],
      [0, 3],
      [0, 0],
    ];
    const result = surfaceFromGrid(heights, { width: 5, depth: 10 });
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result) as Face | Shape3D);
    expect(area).toBeGreaterThan(0);
  });

  it('handles negative height values', () => {
    const heights = [
      [-1, -1, -1],
      [-1, -5, -1],
      [-1, -1, -1],
    ];
    const result = surfaceFromGrid(heights, { width: 10, depth: 10 });
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result) as Face | Shape3D);
    expect(area).toBeGreaterThan(100);
  });

  it('handles all-zero scaleZ (flat surface)', () => {
    const heights = [
      [5, 10, 15],
      [20, 25, 30],
      [35, 40, 45],
    ];
    const result = surfaceFromGrid(heights, { width: 10, depth: 10, scaleZ: 0 });
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result) as Face | Shape3D);
    // With scaleZ=0 all z values are 0, area should be ~100
    expect(area).toBeCloseTo(100, -1);
  });

  it('rejects single-row grids (less than 2 rows)', () => {
    const result = surfaceFromGrid([[0, 1, 2]]);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_GRID_TOO_SMALL);
  });

  it('rejects single-column grids (less than 2 columns)', () => {
    const result = surfaceFromGrid([[0], [1]]);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_GRID_TOO_SMALL);
  });

  it('rejects jagged grid with correct error code', () => {
    const result = surfaceFromGrid([
      [0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_GRID_JAGGED);
  });

  it('creates a larger 8x8 grid surface', () => {
    const size = 8;
    const heights: number[][] = [];
    for (let r = 0; r < size; r++) {
      const row: number[] = [];
      for (let c = 0; c < size; c++) {
        // Sinusoidal surface
        row.push(Math.sin((r / size) * Math.PI) * Math.cos((c / size) * Math.PI));
      }
      heights.push(row);
    }
    const result = surfaceFromGrid(heights, { width: 10, depth: 10 });
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result) as Face | Shape3D;
    expect(isFace(shape) || isShell(shape)).toBe(true);
  });
});

describe('surfaceFromImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an error when createImageBitmap is not available (Node.js environment)', async () => {
    const blob = new Blob(['not an image']);
    const result = await surfaceFromImage(blob);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_FAILED);
    expect(e.message).toContain('createImageBitmap');
  });

  it('returns an error when createImageBitmap throws on decode failure', async () => {
    // Stub createImageBitmap to simulate a bad/corrupt image
    vi.stubGlobal('createImageBitmap', () => Promise.reject(new Error('decode failed')));

    const blob = new Blob(['corrupt image data']);
    const result = await surfaceFromImage(blob);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_FAILED);
    expect(e.message).toContain('decode failed');
  });

  it('returns an error when the image is too small (1x1)', async () => {
    // Stub createImageBitmap to return a mock 1x1 bitmap
    const mockBitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));

    const blob = new Blob(['tiny']);
    const result = await surfaceFromImage(blob);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_GRID_TOO_SMALL);
    expect(mockBitmap.close).toHaveBeenCalled();
  });

  it('returns an error when the image is too small (single row)', async () => {
    const mockBitmap = { width: 10, height: 1, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));

    const blob = new Blob(['narrow']);
    const result = await surfaceFromImage(blob);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_GRID_TOO_SMALL);
    expect(mockBitmap.close).toHaveBeenCalled();
  });

  it('returns an error when OffscreenCanvas is not available', async () => {
    const mockBitmap = { width: 4, height: 4, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    // OffscreenCanvas is not available in Node — verify it returns the right error
    // (OffscreenCanvas is undefined in Node so this tests the natural state after
    // the createImageBitmap stub is set)
    const blob = new Blob(['data']);
    const result = await surfaceFromImage(blob);
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_FAILED);
    expect(e.message).toContain('OffscreenCanvas');
    expect(mockBitmap.close).toHaveBeenCalled();
  });

  it('succeeds with a mocked OffscreenCanvas and 4x4 image pixel data (luminance channel)', async () => {
    // Build a 4x4 RGBA pixel buffer (all mid-gray)
    const w = 4;
    const h = 4;
    const pixelData = new Uint8ClampedArray(w * h * 4).fill(128);
    const mockImageData = { data: pixelData };
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(mockImageData),
    };
    const mockCanvas = {};
    const mockBitmap = { width: w, height: h, close: vi.fn() };

    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    vi.stubGlobal('OffscreenCanvas', function () {
      return mockCanvas;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock canvas getContext
    (mockCanvas as any).getContext = vi.fn().mockReturnValue(mockCtx);

    const blob = new Blob(['data']);
    const result = await surfaceFromImage(blob, { width: 10, depth: 10 });
    expect(isOk(result)).toBe(true);
    expect(mockBitmap.close).toHaveBeenCalled();
    const area = measureArea(unwrap(result) as Face | Shape3D);
    expect(area).toBeCloseTo(100, -1);
  });

  it('succeeds with red channel selected', async () => {
    const w = 3;
    const h = 3;
    const pixelData = new Uint8ClampedArray(w * h * 4);
    // Set varying red values, green/blue = 0
    for (let i = 0; i < w * h; i++) {
      pixelData[i * 4] = i * 28; // r
      pixelData[i * 4 + 1] = 0; // g
      pixelData[i * 4 + 2] = 0; // b
      pixelData[i * 4 + 3] = 255; // a
    }
    const mockImageData = { data: pixelData };
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(mockImageData),
    };
    const mockCanvas = { getContext: vi.fn().mockReturnValue(mockCtx) };
    const mockBitmap = { width: w, height: h, close: vi.fn() };

    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    vi.stubGlobal('OffscreenCanvas', function () {
      return mockCanvas;
    });

    const result = await surfaceFromImage(new Blob(['data']), {
      channel: 'r',
      width: 10,
      depth: 10,
    });
    expect(isOk(result)).toBe(true);
  });

  it('succeeds with green channel selected', async () => {
    const w = 3;
    const h = 3;
    const pixelData = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixelData[i * 4] = 0;
      pixelData[i * 4 + 1] = i * 28; // g
      pixelData[i * 4 + 2] = 0;
      pixelData[i * 4 + 3] = 255;
    }
    const mockImageData = { data: pixelData };
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(mockImageData),
    };
    const mockCanvas = { getContext: vi.fn().mockReturnValue(mockCtx) };
    const mockBitmap = { width: w, height: h, close: vi.fn() };

    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    vi.stubGlobal('OffscreenCanvas', function () {
      return mockCanvas;
    });

    const result = await surfaceFromImage(new Blob(['data']), {
      channel: 'g',
      width: 10,
      depth: 10,
    });
    expect(isOk(result)).toBe(true);
  });

  it('succeeds with blue channel selected', async () => {
    const w = 3;
    const h = 3;
    const pixelData = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixelData[i * 4] = 0;
      pixelData[i * 4 + 1] = 0;
      pixelData[i * 4 + 2] = i * 28; // b
      pixelData[i * 4 + 3] = 255;
    }
    const mockImageData = { data: pixelData };
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(mockImageData),
    };
    const mockCanvas = { getContext: vi.fn().mockReturnValue(mockCtx) };
    const mockBitmap = { width: w, height: h, close: vi.fn() };

    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    vi.stubGlobal('OffscreenCanvas', function () {
      return mockCanvas;
    });

    const result = await surfaceFromImage(new Blob(['data']), {
      channel: 'b',
      width: 10,
      depth: 10,
    });
    expect(isOk(result)).toBe(true);
  });

  it('succeeds with downsample option to reduce grid resolution', async () => {
    // 6x6 image, downsample by 2 → 3x3 grid
    const w = 6;
    const h = 6;
    const pixelData = new Uint8ClampedArray(w * h * 4).fill(64);
    const mockImageData = { data: pixelData };
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(mockImageData),
    };
    const mockCanvas = { getContext: vi.fn().mockReturnValue(mockCtx) };
    const mockBitmap = { width: w, height: h, close: vi.fn() };

    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    vi.stubGlobal('OffscreenCanvas', function () {
      return mockCanvas;
    });

    const result = await surfaceFromImage(new Blob(['data']), {
      downsample: 2,
      width: 10,
      depth: 10,
    });
    expect(isOk(result)).toBe(true);
  });

  it('passes width, depth, scaleZ through to surfaceFromGrid', async () => {
    const w = 3;
    const h = 3;
    const pixelData = new Uint8ClampedArray(w * h * 4).fill(255);
    const mockImageData = { data: pixelData };
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn().mockReturnValue(mockImageData),
    };
    const mockCanvas = { getContext: vi.fn().mockReturnValue(mockCtx) };
    const mockBitmap = { width: w, height: h, close: vi.fn() };

    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    vi.stubGlobal('OffscreenCanvas', function () {
      return mockCanvas;
    });

    const result = await surfaceFromImage(new Blob(['data']), {
      width: 20,
      depth: 15,
      scaleZ: 2,
    });
    expect(isOk(result)).toBe(true);
    const area = measureArea(unwrap(result) as Face | Shape3D);
    // All pixels 255 → height = 1.0, with scaleZ=2 → z=2 (uniform surface)
    // With uniform z the surface is flat at z=2, so area should be close to 20*15=300
    expect(area).toBeCloseTo(300, 0);
  });

  it('returns an error when canvas getContext returns null', async () => {
    const mockBitmap = { width: 4, height: 4, close: vi.fn() };
    const mockCtxNull = null;
    const mockCanvas = { getContext: vi.fn().mockReturnValue(mockCtxNull) };

    vi.stubGlobal('createImageBitmap', () => Promise.resolve(mockBitmap));
    vi.stubGlobal('OffscreenCanvas', function () {
      return mockCanvas;
    });

    const result = await surfaceFromImage(new Blob(['data']));
    expect(isErr(result)).toBe(true);
    const e = unwrapErr(result);
    expect(e.code).toBe(BrepErrorCode.SURFACE_FAILED);
    expect(e.message).toContain('canvas context');
    expect(mockBitmap.close).toHaveBeenCalled();
  });
});
