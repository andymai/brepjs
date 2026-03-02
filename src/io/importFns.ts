/**
 * Functional file import operations using branded shape types.
 * Supports STEP, STL, and IGES formats.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';

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
export async function importSTEP(blob: Blob): Promise<Result<AnyShape>> {
  try {
    const data = await blob.arrayBuffer();
    const shapes = getKernel().importSTEP(data);
    if (shapes.length === 0) {
      return err(ioError('STEP_IMPORT_FAILED', 'STEP file contains no valid geometry'));
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return ok(castShape(shapes[0]));
  } catch {
    return err(ioError('STEP_IMPORT_FAILED', 'Failed to load STEP file'));
  }
}

/**
 * Import an STL file from a Blob.
 *
 * Reads the mesh, unifies same-domain faces with `ShapeUpgrade_UnifySameDomain`,
 * and wraps the result as a solid.
 *
 * @param blob - A Blob or File containing STL data (binary or ASCII).
 * @returns A `Result` wrapping the imported solid, or an error if parsing fails.
 *
 * @remarks The temporary file on the WASM FS is cleaned up automatically.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importSTL(stlBlob));
 * ```
 */
export async function importSTL(blob: Blob): Promise<Result<AnyShape>> {
  try {
    const data = await blob.arrayBuffer();
    const shape = getKernel().importSTL(data);
    if (shape.IsNull()) {
      return err(ioError('STL_IMPORT_FAILED', 'Failed to create solid from STL mesh'));
    }
    return ok(castShape(shape));
  } catch {
    return err(ioError('STL_IMPORT_FAILED', 'Failed to load STL file'));
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
export async function importIGES(blob: Blob): Promise<Result<AnyShape>> {
  try {
    const data = await blob.arrayBuffer();
    const shapes = getKernel().importIGES(data);
    if (shapes.length === 0) {
      return err(ioError('IGES_IMPORT_FAILED', 'IGES file contains no valid geometry'));
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return ok(castShape(shapes[0]));
  } catch {
    return err(ioError('IGES_IMPORT_FAILED', 'Failed to load IGES file'));
  }
}
