/**
 * Domain error types and constructors for brepjs.
 * Re-exports bug/BrepBugError from utils (Layer 0) for convenience.
 */

export { bug, BrepBugError } from '../utils/bug.js';

// ---------------------------------------------------------------------------
// Error kinds
// ---------------------------------------------------------------------------

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

  // Computation errors
  PARAMETER_NOT_FOUND: 'PARAMETER_NOT_FOUND',
  INTERSECTION_FAILED: 'INTERSECTION_FAILED',
  SELF_INTERSECTION_FAILED: 'SELF_INTERSECTION_FAILED',
} as const;

export type BrepErrorCode = (typeof BrepErrorCode)[keyof typeof BrepErrorCode];

// ---------------------------------------------------------------------------
// Error interface
// ---------------------------------------------------------------------------

export interface BrepError {
  readonly kind: BrepErrorKind;
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
}

// ---------------------------------------------------------------------------
// Constructors per kind
// ---------------------------------------------------------------------------

export function occtError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'OCCT_OPERATION', code, message, cause };
}

export function validationError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'VALIDATION', code, message, cause };
}

export function typeCastError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'TYPE_CAST', code, message, cause };
}

export function sketcherStateError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'SKETCHER_STATE', code, message, cause };
}

export function moduleInitError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'MODULE_INIT', code, message, cause };
}

export function computationError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'COMPUTATION', code, message, cause };
}

export function ioError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'IO', code, message, cause };
}

export function queryError(code: string, message: string, cause?: unknown): BrepError {
  return { kind: 'QUERY', code, message, cause };
}

// ---------------------------------------------------------------------------
// Bug / panic helper — re-exported from utils/bug.ts (Layer 0)
// ---------------------------------------------------------------------------
