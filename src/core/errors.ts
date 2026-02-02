/**
 * Domain error types and constructors for brepjs.
 * Zero internal imports — this is a pure foundation module.
 */

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
// Bug / panic helper — these are NOT Results, they throw
// ---------------------------------------------------------------------------

export class BrepBugError extends Error {
  readonly location: string;

  constructor(location: string, message: string) {
    super(`Bug in ${location}: ${message}`);
    this.name = 'BrepBugError';
    this.location = location;
  }
}

/**
 * Throws a BrepBugError for invariant violations / programmer errors.
 * Equivalent to Rust's panic!() — should never be caught in normal code.
 */
export function bug(location: string, message: string): never {
  throw new BrepBugError(location, message);
}
