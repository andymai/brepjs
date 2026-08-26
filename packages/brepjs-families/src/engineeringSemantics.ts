export type EngineeringProperty = string | number | boolean;

export type EngineeringProperties = Readonly<Record<string, EngineeringProperty>>;

export type SpatialComposition = 'collection' | 'element' | 'partial';

export type SpatialSubdivision = 'lateral' | 'longitudinal' | 'vertical' | 'regional';

interface CivilSemanticsBase<K extends string> {
  readonly kind: K;
  readonly category: string;
  readonly role: string;
  readonly properties?: EngineeringProperties | undefined;
}

export interface SiteEngineeringSemantics extends CivilSemanticsBase<'site'> {
  readonly composition: SpatialComposition;
}

export interface FacilityEngineeringSemantics extends CivilSemanticsBase<'facility'> {
  readonly composition: SpatialComposition;
}

export interface SpatialPartEngineeringSemantics extends CivilSemanticsBase<'spatial-part'> {
  readonly composition: SpatialComposition;
  readonly subdivision?: SpatialSubdivision | undefined;
}

export interface ProductEngineeringSemantics extends CivilSemanticsBase<'product'> {
  readonly material: string;
  readonly dimensionsMm: Readonly<Record<string, number>>;
}

export type CivilEngineeringSemantics =
  | SiteEngineeringSemantics
  | FacilityEngineeringSemantics
  | SpatialPartEngineeringSemantics
  | ProductEngineeringSemantics;

export type EngineeringSemantics = CivilEngineeringSemantics;

function invalid(path: string, expectation: string): never {
  throw new Error(
    `brepjs-families: invalid civil engineering semantics at '${path}': ${expectation}`
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(path, 'expected a non-empty string');
  }
}

export function validateCivilSemantics(
  value: unknown
): asserts value is CivilEngineeringSemantics {
  if (!isRecord(value)) invalid('semantics', 'expected an object');
  const kind = value['kind'];
  if (!['site', 'facility', 'spatial-part', 'product'].includes(String(kind))) {
    invalid('kind', 'expected site, facility, spatial-part, or product');
  }
  const allowedKeys = new Set(
    kind === 'product'
      ? ['kind', 'category', 'role', 'material', 'dimensionsMm', 'properties']
      : kind === 'spatial-part'
        ? ['kind', 'category', 'role', 'composition', 'subdivision', 'properties']
        : ['kind', 'category', 'role', 'composition', 'properties']
  );
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) invalid(key, `not applicable to civil kind '${String(kind)}'`);
  }
  requireNonEmptyString(value['category'], 'category');
  requireNonEmptyString(value['role'], 'role');

  const properties = value['properties'];
  if (properties !== undefined) {
    if (!isRecord(properties)) invalid('properties', 'expected an object');
    for (const [name, property] of Object.entries(properties)) {
      if (
        typeof property !== 'string' &&
        typeof property !== 'number' &&
        typeof property !== 'boolean'
      ) {
        invalid(`properties.${name}`, 'expected a string, number, or boolean');
      }
    }
  }

  if (kind !== 'product') {
    if (!['collection', 'element', 'partial'].includes(String(value['composition']))) {
      invalid('composition', 'expected collection, element, or partial');
    }
    if (
      kind === 'spatial-part' &&
      value['subdivision'] !== undefined &&
      (typeof value['subdivision'] !== 'string' ||
        !['lateral', 'longitudinal', 'vertical', 'regional'].includes(value['subdivision']))
    ) {
      invalid('subdivision', 'expected lateral, longitudinal, vertical, or regional');
    }
    return;
  }

  requireNonEmptyString(value['material'], 'material');
  const dimensions = value['dimensionsMm'];
  if (!isRecord(dimensions) || Object.keys(dimensions).length === 0) {
    invalid('dimensionsMm', 'expected at least one named millimetre dimension');
  }
  for (const [name, dimension] of Object.entries(dimensions)) {
    if (typeof dimension !== 'number' || !Number.isFinite(dimension) || dimension <= 0) {
      invalid(`dimensionsMm.${name}`, 'expected a finite positive millimetre value');
    }
  }
}

/** Retain target-independent civil meaning for a Family definition. */
export function civilSemantics<T extends CivilEngineeringSemantics>(semantics: T): T {
  validateCivilSemantics(semantics);
  return semantics;
}
