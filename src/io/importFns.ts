/**
 * Functional file import operations using branded shape types.
 * Supports STEP, STL, and IGES formats.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { uniqueId } from '../core/constants.js';

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
  const oc = getKernel().oc;
  const r = gcWithScope();
  const fileName = uniqueId();

  try {
    const bufferView = new Uint8Array(await blob.arrayBuffer());
    oc.FS.writeFile(`/${fileName}`, bufferView);

    const reader = r(new oc.STEPControl_Reader_1());
    if (!reader.ReadFile(fileName)) {
      return err(ioError('STEP_IMPORT_FAILED', 'Failed to load STEP file'));
    }

    reader.TransferRoots(r(new oc.Message_ProgressRange_1()));
    const stepShape = reader.OneShape();

    if (stepShape.IsNull()) {
      return err(ioError('STEP_IMPORT_FAILED', 'STEP file contains no valid geometry'));
    }

    return ok(castShape(stepShape));
  } finally {
    try {
      oc.FS.unlink('/' + fileName);
    } catch {
      // Cleanup failure is non-critical — file may not exist if writeFile failed,
      // or may already be removed. WASM FS is ephemeral anyway.
    }
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
  const oc = getKernel().oc;
  const r = gcWithScope();
  const fileName = uniqueId();

  try {
    const bufferView = new Uint8Array(await blob.arrayBuffer());
    oc.FS.writeFile(`/${fileName}`, bufferView);

    const reader = r(new oc.StlAPI_Reader());
    const readShape = r(new oc.TopoDS_Shell());

    if (!reader.Read(readShape, fileName)) {
      return err(ioError('STL_IMPORT_FAILED', 'Failed to load STL file'));
    }

    const upgrader = r(new oc.ShapeUpgrade_UnifySameDomain_2(readShape, true, true, false));
    upgrader.Build();
    const upgraded = r(upgrader.Shape());

    const solidBuilder = r(new oc.BRepBuilderAPI_MakeSolid_1());
    solidBuilder.Add(oc.TopoDS.Shell_1(upgraded));

    const solid = solidBuilder.Solid();
    if (solid.IsNull()) {
      return err(ioError('STL_IMPORT_FAILED', 'Failed to create solid from STL mesh'));
    }

    return ok(castShape(solid));
  } finally {
    try {
      oc.FS.unlink('/' + fileName);
    } catch {
      // Cleanup failure is non-critical — file may not exist if writeFile failed,
      // or may already be removed. WASM FS is ephemeral anyway.
    }
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
  const oc = getKernel().oc;
  const r = gcWithScope();
  const fileName = uniqueId();

  try {
    const bufferView = new Uint8Array(await blob.arrayBuffer());
    oc.FS.writeFile(`/${fileName}`, bufferView);

    const reader = r(new oc.IGESControl_Reader_1());
    const status = reader.ReadFile(fileName);
    if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      return err(ioError('IGES_IMPORT_FAILED', 'Failed to load IGES file'));
    }

    reader.TransferRoots(r(new oc.Message_ProgressRange_1()));
    const igesShape = reader.OneShape();

    if (igesShape.IsNull()) {
      return err(ioError('IGES_IMPORT_FAILED', 'IGES file contains no valid geometry'));
    }

    return ok(castShape(igesShape));
  } finally {
    try {
      oc.FS.unlink('/' + fileName);
    } catch {
      // Cleanup failure is non-critical
    }
  }
}
