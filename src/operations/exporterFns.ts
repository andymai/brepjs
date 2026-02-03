/**
 * Functional assembly exporter using branded shape types.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT types are dynamic
type OcType = any;

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { uuidv } from '../utils/uuid.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import { uniqueIOFilename } from '../core/constants.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function wrapString(str: string): OcType {
  const oc = getKernel().oc;
  return new oc.TCollection_ExtendedString_2(str, true);
}

function parseSlice(hex: string, index: number): number {
  return parseInt(hex.slice(index * 2, (index + 1) * 2), 16);
}

function colorFromHex(hex: string): [number, number, number] {
  let color = hex;
  if (color.indexOf('#') === 0) color = color.slice(1);
  if (color.length === 3) {
    color = color.replace(/([0-9a-f])/gi, '$1$1');
  }
  return [parseSlice(color, 0), parseSlice(color, 1), parseSlice(color, 2)];
}

function wrapColor(hex: string, alpha = 1): OcType {
  const oc = getKernel().oc;
  const [red, green, blue] = colorFromHex(hex);
  return new oc.Quantity_ColorRGBA_5(red / 255, green / 255, blue / 255, alpha);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ShapeConfig {
  shape: AnyShape;
  color?: string;
  alpha?: number;
  name?: string;
}

export type SupportedUnit = 'M' | 'CM' | 'MM' | 'INCH' | 'FT' | 'm' | 'mm' | 'cm' | 'inch' | 'ft';

/** Create an XCAF document from shape configs and export as STEP blob. */
export function exportAssemblySTEP(
  shapes: ShapeConfig[] = [],
  { unit, modelUnit }: { unit?: SupportedUnit; modelUnit?: SupportedUnit } = {}
): Result<Blob> {
  const oc = getKernel().oc;
  const r = gcWithScope();

  // Build XCAF document
  const doc = new oc.TDocStd_Document(wrapString('XmlOcaf'));

  try {
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

    // Configure writer
    if (unit || modelUnit) {
      r(new oc.STEPCAFControl_Writer_1());
      oc.Interface_Static.SetCVal('xstep.cascade.unit', (modelUnit || unit || 'MM').toUpperCase());
      oc.Interface_Static.SetCVal('write.step.unit', (unit || modelUnit || 'MM').toUpperCase());
    }

    const session = r(new oc.XSControl_WorkSession());
    const writer = r(
      new oc.STEPCAFControl_Writer_2(r(new oc.Handle_XSControl_WorkSession_2(session)), false)
    );
    writer.SetColorMode(true);
    writer.SetLayerMode(true);
    writer.SetNameMode(true);
    oc.Interface_Static.SetIVal('write.surfacecurve.mode', true);
    oc.Interface_Static.SetIVal('write.precision.mode', 0);
    oc.Interface_Static.SetIVal('write.step.assembly', 2);
    oc.Interface_Static.SetIVal('write.step.schema', 5);

    const progress = r(new oc.Message_ProgressRange_1());
    writer.Transfer_1(
      new oc.Handle_TDocStd_Document_2(doc),
      oc.STEPControl_StepModelType.STEPControl_AsIs,
      null,
      progress
    );

    const filename = uniqueIOFilename('_export', 'step');
    const done = writer.Write(filename);

    if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      const file = oc.FS.readFile('/' + filename);
      oc.FS.unlink('/' + filename);
      return ok(new Blob([file], { type: 'application/STEP' }));
    }
    return err(ioError('STEP_EXPORT_FAILED', 'Failed to write STEP file'));
  } finally {
    doc.delete();
  }
}
