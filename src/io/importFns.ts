/**
 * Functional file import operations using branded shape types.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { uniqueId } from '../core/constants.js';

/** Import a STEP file from a Blob. Returns a branded shape. */
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

/** Import an STL file from a Blob. Returns a branded shape. */
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
