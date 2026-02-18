/**
 * Surface creation functions — generate faces from height-map grids.
 */

import { getKernel } from '../kernel/index.js';
import { makeTriFace } from '../kernel/constructorOps.js';
import type { AnyShape, Face } from '../core/shapeTypes.js';
import { castShape, isFace, isShell } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError, ioError, BrepErrorCode } from '../core/errors.js';

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
 * @returns A Face representing the surface
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
    return err(occtError(BrepErrorCode.SURFACE_FAILED, `surfaceFromGrid failed: ${raw}`, e));
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
  const oc = getKernel().oc;

  const OC = oc;

  // This will throw if the types are not bound
  const pntArray = new OC.TColgp_Array2OfPnt_2(1, rows, 1, cols);

  try {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const row = heights[r];
        const z = (row ? (row[c] ?? 0) : 0) * scaleZ;
        const pnt = new oc.gp_Pnt_3(c * dx, r * dy, z);
        pntArray.SetValue(r + 1, c + 1, pnt);
        pnt.delete();
      }
    }

    const fitter = new OC.GeomAPI_PointsToBSplineSurface_2(pntArray, 3, 8, 0, 1e-3);
    const surface = fitter.Surface();
    const faceMaker = new OC.BRepBuilderAPI_MakeFace_8(surface, 1e-6);

    let result: Result<Face>;
    if (faceMaker.IsDone()) {
      const shape = castShape(faceMaker.Face());
      if (isFace(shape)) {
        result = ok(shape);
      } else {
        shape[Symbol.dispose]();
        result = err(
          occtError(BrepErrorCode.SURFACE_FAILED, 'B-spline surface did not produce a face')
        );
      }
    } else {
      result = err(
        occtError(
          BrepErrorCode.SURFACE_FAILED,
          'BRepBuilderAPI_MakeFace failed for B-spline surface'
        )
      );
    }

    faceMaker.delete();
    fitter.delete();
    return result;
  } finally {
    pntArray.delete();
  }
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
  const oc = getKernel().oc;

  function pt(r: number, c: number): [number, number, number] {
    const row = heights[r];
    const z = (row ? (row[c] ?? 0) : 0) * scaleZ;
    return [c * dx, r * dy, z];
  }

  const sewing = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
  let faceCount = 0;

  try {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const p00 = pt(r, c);
        const p10 = pt(r + 1, c);
        const p11 = pt(r + 1, c + 1);
        const p01 = pt(r, c + 1);

        // Triangle 1: (r,c), (r+1,c), (r+1,c+1)
        const f1 = makeTriFace(oc, p00, p10, p11);
        if (f1 !== null) {
          sewing.Add(f1);
          faceCount++;
        }

        // Triangle 2: (r,c), (r+1,c+1), (r,c+1)
        const f2 = makeTriFace(oc, p00, p11, p01);
        if (f2 !== null) {
          sewing.Add(f2);
          faceCount++;
        }
      }
    }

    if (faceCount === 0) {
      sewing.delete();
      return err(
        occtError(BrepErrorCode.SURFACE_FAILED, 'surfaceFromGrid: no valid triangular faces built')
      );
    }

    const sewProgress = new oc.Message_ProgressRange_1();
    sewing.Perform(sewProgress);
    sewProgress.delete();

    const sewn = sewing.SewedShape();
    const shape = castShape(sewn);

    if (isFace(shape)) {
      return ok(shape);
    }

    if (isShell(shape)) {
      return ok(shape);
    }

    shape[Symbol.dispose]();
    return err(
      occtError(BrepErrorCode.SURFACE_FAILED, 'surfaceFromGrid: unexpected shape type from sewing')
    );
  } finally {
    sewing.delete();
  }
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
          value = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
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
