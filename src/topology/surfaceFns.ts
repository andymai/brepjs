/**
 * Surface creation functions — generate faces from height-map grids.
 */

import { getKernel } from '@/kernel/index.js';
import type { AnyShape } from '@/core/shapeTypes.js';
import { castShape, isFace, isShell } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError, kernelError, ioError, BrepErrorCode } from '@/core/errors.js';

/** Rec. 601 luma coefficients for luminance calculation. */
const REC601_R = 0.299;
const REC601_G = 0.587;
const REC601_B = 0.114;

export interface SurfaceFromGridOptions {
  /** Physical width in X direction. Default: number of columns - 1. */
  width?: number;
  /** Physical depth in Y direction. Default: number of rows - 1. */
  depth?: number;
  /** Scale factor for Z values. Default: 1. */
  scaleZ?: number;
}

/**
 * Create a B-spline surface (or triangulated shell) from a 2D grid of height values.
 *
 * The grid is interpreted as Z heights at evenly spaced (X, Y) positions.
 * Row index maps to Y, column index maps to X.
 *
 * @param heights - 2D array of Z values, at least 2x2
 * @param options - Physical dimensions and Z scaling
 * @returns Result containing the surface shape (may be a Face or Shell depending on grid complexity)
 */
export function surfaceFromGrid(
  heights: ReadonlyArray<ReadonlyArray<number>>,
  options: SurfaceFromGridOptions = {}
): Result<AnyShape> {
  // ── Validation ──
  if (heights.length < 2) {
    return err(
      validationError(
        BrepErrorCode.SURFACE_GRID_TOO_SMALL,
        `surfaceFromGrid: need at least 2 rows, got ${heights.length}`
      )
    );
  }

  const rows = heights.length;
  const cols = heights[0]?.length ?? 0;

  if (cols < 2) {
    return err(
      validationError(
        BrepErrorCode.SURFACE_GRID_TOO_SMALL,
        `surfaceFromGrid: need at least 2 columns, got ${cols}`
      )
    );
  }

  // Check all rows have same length
  for (let r = 0; r < rows; r++) {
    const row = heights[r];
    if (!row || row.length !== cols) {
      return err(
        validationError(
          BrepErrorCode.SURFACE_GRID_JAGGED,
          `surfaceFromGrid: row ${r} has ${row?.length ?? 0} columns, expected ${cols}`
        )
      );
    }
  }

  const { width = cols - 1, depth = rows - 1, scaleZ = 1 } = options;
  const dx = width / (cols - 1);
  const dy = depth / (rows - 1);

  // ── Try B-spline approach first ──
  try {
    return buildBSplineSurface(heights, rows, cols, dx, dy, scaleZ);
  } catch {
    // B-spline types not bound in WASM — fall through to triangulated mesh
  }

  // ── Fallback: triangulated mesh ──
  try {
    return buildTriangulatedSurface(heights, rows, cols, dx, dy, scaleZ);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError(BrepErrorCode.SURFACE_FAILED, `surfaceFromGrid failed: ${raw}`, e));
  }
}

/** Build a B-spline surface using GeomAPI_PointsToBSplineSurface. */
function buildBSplineSurface(
  heights: ReadonlyArray<ReadonlyArray<number>>,
  rows: number,
  cols: number,
  dx: number,
  dy: number,
  scaleZ: number
): Result<AnyShape> {
  const points: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const row = heights[r];
      const z = (row ? (row[c] ?? 0) : 0) * scaleZ;
      points.push([c * dx, r * dy, z]);
    }
  }

  const faceShape = getKernel().bsplineSurface(points, rows, cols);
  const shape = castShape(faceShape);
  if (isFace(shape)) {
    return ok(shape);
  }
  shape[Symbol.dispose]();
  return err(kernelError(BrepErrorCode.SURFACE_FAILED, 'B-spline surface did not produce a face'));
}

