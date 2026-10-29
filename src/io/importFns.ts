/**
 * Functional file import operations using branded shape types.
 * Supports STEP, STL, and IGES formats.
 */

import { getKernel } from '@/kernel/index.js';
import type { AnyShape, Dimension, UnknownDimShape } from '@/core/shapeTypes.js';
import { castResultShape, isSolid } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError } from '@/core/errors.js';
import { getFaces } from '@/topology/topologyQueryFns.js';

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
 *
 * @param blob - A Blob or File containing STL data (binary or ASCII).
 * @returns A `Result` wrapping the imported solid (or shell for an open mesh), or
 *   an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
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
    return ok(sewFacets(facets));
  } catch (e) {
    return err(ioError('STL_IMPORT_FAILED', 'Failed to load STL file', e));
  }
}

/** Sew a bag of facet faces into a solid, or into a shell when the mesh is open. */
function sewFacets(facets: AnyShape<Dimension>): UnknownDimShape {
  const kernel = getKernel();
  const faces = getFaces(facets).map((f) => f.wrapped);
  try {
    return castResultShape(kernel.sewAndSolidify(faces, STL_SEW_TOLERANCE));
  } catch {
    // An open sewn shell is left un-solidified by the orientation fix, so the
    // solid downcast throws (castResultShape releases the rejected slot).
    return castResultShape(kernel.sew(faces, STL_SEW_TOLERANCE));
  }
}

/**
 * Import an IGES file from a Blob.
 *
 * @param blob - A Blob or File containing IGES data (.iges / .igs).
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
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
    return err(ioError('IGES_IMPORT_FAILED', 'Failed to load IGES file', e));
  }
}
