import type { BrepError } from 'brepjs';

export type BimErrorKind = 'BIM_SPEC' | 'BIM_IFC' | 'BIM_GEOMETRY' | 'BIM_IMPORT';

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

/**
 * IFC-import error factory. Codes used by the reader subsystem:
 * - `OPEN_MODEL_FAILED` — web-ifc returned an invalid model id on OpenModel
 * - `SCHEMA_UNSUPPORTED` — schema string not in `['IFC2X3', 'IFC4', 'IFC4X3']`
 * - `UNSUPPORTED_PROFILE` — profile entity type not in the supported set
 * - `GEOMETRY_RECONSTRUCTION_FAILED` — parametric reconstruction threw
 * - `TESSELLATION_NOT_MANIFOLD` — STL round-trip did not produce a closed solid
 * - `PLACEMENT_READ_FAILED` — placement chain produced a degenerate matrix
 * - `UNIT_ASSIGNMENT_MISSING` — no IfcUnitAssignment found (assume metres, warn)
 */
export function importError(code: string, message: string, cause?: unknown): BimError {
  return { kind: 'BIM_IMPORT', code, message, cause };
}

export function fromBrepError(inner: BrepError, code: string, message: string): BimError {
  return { kind: 'BIM_GEOMETRY', code, message, cause: inner };
}
