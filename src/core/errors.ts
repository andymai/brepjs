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
