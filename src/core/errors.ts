/**
 * Domain error types and constructors for brepjs.
 * Re-exports bug/BrepBugError from utils (Layer 0) for convenience.
 */

import { bug, BrepBugError } from '@/utils/bug.js';
export { bug, BrepBugError };

// ---------------------------------------------------------------------------
// Error kinds
// ---------------------------------------------------------------------------

/** High-level category for a brepjs error. */
export type BrepErrorKind =
  | 'KERNEL_OPERATION'
  | 'VALIDATION'
  | 'TYPE_CAST'
  | 'SKETCHER_STATE'
  | 'MODULE_INIT'
  | 'COMPUTATION'
  | 'IO'
  | 'QUERY'
  | 'UNSUPPORTED';

// ---------------------------------------------------------------------------
// Error codes — typed constants for all known error code strings
// ---------------------------------------------------------------------------

/**
 * Typed string constants for all known brepjs error codes, grouped by category.
 *
 * Use these instead of raw strings so that typos are caught at compile time.
 */
export const BrepErrorCode = {
  // kernel operation errors
  BSPLINE_FAILED: 'BSPLINE_FAILED',
  FACE_BUILD_FAILED: 'FACE_BUILD_FAILED',
  SWEEP_FAILED: 'SWEEP_FAILED',
  LOFT_FAILED: 'LOFT_FAILED',
  FUSE_FAILED: 'FUSE_FAILED',
  CUT_FAILED: 'CUT_FAILED',
  HEAL_NO_EFFECT: 'HEAL_NO_EFFECT',
  BOOLEAN_HAS_ERRORS: 'BOOLEAN_HAS_ERRORS',
  VARIABLE_FILLET_FAILED: 'VARIABLE_FILLET_FAILED',
  POSITION_ON_CURVE_FAILED: 'POSITION_ON_CURVE_FAILED',
  FIX_SHAPE_FAILED: 'FIX_SHAPE_FAILED',
  SOLID_FROM_SHELL_FAILED: 'SOLID_FROM_SHELL_FAILED',
  FIX_SELF_INTERSECTION_FAILED: 'FIX_SELF_INTERSECTION_FAILED',

  // Validation errors
  ELLIPSE_RADII: 'ELLIPSE_RADII',
  FUSE_ALL_EMPTY: 'FUSE_ALL_EMPTY',
  FILLET_NO_EDGES: 'FILLET_NO_EDGES',
  CHAMFER_NO_EDGES: 'CHAMFER_NO_EDGES',
  CHAMFER_ANGLE_NO_EDGES: 'CHAMFER_ANGLE_NO_EDGES',
  CHAMFER_ANGLE_BAD_DISTANCE: 'CHAMFER_ANGLE_BAD_DISTANCE',
  CHAMFER_ANGLE_BAD_ANGLE: 'CHAMFER_ANGLE_BAD_ANGLE',
  BEZIER_MIN_POINTS: 'BEZIER_MIN_POINTS',
  POLYGON_MIN_POINTS: 'POLYGON_MIN_POINTS',
  ZERO_LENGTH_EXTRUSION: 'ZERO_LENGTH_EXTRUSION',
  ZERO_TWIST_ANGLE: 'ZERO_TWIST_ANGLE',
  LOFT_EMPTY: 'LOFT_EMPTY',
  UNSUPPORTED_PROFILE: 'UNSUPPORTED_PROFILE',
  UNKNOWN_PLANE: 'UNKNOWN_PLANE',
  NULL_SHAPE_INPUT: 'NULL_SHAPE_INPUT',
  INVALID_FILLET_RADIUS: 'INVALID_FILLET_RADIUS',
  INVALID_CHAMFER_DISTANCE: 'INVALID_CHAMFER_DISTANCE',
  INVALID_THICKNESS: 'INVALID_THICKNESS',
  ZERO_OFFSET: 'ZERO_OFFSET',
  NO_EDGES: 'NO_EDGES',
  NO_FACES: 'NO_FACES',
  DRAFT_NO_FACES: 'DRAFT_NO_FACES',
  DRAFT_INVALID_ANGLE: 'DRAFT_INVALID_ANGLE',
  DRAFT_NOT_3D: 'DRAFT_NOT_3D',
  DRAFT_FAILED: 'DRAFT_FAILED',

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
  CHAMFER_ANGLE_NOT_3D: 'CHAMFER_ANGLE_NOT_3D',
  CHAMFER_ANGLE_FAILED: 'CHAMFER_ANGLE_FAILED',
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
  STEP_EXPORT_CONFIGURED_FAILED: 'STEP_EXPORT_CONFIGURED_FAILED',
  STEP_FILE_READ_ERROR: 'STEP_FILE_READ_ERROR',
  STL_EXPORT_FAILED: 'STL_EXPORT_FAILED',
  STL_FILE_READ_ERROR: 'STL_FILE_READ_ERROR',
  STEP_IMPORT_FAILED: 'STEP_IMPORT_FAILED',
  STL_IMPORT_FAILED: 'STL_IMPORT_FAILED',
  IGES_EXPORT_FAILED: 'IGES_EXPORT_FAILED',
  IGES_IMPORT_FAILED: 'IGES_IMPORT_FAILED',
  DXF_IMPORT_FAILED: 'DXF_IMPORT_FAILED',
  OBJ_IMPORT_FAILED: 'OBJ_IMPORT_FAILED',
  THREEMF_IMPORT_FAILED: 'THREEMF_IMPORT_FAILED',

  // Computation errors
  PARAMETER_NOT_FOUND: 'PARAMETER_NOT_FOUND',
  INTERSECTION_FAILED: 'INTERSECTION_FAILED',
  SELF_INTERSECTION_FAILED: 'SELF_INTERSECTION_FAILED',
  STRAIGHT_SKELETON_FAILED: 'STRAIGHT_SKELETON_FAILED',

  // Compound operation errors
  COMPOUND_NO_FACES: 'COMPOUND_NO_FACES',
  COMPOUND_FACE_NOT_FOUND: 'COMPOUND_FACE_NOT_FOUND',

  // Query errors
  FINDER_NOT_UNIQUE: 'FINDER_NOT_UNIQUE',

  // Hull errors
  HULL_EMPTY_INPUT: 'HULL_EMPTY_INPUT',
  HULL_FAILED: 'HULL_FAILED',
  HULL_DEGENERATE: 'HULL_DEGENERATE',
  HULL_NOT_3D: 'HULL_NOT_3D',

  // Minkowski errors
  MINKOWSKI_FAILED: 'MINKOWSKI_FAILED',
  MINKOWSKI_NULL_TOOL: 'MINKOWSKI_NULL_TOOL',
  MINKOWSKI_NOT_3D: 'MINKOWSKI_NOT_3D',

  // Polyhedron errors
  POLYHEDRON_INSUFFICIENT_POINTS: 'POLYHEDRON_INSUFFICIENT_POINTS',
  POLYHEDRON_INSUFFICIENT_FACES: 'POLYHEDRON_INSUFFICIENT_FACES',
  POLYHEDRON_INVALID_INDEX: 'POLYHEDRON_INVALID_INDEX',
  POLYHEDRON_FAILED: 'POLYHEDRON_FAILED',

  // General validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',

  // Roof errors
  ROOF_FAILED: 'ROOF_FAILED',

  // Multi-section sweep errors
  MULTI_SWEEP_INSUFFICIENT_SECTIONS: 'MULTI_SWEEP_INSUFFICIENT_SECTIONS',
  MULTI_SWEEP_FAILED: 'MULTI_SWEEP_FAILED',

  // Guide curve sweep errors
  GUIDED_SWEEP_FAILED: 'GUIDED_SWEEP_FAILED',

  // Surface errors
  SURFACE_GRID_TOO_SMALL: 'SURFACE_GRID_TOO_SMALL',
  SURFACE_GRID_JAGGED: 'SURFACE_GRID_JAGGED',
  SURFACE_FAILED: 'SURFACE_FAILED',

  // Assembly mate errors
  ASSEMBLY_MATE_INVALID: 'ASSEMBLY_MATE_INVALID',
  ASSEMBLY_SOLVE_FAILED: 'ASSEMBLY_SOLVE_FAILED',
  ASSEMBLY_NOT_CONVERGED: 'ASSEMBLY_NOT_CONVERGED',

  // Blueprint / CompoundBlueprint errors
  BLUEPRINT_EMPTY_CURVES: 'BLUEPRINT_EMPTY_CURVES',
  COMPOUND_BLUEPRINT_EMPTY: 'COMPOUND_BLUEPRINT_EMPTY',

  // GLB/glTF import errors
  GLB_IMPORT_FAILED: 'GLB_IMPORT_FAILED',

  // Font/text errors
  FONT_FETCH_FAILED: 'FONT_FETCH_FAILED',
  FONT_PARSE_FAILED: 'FONT_PARSE_FAILED',
  NO_FONT_LOADED: 'NO_FONT_LOADED',

  // Unsupported capability errors (ADR-0006 Phase 4)
  UNSUPPORTED_CAPABILITY: 'UNSUPPORTED_CAPABILITY',
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
 *
 * The optional `suggestion` field provides actionable recovery hints.
 */
export interface BrepError {
  readonly kind: BrepErrorKind;
  readonly code: string;
  readonly message: string;
  readonly suggestion?: string;
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
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  const base: BrepError = { kind, code, message, cause };
  if (suggestion) {
    const withSuggestion = { ...base, suggestion };
    if (metadata) return { ...withSuggestion, metadata };
    return withSuggestion;
  }
  if (metadata) return { ...base, metadata };
  return base;
}

/** Create an error for a failed kernel kernel operation. */
export function kernelError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('KERNEL_OPERATION', code, message, cause, metadata, suggestion);
}

