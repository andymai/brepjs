import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { gcWithScope, WrappingObj } from '../core/memory.js';
import { uuidv } from '../utils/uuid.js';
import type { AnyShape } from '../topology/shapes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { uniqueIOFilename } from '../core/constants.js';
import {
  wrapString,
  wrapColor,
  configureStepUnits,
  configureStepWriter,
  type SupportedUnit,
} from './exporterUtils.js';

export type { SupportedUnit } from './exporterUtils.js';

export class AssemblyExporter extends WrappingObj<OcType> {}

export type ShapeConfig = {
  shape: AnyShape;
  color?: string;
  alpha?: number;
  name?: string;
};

export function createAssembly(shapes: ShapeConfig[] = []): AssemblyExporter {
  const oc = getKernel().oc;

  const doc = new oc.TDocStd_Document(wrapString('XmlOcaf'));

  oc.XCAFDoc_ShapeTool.SetAutoNaming(false);

  const mainLabel = doc.Main();

  const tool = oc.XCAFDoc_DocumentTool.ShapeTool(mainLabel).get();
  const ctool = oc.XCAFDoc_DocumentTool.ColorTool(mainLabel).get();

  for (const { shape, name, color, alpha } of shapes) {
    const shapeNode = tool.NewShape();

    tool.SetShape(shapeNode, shape.wrapped);

    oc.TDataStd_Name.Set_1(shapeNode, wrapString(name || uuidv()));

    ctool.SetColor_3(
      shapeNode,
      wrapColor(color || '#f00', alpha ?? 1),
      oc.XCAFDoc_ColorType.XCAFDoc_ColorSurf
    );
  }

  tool.UpdateAssemblies();

  return new AssemblyExporter(doc);
}

export function exportSTEP(
  shapes: ShapeConfig[] = [],
  { unit, modelUnit }: { unit?: SupportedUnit; modelUnit?: SupportedUnit } = {}
): Result<Blob> {
  const oc = getKernel().oc;
  const r = gcWithScope();

  const doc = createAssembly(shapes);

  try {
    configureStepUnits(unit, modelUnit, r);

    const session = r(new oc.XSControl_WorkSession());
    const writer = r(
      new oc.STEPCAFControl_Writer_2(r(new oc.Handle_XSControl_WorkSession_2(session)), false)
    );
    configureStepWriter(writer);

    const progress = r(new oc.Message_ProgressRange_1());
    writer.Transfer_1(
      new oc.Handle_TDocStd_Document_2(doc.wrapped),
      oc.STEPControl_StepModelType.STEPControl_AsIs,
      null,
      progress
    );

    const filename = uniqueIOFilename('_export', 'step');
    const done = writer.Write(filename);

    if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      const file = oc.FS.readFile('/' + filename);
      oc.FS.unlink('/' + filename);

      const blob = new Blob([file], { type: 'application/STEP' });
      return ok(blob);
    } else {
      return err(ioError('STEP_EXPORT_FAILED', 'Failed to write STEP file'));
    }
  } finally {
    doc.delete();
  }
}
