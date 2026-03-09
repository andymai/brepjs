import type { KernelType } from '../kernel/types.js';
import { getKernel } from '../kernel/index.js';
import { type KernelHandle, createKernelHandle } from '../core/disposal.js';
import { uuidv } from '../utils/uuid.js';
import type { AnyShape, Dimension } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import type { SupportedUnit } from './exporterUtils.js';

export type { SupportedUnit } from './exporterUtils.js';

/** Disposable handle wrapping an XCAF document for STEP assembly export. */
export type AssemblyExporter = KernelHandle<KernelType>;

/** Configuration for a single shape within an assembly export. */
export type ShapeOptions = {
  /** The shape to include in the assembly. */
  shape: AnyShape<Dimension>;
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
export function createAssembly(shapes: ShapeOptions[] = []): AssemblyExporter {
  const parts = shapes.map(({ shape, name, color, alpha }) => {
    const hex = color ?? '#f00';
    let h = hex;
    if (h.indexOf('#') === 0) h = h.slice(1);
    if (h.length === 3) h = h.replace(/([0-9a-f])/gi, '$1$1');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    const a = Math.round((alpha ?? 1) * 255);
    return {
      shape: shape.wrapped,
      name: name ?? uuidv(),
      color: [r, g, b, a] as [number, number, number, number],
    };
  });
  const doc = getKernel().createXCAFDocument(parts);
  return createKernelHandle(doc);
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
  shapes: ShapeOptions[] = [],
  { unit, modelUnit }: { unit?: SupportedUnit; modelUnit?: SupportedUnit } = {}
): Result<Blob> {
  const doc = createAssembly(shapes);

  try {
    const stepString = getKernel().writeXCAFToSTEP(doc.value, { unit, modelUnit });
    if (!stepString) {
      return err(ioError('STEP_EXPORT_FAILED', 'Failed to write STEP file'));
    }
    return ok(new Blob([stepString], { type: 'application/STEP' }));
  } finally {
    doc[Symbol.dispose]();
  }
}
