import type { BrepError } from 'brepjs';

export type BimErrorKind = 'BIM_SPEC' | 'BIM_IFC' | 'BIM_GEOMETRY';

export interface BimError {
  readonly kind: BimErrorKind;
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function specError(code: string, message: string, cause?: unknown): BimError {
  return { kind: 'BIM_SPEC', code, message, cause };
}

export function ifcError(code: string, message: string, cause?: unknown): BimError {
  return { kind: 'BIM_IFC', code, message, cause };
}

export function geometryError(code: string, message: string, cause?: unknown): BimError {
  return { kind: 'BIM_GEOMETRY', code, message, cause };
}

export function fromBrepError(inner: BrepError, code: string, message: string): BimError {
  return { kind: 'BIM_GEOMETRY', code, message, cause: inner };
}
