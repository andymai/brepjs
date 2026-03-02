/**
 * Functional assembly exporter using branded shape types.
 */

import { getKernel } from '../kernel/index.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { uuidv } from '../utils/uuid.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError } from '../core/errors.js';
import type { SupportedUnit } from './exporterUtils.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type { SupportedUnit } from './exporterUtils.js';

/** Configuration for a single shape within a functional assembly export. */
export interface ShapeOptions {
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
  shapes: ShapeOptions[] = [],
  { unit, modelUnit }: { unit?: SupportedUnit; modelUnit?: SupportedUnit } = {}
): Result<Blob> {
  const parseHex = (hex: string): [number, number, number] => {
    let h = hex;
    if (h.indexOf('#') === 0) h = h.slice(1);
    if (h.length === 3) h = h.replace(/([0-9a-f])/gi, '$1$1');
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
  };

  const kernel = getKernel();
  const parts = shapes.map(({ shape, name, color, alpha }) => {
    const [r, g, b] = parseHex(color ?? '#f00');
    return {
      shape: shape.wrapped,
      name: name ?? uuidv(),
      color: [r, g, b, Math.round((alpha ?? 1) * 255)] as [number, number, number, number],
    };
  });

  const doc = kernel.createXCAFDocument(parts);
  try {
    const stepString = kernel.writeXCAFToSTEP(doc, { unit, modelUnit });
    if (!stepString) {
      return err(ioError('STEP_EXPORT_FAILED', 'Failed to write STEP file'));
    }
    return ok(new Blob([stepString], { type: 'application/STEP' }));
  } finally {
    doc.delete();
  }
}
