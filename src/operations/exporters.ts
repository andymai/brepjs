import type { OcType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { gcWithScope } from '../core/memory.js';
import { type OcHandle, createOcHandle } from '../core/disposal.js';
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

/** Disposable handle wrapping an XCAF document for STEP assembly export. */
export type AssemblyExporter = OcHandle<OcType>;

/** Configuration for a single shape within an assembly export. */
export type ShapeConfig = {
  /** The shape to include in the assembly. */
  shape: AnyShape;
  /** Hex color string (e.g. `'#ff0000'`). Defaults to red. */
  color?: string;
  /** Opacity from 0 (transparent) to 1 (opaque). Defaults to 1. */
  alpha?: number;
  /** Display name for the shape node. Auto-generated UUID if omitted. */
  name?: string;
};

/**
 * Create an XCAF assembly document from a list of shape configurations.
 *
 * Each shape is added as a named, colored node in the XCAF document tree.
 * The returned {@link AssemblyExporter} wraps the live `TDocStd_Document` and
 * must be deleted after use to avoid memory leaks.
 *
 * @returns An {@link AssemblyExporter} wrapping the XCAF document.
 *
 * @see {@link exportSTEP} which calls this internally to produce a STEP blob.
 */
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

  return createOcHandle(doc);
}

/**
 * Export shapes as a STEP file blob with optional unit configuration.
 *
 * Builds an XCAF assembly, configures the STEP writer, and writes to an
 * in-memory filesystem. The resulting `Blob` can be saved or downloaded directly.
 *
 * @param shapes - Shapes to include in the STEP file.
 * @param options - Optional unit settings for the STEP writer.
 * @param options.unit - Write unit (e.g. `'MM'`, `'INCH'`).
 * @param options.modelUnit - Model unit; defaults to the write unit.
 * @returns `Result` containing a `Blob` with MIME type `application/STEP`.
 *
 * @example
 * ```ts
 * const result = exportSTEP(
 *   [{ shape: myBox, color: '#00ff00', name: 'box' }],
 *   { unit: 'MM' }
 * );
 * if (result.ok) saveAs(result.value, 'model.step');
 * ```
 *
 * @see {@link exporterFns!exportAssemblySTEP | exportAssemblySTEP} for the functional API equivalent.
 */
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
      new oc.Handle_TDocStd_Document_2(doc.value),
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
    doc[Symbol.dispose]();
  }
}
