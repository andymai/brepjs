/**
 * Maps occt-wasm OcctError instances to brepjs BrepError objects.
 *
 * occt-wasm 1.4.0 introduced OcctErrorCode for structured error handling.
 * This module translates those codes into brepjs's BrepError taxonomy so
 * that downstream Result<T> consumers get consistent error kinds/codes
 * regardless of which kernel produced them.
 *
 * Lives in core/ (Layer 1) because it imports BrepError types.
 * kernel/ (Layer 0) code must NOT import this directly — wire through
 * kernelCall or dependency injection instead.
 *
 * @module
 */

import type { BrepError, BrepErrorKind } from './errors.js';
import { BrepErrorCode } from './errors.js';

// ---------------------------------------------------------------------------
// OcctErrorCode → BrepError mapping table
// ---------------------------------------------------------------------------

interface ErrorMapping {
  readonly kind: BrepErrorKind;
  readonly code: string;
}

/**
 * Static mapping from occt-wasm OcctErrorCode string values to brepjs error
 * kind + code. Keys match the OcctErrorCode enum values from occt-wasm 1.4.0.
 *
 * CONSTRUCTION_FAILED uses generic VALIDATION_FAILED because it covers
 * edges, wires, faces, and solids — not just faces.
 */
const OCCT_ERROR_MAP: Readonly<Record<string, ErrorMapping>> = {
  CONSTRUCTION_FAILED: { kind: 'KERNEL_OPERATION', code: BrepErrorCode.VALIDATION_FAILED },
  BOOLEAN_FAILED: { kind: 'KERNEL_OPERATION', code: BrepErrorCode.BOOLEAN_HAS_ERRORS },
  INVALID_SHAPE_ID: { kind: 'VALIDATION', code: BrepErrorCode.NULL_SHAPE_INPUT },
  INVALID_LABEL_ID: { kind: 'VALIDATION', code: BrepErrorCode.NULL_SHAPE_INPUT },
  TESSELLATION_FAILED: { kind: 'COMPUTATION', code: BrepErrorCode.INTERSECTION_FAILED },
  IMPORT_EXPORT_FAILED: { kind: 'IO', code: BrepErrorCode.STEP_IMPORT_FAILED },
  HEALING_FAILED: { kind: 'KERNEL_OPERATION', code: BrepErrorCode.FIX_SHAPE_FAILED },
  DOCUMENT_CLOSED: { kind: 'VALIDATION', code: BrepErrorCode.NULL_SHAPE_INPUT },
  KERNEL_ERROR: { kind: 'KERNEL_OPERATION', code: BrepErrorCode.VALIDATION_FAILED },
  UNKNOWN: { kind: 'KERNEL_OPERATION', code: BrepErrorCode.VALIDATION_FAILED },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect whether an error has an OcctErrorCode-shaped `.code` property.
 */
function getOcctErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as Record<string, unknown>)['code'] === 'string'
  ) {
    return (error as Record<string, unknown>)['code'] as string;
  }
  return undefined;
}

/**
 * Map an occt-wasm error to a {@link BrepError}.
 *
 * If the error is an `OcctError` (has a `.code` field), the code is mapped
 * to the appropriate `BrepErrorKind` and `BrepErrorCode`. For unrecognised
 * errors, falls back to a generic `KERNEL_OPERATION` error.
 */
export function mapOcctError(error: unknown): BrepError {
  const code = getOcctErrorCode(error);
  const message = error instanceof Error ? error.message : String(error);

  if (code) {
    const mapping = OCCT_ERROR_MAP[code];
    if (mapping) {
      return {
        kind: mapping.kind,
        code: mapping.code,
        message,
        cause: error,
      };
    }
  }

  // Fallback for plain errors or unrecognised codes
  return {
    kind: 'KERNEL_OPERATION',
    code: BrepErrorCode.VALIDATION_FAILED,
    message,
    cause: error,
  };
}
