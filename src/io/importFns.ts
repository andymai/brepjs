/**
 * Functional file import operations using branded shape types.
 * Supports STEP, STL, and IGES formats.
 */

import { getKernel } from '@/kernel/index.js';
import type { UnknownDimShape } from '@/core/shapeTypes.js';
import { castResultShape, isSolid } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError } from '@/core/errors.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { igesUnsupportedError } from './igesSupport.js';
import { sewFacesIntoSolids } from './ioUtils.js';

/**
 * Import a STEP file from a Blob.
 *
 * Writes the blob to the WASM virtual filesystem, reads it with
 * `STEPControl_Reader`, and returns the resulting shape.
 *
 * @param blob - A Blob or File containing STEP data (.step / .stp).
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const file = new File([stepData], 'part.step');
 * const shape = unwrap(await importSTEP(file));
 * ```
 */
export async function importSTEP(blob: Blob): Promise<Result<UnknownDimShape>> {
  try {
    const data = await blob.arrayBuffer();
    const shapes = getKernel().importSTEP(data);
    if (shapes.length === 0) {
      return err(ioError('STEP_IMPORT_FAILED', 'STEP file contains no valid geometry'));
    }

    // Multi-root files yield several top-level shapes; only the first is
    // returned, so release the rest to avoid leaking their arena slots.
    for (let i = 1; i < shapes.length; i++) {
      const extra = shapes[i];
      if (extra) getKernel().dispose(extra);
    }
    return ok(castResultShape(shapes[0]));
  } catch (e) {
    return err(ioError('STEP_IMPORT_FAILED', 'Failed to load STEP file', e));
  }
}

const STL_SEW_TOLERANCE = 1e-6;

/**
 * Import an STL file from a Blob.
 *
 * Reads the triangle mesh and sews its facets together. A closed mesh becomes a
 * `Solid` (one planar face per facet), so booleans and volume measurement work on
 * it directly. An open mesh has no interior, so it comes back as a sewn `Shell`.
 * A file with several bodies comes back as a `Compound` holding a `Solid` per
 * closed body and a `Shell` per open one.
 *
 * @param blob - A Blob or File containing STL data (binary or ASCII).
 * @returns A `Result` wrapping the imported solid (a shell for an open mesh, a
 *   compound for several bodies), or an error if parsing fails.
 *
 * @remarks Every triangle becomes its own B-Rep face, so import time grows with
 * the triangle count: on the default occt-wasm kernel, roughly 2.5 seconds per
 * 10,000 triangles (about 15 seconds for 50,000), and up to about twice that
 * when the file holds several bodies. The temporary file on the WASM FS is
 * cleaned up automatically.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importSTL(stlBlob));
 * ```
 */
export async function importSTL(blob: Blob): Promise<Result<UnknownDimShape>> {
  try {
    const data = await blob.arrayBuffer();
    const raw = getKernel().importSTL(data);
    if (raw.IsNull()) {
      return err(ioError('STL_IMPORT_FAILED', 'Failed to create solid from STL mesh'));
    }
    const shape = castResultShape(raw);
    if (isSolid(shape)) return ok(shape);
    using facets = shape;
    const faces = getFaces(facets).map((f) => f.wrapped);
    return ok(sewFacesIntoSolids(faces, STL_SEW_TOLERANCE));
  } catch (e) {
    return err(ioError('STL_IMPORT_FAILED', 'Failed to load STL file', e));
  }
}

/**
 * Import an IGES file from a Blob.
 *
 * @param blob - A Blob or File containing IGES data (.iges / .igs).
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically. The
 * default occt-wasm kernel is built without an IGES translator, so there this
 * returns an `UNSUPPORTED_CAPABILITY` error; import STEP instead.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importIGES(igesBlob));
 * ```
 */
export async function importIGES(blob: Blob): Promise<Result<UnknownDimShape>> {
  try {
    const data = await blob.arrayBuffer();
    const shapes = getKernel().importIGES(data);
    if (shapes.length === 0) {
      return err(ioError('IGES_IMPORT_FAILED', 'IGES file contains no valid geometry'));
    }

    // Multi-root files yield several top-level shapes; only the first is
    // returned, so release the rest to avoid leaking their arena slots.
    for (let i = 1; i < shapes.length; i++) {
      const extra = shapes[i];
      if (extra) getKernel().dispose(extra);
    }
    return ok(castResultShape(shapes[0]));
  } catch (e) {
    return err(
      igesUnsupportedError('importIGES', e) ??
        ioError('IGES_IMPORT_FAILED', 'Failed to load IGES file', e)
    );
  }
}
