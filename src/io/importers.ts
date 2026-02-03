import { getKernel } from '../kernel/index.js';
import { localGC } from '../core/memory.js';
import { cast } from '../topology/cast.js';
import { type Result, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { uniqueId } from '../core/constants.js';
import type { AnyShape } from '../topology/shapes.js';

export async function importSTEP(STEPBlob: Blob): Promise<Result<AnyShape>> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const fileName = uniqueId();

  try {
    const bufferView = new Uint8Array(await STEPBlob.arrayBuffer());
    oc.FS.writeFile(`/${fileName}`, bufferView);

    const reader = r(new oc.STEPControl_Reader_1());
    if (!reader.ReadFile(fileName)) {
      return err(ioError('STEP_IMPORT_FAILED', 'Failed to load STEP file'));
    }

    reader.TransferRoots(r(new oc.Message_ProgressRange_1()));
    const stepShape = r(reader.OneShape());
    return cast(stepShape);
  } finally {
    try {
      oc.FS.unlink('/' + fileName);
    } catch {
      /* file may not exist if writeFile failed */
    }
    gc();
  }
}

export async function importSTL(STLBlob: Blob): Promise<Result<AnyShape>> {
  const oc = getKernel().oc;
  const [r, gc] = localGC();
  const fileName = uniqueId();

  try {
    const bufferView = new Uint8Array(await STLBlob.arrayBuffer());
    oc.FS.writeFile(`/${fileName}`, bufferView);

    const reader = r(new oc.StlAPI_Reader());
    const readShape = r(new oc.TopoDS_Shell());

    if (!reader.Read(readShape, fileName)) {
      return err(ioError('STL_IMPORT_FAILED', 'Failed to load STL file'));
    }

    const shapeUpgrader = r(new oc.ShapeUpgrade_UnifySameDomain_2(readShape, true, true, false));
    shapeUpgrader.Build();
    const upgradedShape = r(shapeUpgrader.Shape());

    const solidSTL = r(new oc.BRepBuilderAPI_MakeSolid_1());
    solidSTL.Add(oc.TopoDS.Shell_1(upgradedShape));
    const asSolid = r(solidSTL.Solid());

    return cast(asSolid);
  } finally {
    try {
      oc.FS.unlink('/' + fileName);
    } catch {
      /* file may not exist if writeFile failed */
    }
    gc();
  }
}