/** Build a triangulated surface by sewing triangular faces. */
function buildTriangulatedSurface(
  heights: ReadonlyArray<ReadonlyArray<number>>,
  rows: number,
  cols: number,
  dx: number,
  dy: number,
  scaleZ: number
): Result<AnyShape> {
  const points: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const row = heights[r];
      const z = (row ? (row[c] ?? 0) : 0) * scaleZ;
      points.push([c * dx, r * dy, z]);
    }
  }

  const resultShape = getKernel().triangulatedSurface(points, rows, cols);
  const shape = castShape(resultShape);

  if (isFace(shape)) {
    return ok(shape);
  }

  if (isShell(shape)) {
    return ok(shape);
  }

  shape[Symbol.dispose]();
  return err(
    kernelError(BrepErrorCode.SURFACE_FAILED, 'surfaceFromGrid: unexpected shape type from sewing')
  );
}

// ---------------------------------------------------------------------------
// surfaceFromImage
// ---------------------------------------------------------------------------

export interface SurfaceFromImageOptions extends SurfaceFromGridOptions {
  /** Which channel to use for height. Default: 'luminance'. */
  channel?: 'r' | 'g' | 'b' | 'luminance';
  /** Downsample factor — use every Nth pixel. Default: 1 (no downsampling). */
  downsample?: number;
}

/**
 * Create a surface from an image blob by interpreting pixel brightness as height.
 * Requires `createImageBitmap` and `OffscreenCanvas` (available in browsers and
 * some worker environments; not available in Node.js).
 *
 * @param blob - Image data as a Blob
 * @param options - Channel selection, downsampling, and grid options
 * @returns A Result containing the surface shape
 */
export async function surfaceFromImage(
  blob: Blob,
  options: SurfaceFromImageOptions = {}
): Promise<Result<AnyShape>> {
  const channel = options.channel ?? 'luminance';
  const downsample = Math.max(1, Math.round(options.downsample ?? 1));

  // Check for browser APIs
  if (typeof createImageBitmap !== 'function') {
    return err(
      ioError(
        BrepErrorCode.SURFACE_FAILED,
        'surfaceFromImage requires createImageBitmap (not available in this environment)'
      )
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (e) {
    return err(
      ioError(
        BrepErrorCode.SURFACE_FAILED,
        `surfaceFromImage: failed to decode image — ${e instanceof Error ? e.message : String(e)}`
      )
    );
  }

  const w = bitmap.width;
  const h = bitmap.height;

  if (w < 2 || h < 2) {
    bitmap.close();
    return err(
      validationError(
        BrepErrorCode.SURFACE_GRID_TOO_SMALL,
        `surfaceFromImage: image too small (${w}x${h}), need at least 2x2`
      )
    );
  }

  // Use OffscreenCanvas to read pixel data
  if (typeof OffscreenCanvas !== 'function') {
    bitmap.close();
    return err(
      ioError(
        BrepErrorCode.SURFACE_FAILED,
        'surfaceFromImage requires OffscreenCanvas (not available in this environment)'
      )
    );
  }

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return err(
      ioError(BrepErrorCode.SURFACE_FAILED, 'surfaceFromImage: could not get 2D canvas context')
    );
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Build height grid
  const rows: number[][] = [];
  for (let y = 0; y < h; y += downsample) {
    const row: number[] = [];
    for (let x = 0; x < w; x += downsample) {
      const idx = (y * w + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;

      let value: number;
      switch (channel) {
        case 'r':
          value = r / 255;
          break;
        case 'g':
          value = g / 255;
          break;
        case 'b':
          value = b / 255;
          break;
        default:
          value = (REC601_R * r + REC601_G * g + REC601_B * b) / 255;
          break;
      }
      row.push(value);
    }
    rows.push(row);
  }

  const gridOpts: SurfaceFromGridOptions = {};
  if (options.width !== undefined) gridOpts.width = options.width;
  if (options.depth !== undefined) gridOpts.depth = options.depth;
  if (options.scaleZ !== undefined) gridOpts.scaleZ = options.scaleZ;

  return surfaceFromGrid(rows, gridOpts);
}