/** Create an error for invalid input parameters. */
export function validationError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('VALIDATION', code, message, cause, metadata, suggestion);
}

/** Create an error for a failed shape type cast or conversion. */
export function typeCastError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('TYPE_CAST', code, message, cause, metadata, suggestion);
}

/** Create an error for an invalid sketcher state transition. */
export function sketcherStateError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('SKETCHER_STATE', code, message, cause, metadata, suggestion);
}

/** Create an error for a module initialisation failure. */
export function moduleInitError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('MODULE_INIT', code, message, cause, metadata, suggestion);
}

/** Create an error for a failed geometric computation. */
export function computationError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('COMPUTATION', code, message, cause, metadata, suggestion);
}

/** Create an error for a file import/export failure. */
export function ioError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('IO', code, message, cause, metadata, suggestion);
}

/** Create an error for a shape query failure (e.g. finder not unique). */
export function queryError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('QUERY', code, message, cause, metadata, suggestion);
}

/** Create an error for a capability not supported by the current kernel (ADR-0006 Phase 4). */
export function unsupportedError(
  code: string,
  message: string,
  cause?: unknown,
  metadata?: Record<string, unknown>,
  suggestion?: string
): BrepError {
  return makeError('UNSUPPORTED', code, message, cause, metadata, suggestion);
}

// Re-export translateKernelError for backward compatibility
export { translateKernelError } from './kernelErrorTranslation.js';

// ---------------------------------------------------------------------------
// Array safety helper
// ---------------------------------------------------------------------------

/**
 * Safe array index access that throws a descriptive {@link BrepBugError} instead
 * of returning `undefined` when the index is out of bounds.
 *
 * Use in place of `arr[i]!` when the caller can prove the index is valid by
 * construction but TypeScript's `noUncheckedIndexedAccess` still requires a guard.
 *
 * @param arr - The array to index into.
 * @param index - The index to access.
 * @param context - Optional caller context for the error message (e.g. function name).
 */
export function safeIndex<T>(arr: readonly T[], index: number, context?: string): T {
  if (index < 0 || index >= arr.length) {
    bug(context ?? 'safeIndex', `Index ${index} is out of bounds (array length ${arr.length})`);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds proven above
  return arr[index]!;
}
