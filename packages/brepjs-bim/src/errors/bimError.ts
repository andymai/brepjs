import type { BrepError } from 'brepjs';

export type BimErrorKind = 'BIM_SPEC' | 'BIM_IFC' | 'BIM_GEOMETRY' | 'BIM_IMPORT' | 'BIM_BCF' | 'BIM_IDS';

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

/**
 * BCF (BIM Collaboration Format) error factory. Codes used by the BCF subsystem:
 * - `BCF_PARSE_FAILED` — an XML file could not be parsed into the BCF data model
 * - `BCF_VERSION_UNSUPPORTED` — `bcf.version` declares a version other than 3.0
 * - `BCF_MISSING_FILE` — a required container file (`bcf.version`, `project.bcfp`) is absent
 */
export function bcfError(code: string, message: string, cause?: unknown): BimError {
  return { kind: 'BIM_BCF', code, message, cause };
}

/**
 * IDS (Information Delivery Specification) error factory. Codes used by the IDS
 * subsystem:
 * - `IDS_PARSE_FAILED` — the IDS XML could not be parsed into a document tree
 * - `IDS_INVALID_SCHEMA` — the root element is not `<ids>` or has no specifications
 * - `IDS_UNSUPPORTED_VERSION` — the document declares an IDS version this subset rejects
 */
export function idsError(code: string, message: string, cause?: unknown): BimError {
  return { kind: 'BIM_IDS', code, message, cause };
}

export function fromBrepError(inner: BrepError, code: string, message: string): BimError {
  return { kind: 'BIM_GEOMETRY', code, message, cause: inner };
}
