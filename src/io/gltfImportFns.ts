/**
 * Functional GLB/glTF import operations using branded shape types.
 */

import { getKernel } from '@/kernel/index.js';
import type { UnknownDimShape } from '@/core/shapeTypes.js';
import { castResultShape } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError, BrepErrorCode } from '@/core/errors.js';

/**
 * Import a GLB (binary glTF) file from a Blob.
 *
 * Delegates to the kernel's `importGLB` method, which reconstructs
 * B-Rep geometry from the mesh data.
 *
 * @param blob - A Blob or File containing GLB data.
 * @returns A `Result` wrapping the imported shape, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const shape = unwrap(await importGLB(glbBlob));
 * ```
 */
export async function importGLB(blob: Blob): Promise<Result<UnknownDimShape>> {
  try {
    const data = await blob.arrayBuffer();
    const shape = getKernel().importGLB(data);
    return ok(castResultShape(shape));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ioError(BrepErrorCode.GLB_IMPORT_FAILED, `Failed to import GLB: ${msg}`, e));
  }
}
