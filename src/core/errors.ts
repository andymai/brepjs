/**
 * Domain error types and constructors for brepjs.
 * Re-exports bug/BrepBugError from utils (Layer 0) for convenience.
 */

export { bug, BrepBugError } from '../utils/bug.js';

// ---------------------------------------------------------------------------
// Error kinds
// ---------------------------------------------------------------------------

/** High-level category for a brepjs error. */
export type BrepErrorKind =
  | 'OCCT_OPERATION'
  | 'VALIDATION'
  | 'TYPE_CAST'
  | 'SKETCHER_STATE'
  | 'MODULE_INIT'
  | 'COMPUTATION'
  | 'IO'
  | 'QUERY';

// ---------------------------------------------------------------------------
// Error codes — typed constants for all known error code strings
// ---------------------------------------------------------------------------

/**
 * Typed string constants for all known brepjs error codes, grouped by category.
 *
 * Use these instead of raw strings so that typos are caught at compile time.
 */
export const BrepErrorCode = {
  // OCCT operation errors
  BSPLINE_FAILED: 'BSPLINE_FAILED',
  FACE_BUILD_FAILED: 'FACE_BUILD_FAILED',
  SWEEP_FAILED: 'SWEEP_FAILED',
  LOFT_FAILED: 'LOFT_FAILED',
  FUSE_FAILED: 'FUSE_FAILED',
  CUT_FAILED: 'CUT_FAILED',

  // Validation errors
  ELLIPSE_RADII: 'ELLIPSE_RADII',
  FUSE_ALL_EMPTY: 'FUSE_ALL_EMPTY',
  FILLET_NO_EDGES: 'FILLET_NO_EDGES',
  CHAMFER_NO_EDGES: 'CHAMFER_NO_EDGES',
  POLYGON_MIN_POINTS: 'POLYGON_MIN_POINTS',
  ZERO_LENGTH_EXTRUSION: 'ZERO_LENGTH_EXTRUSION',
  ZERO_TWIST_ANGLE: 'ZERO_TWIST_ANGLE',
  LOFT_EMPTY: 'LOFT_EMPTY',
  UNSUPPORTED_PROFILE: 'UNSUPPORTED_PROFILE',
  UNKNOWN_PLANE: 'UNKNOWN_PLANE',

  // Type cast errors
  FUSE_NOT_3D: 'FUSE_NOT_3D',
  CUT_NOT_3D: 'CUT_NOT_3D',
  INTERSECT_NOT_3D: 'INTERSECT_NOT_3D',
  FUSE_ALL_NOT_3D: 'FUSE_ALL_NOT_3D',
  CUT_ALL_NOT_3D: 'CUT_ALL_NOT_3D',
  LOFT_NOT_3D: 'LOFT_NOT_3D',
  SWEEP_NOT_3D: 'SWEEP_NOT_3D',
  REVOLUTION_NOT_3D: 'REVOLUTION_NOT_3D',
  FILLET_NOT_3D: 'FILLET_NOT_3D',
  CHAMFER_NOT_3D: 'CHAMFER_NOT_3D',
  SHELL_NOT_3D: 'SHELL_NOT_3D',
  OFFSET_NOT_3D: 'OFFSET_NOT_3D',
  NULL_SHAPE: 'NULL_SHAPE',
  NO_WRAPPER: 'NO_WRAPPER',
  WELD_NOT_SHELL: 'WELD_NOT_SHELL',
  SOLID_BUILD_FAILED: 'SOLID_BUILD_FAILED',
  OFFSET_NOT_WIRE: 'OFFSET_NOT_WIRE',
  UNKNOWN_SURFACE_TYPE: 'UNKNOWN_SURFACE_TYPE',
  UNKNOWN_CURVE_TYPE: 'UNKNOWN_CURVE_TYPE',
  SWEEP_START_NOT_WIRE: 'SWEEP_START_NOT_WIRE',
  SWEEP_END_NOT_WIRE: 'SWEEP_END_NOT_WIRE',

  // IO errors
  STEP_EXPORT_FAILED: 'STEP_EXPORT_FAILED',
  STEP_FILE_READ_ERROR: 'STEP_FILE_READ_ERROR',
  STL_EXPORT_FAILED: 'STL_EXPORT_FAILED',
  STL_FILE_READ_ERROR: 'STL_FILE_READ_ERROR',
  STEP_IMPORT_FAILED: 'STEP_IMPORT_FAILED',
  STL_IMPORT_FAILED: 'STL_IMPORT_FAILED',
  IGES_EXPORT_FAILED: 'IGES_EXPORT_FAILED',
  IGES_IMPORT_FAILED: 'IGES_IMPORT_FAILED',

  // Computation errors
  PARAMETER_NOT_FOUND: 'PARAMETER_NOT_FOUND',
  INTERSECTION_FAILED: 'INTERSECTION_FAILED',
  SELF_INTERSECTION_FAILED: 'SELF_INTERSECTION_FAILED',

  // Query errors
  FINDER_NOT_UNIQUE: 'FINDER_NOT_UNIQUE',
} as const;

/** Union of all known error code string literals. */
export type BrepErrorCode = (typeof BrepErrorCode)[keyof typeof BrepErrorCode];

// ---------------------------------------------------------------------------
// Error interface
// ---------------------------------------------------------------------------

/**
 * Structured error returned inside `Result<T>` on failure.
 *
 * Every error carries a `kind` (category), a machine-readable `code`,
 * and a human-readable `message`. Optional `cause` preserves the
 * original exception, and `metadata` holds extra context.
 */
export interface BrepError {
  readonly kind: BrepErrorKind;
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Constructors per kind
// ---------------------------------------------------------------------------

function makeError(
  kind: BrepErrorKind,
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  const base: BrepError = { kind, code, message, cause };
  if (metadata) return { ...base, metadata };
  return base;
}

/** Create an error for a failed OCCT kernel operation. */
export function occtError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('OCCT_OPERATION', code, message, cause, metadata);
}

/** Create an error for invalid input parameters. */
export function validationError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('VALIDATION', code, message, cause, metadata);
}

/** Create an error for a failed shape type cast or conversion. */
export function typeCastError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('TYPE_CAST', code, message, cause, metadata);
}

/** Create an error for an invalid sketcher state transition. */
export function sketcherStateError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('SKETCHER_STATE', code, message, cause, metadata);
}

/** Create an error for a module initialisation failure. */
export function moduleInitError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('MODULE_INIT', code, message, cause, metadata);
}

/** Create an error for a failed geometric computation. */
export function computationError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('COMPUTATION', code, message, cause, metadata);
}

/** Create an error for a file import/export failure. */
export function ioError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('IO', code, message, cause, metadata);
}

/** Create an error for a shape query failure (e.g. finder not unique). */
export function queryError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>
): BrepError {
  return makeError('QUERY', code, message, cause, metadata);
}

// ---------------------------------------------------------------------------
// Bug / panic helper — re-exported from utils/bug.ts (Layer 0)
// ---------------------------------------------------------------------------
