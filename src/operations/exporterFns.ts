/**
 * Functional assembly exporter using branded shape types.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { uuidv } from '../utils/uuid.js';
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type { SupportedUnit } from './exporterUtils.js';

/** Configuration for a single shape within a functional assembly export. */
export interface ShapeConfig {
  /** The branded shape to include in the assembly. */
  shape: AnyShape;
  /** Hex color string (e.g. `'#ff0000'`). Defaults to red. */
  color?: string;
  /** Opacity from 0 (transparent) to 1 (opaque). Defaults to 1. */
  alpha?: number;
  /** Display name for the shape node. Auto-generated UUID if omitted. */
  name?: string;
}

/**
 * Create an XCAF document from shape configs and export as a STEP blob.
 *
 * Builds an in-memory XCAF assembly with named, colored shape nodes, writes
 * it through `STEPCAFControl_Writer`, and returns the file contents as a
 * `Blob`. The XCAF document is deleted after export to avoid memory leaks.
 *
 * @param shapes - Shapes to include in the STEP file.
 * @param options - Optional unit settings for the STEP writer.
 * @param options.unit - Write unit (e.g. `'MM'`, `'INCH'`).
 * @param options.modelUnit - Model unit; defaults to the write unit.
 * @returns `Result` containing a `Blob` with MIME type `application/STEP`.
 *
 * @example
 * ```ts
 * const result = exportAssemblySTEP(
 *   [{ shape: myBox, color: '#00ff00', name: 'box' }],
 *   { unit: 'MM' }
 * );
 * if (result.ok) saveAs(result.value, 'model.step');
 * ```
 *
 * @see {@link exporters!exportSTEP | exportSTEP} for the OOP API equivalent.
 */
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
    configureStepUnits(unit, modelUnit, r);

    const session = r(new oc.XSControl_WorkSession());
    const writer = r(
      new oc.STEPCAFControl_Writer_2(r(new oc.Handle_XSControl_WorkSession_2(session)), false)
    );
    configureStepWriter(writer);

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
