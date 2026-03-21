/**
 * Configured STEP export with full control over units, schema, and assembly mode.
 */

import { getKernel } from '@/kernel/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError, BrepErrorCode } from '@/core/errors.js';

/** Options for configured STEP export. */
export interface StepExportOptions {
  /** Length unit for the STEP file (e.g., 'mm', 'inch', 'm'). */
  readonly unit?: string | undefined;
  /** Model unit override. */
  readonly modelUnit?: string | undefined;
  /** STEP schema version (e.g., 203, 214, 242). */
  readonly schema?: number | undefined;
}

/** A shape with optional name and color for STEP assembly export. */
export interface StepExportPart<D extends Dimension = '3D'> {
  readonly shape: AnyShape<D>;
  readonly name?: string | undefined;
  readonly color?: readonly [number, number, number, number] | undefined;
}

/**
 * Export shapes to STEP format with full control over units and schema.
 *
 * Unlike `exportSTEP`, this function allows specifying the length unit,
 * model unit, and STEP schema version.
 *
 * @returns The STEP file content as a string.
 */
export function exportSTEPConfigured(
  parts: ReadonlyArray<StepExportPart>,
  options?: StepExportOptions
): Result<string> {
  try {
    const kernel = getKernel();
    const kernelParts = parts.map((p) => ({
      shape: p.shape.wrapped,
      name: p.name,
      color: p.color ? ([...p.color] as [number, number, number, number]) : undefined,
    }));
    const result = kernel.exportSTEPConfigured(kernelParts, options);
    return ok(result);
  } catch (e) {
    return err(
      ioError(BrepErrorCode.STEP_EXPORT_CONFIGURED_FAILED, 'Configured STEP export failed', e)
    );
  }
}
