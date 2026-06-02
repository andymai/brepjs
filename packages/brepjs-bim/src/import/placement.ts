import * as WebIFC from 'web-ifc';
import type { SpfReader } from './spfReader.js';

/**
 * Column-major 4x4 transform, matching the layout web-ifc and OCCT use:
 * column c, row r lives at index c*4 + r. Columns 0-2 are the basis vectors
 * (axisX, axisY, axisZ); column 3 is the translation; the bottom row is
 * [0,0,0,1].
 */
export type Mat4x4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type Vec3 = readonly [number, number, number];

/** A placement decomposed into origin + the two stored IFC axes (Z, X). */
export interface WorldPlacement {
  /** Translation in millimetres (file units scaled to mm). */
  readonly origin: Vec3;
  /** Local X direction in world space (IFC RefDirection), unit length. */
  readonly axisX: Vec3;
  /** Local Z direction in world space (IFC Axis), unit length. */
  readonly axisZ: Vec3;
}

/** Georeferencing offset recovered from IfcMapConversion, in millimetres. */
export interface Georef {
  readonly eastings: number;
  readonly northings: number;
  readonly orthogonalHeight: number;
  /** Rotation of true north relative to model +X, in radians. */
  readonly rotation: number;
}

/**
 * Metres-per-file-unit length scale read from the IfcUnitAssignment's
 * LENGTHUNIT. Multiply a file-unit length by this to get metres, then by 1000
 * for brepjs millimetres. Returns 1.0 (assume metres) when no length unit is
 * declared.
 */
export function readLengthScale(reader: SpfReader): number {
  const assignments = reader.getLinesOfType(WebIFC.IFCUNITASSIGNMENT);
  for (const assignmentId of assignments) {
    const assignment = reader.getLine<Record<string, unknown>>(assignmentId);
    const units = asRefArray(assignment?.['Units']);
    for (const unitId of units) {
      const scale = lengthScaleFromUnit(reader, unitId);
      if (scale !== null) return scale;
    }
  }
  return 1.0;
}

/**
 * Radians-per-file-unit plane-angle scale read from the IfcUnitAssignment's
 * PLANEANGLEUNIT (1 for RADIAN, ~0.0174533 for DEGREE). Defaults to 1 (the IFC
 * default plane-angle unit is the radian).
 */
export function readPlaneAngleScale(reader: SpfReader): number {
  for (const assignmentId of reader.getLinesOfType(WebIFC.IFCUNITASSIGNMENT)) {
    const assignment = reader.getLine<Record<string, unknown>>(assignmentId);
    const units = asRefArray(assignment?.['Units']);
    for (const unitId of units) {
      const s = planeAngleScaleFromUnit(reader, unitId);
      if (s !== null) return s;
    }
  }
  return 1.0;
}

function planeAngleScaleFromUnit(reader: SpfReader, unitId: number): number | null {
  const unit = reader.getLine<Record<string, unknown>>(unitId);
  if (unit === null) return null;
  const type = reader.getLineType(unitId);
  if (type === WebIFC.IFCSIUNIT) {
    if (enumValue(unit['UnitType']) !== 'PLANEANGLEUNIT') return null;
    if (enumValue(unit['Name']) !== 'RADIAN') return null;
    return 1.0;
  }
  if (type === WebIFC.IFCCONVERSIONBASEDUNIT) {
    if (enumValue(unit['UnitType']) !== 'PLANEANGLEUNIT') return null;
    const measureId = refValue(unit['ConversionFactor']);
    if (measureId === null) return null;
    const measure = reader.getLine<Record<string, unknown>>(measureId);
    const factor = numericValue(measure?.['ValueComponent']);
    if (factor === null) return null;
    return factor;
  }
  return null;
}

function lengthScaleFromUnit(reader: SpfReader, unitId: number): number | null {
  const unit = reader.getLine<Record<string, unknown>>(unitId);
  if (unit === null) return null;
  const type = reader.getLineType(unitId);

  if (type === WebIFC.IFCSIUNIT) {
    if (enumValue(unit['UnitType']) !== 'LENGTHUNIT') return null;
    // Base SI length is the metre; SQUARE/CUBIC names are area/volume units.
    if (enumValue(unit['Name']) !== 'METRE') return null;
    return siPrefixFactor(enumValue(unit['Prefix']));
  }

  if (type === WebIFC.IFCCONVERSIONBASEDUNIT) {
    if (enumValue(unit['UnitType']) !== 'LENGTHUNIT') return null;
    const measureId = refValue(unit['ConversionFactor']);
    if (measureId === null) return null;
    const measure = reader.getLine<Record<string, unknown>>(measureId);
    const factor = numericValue(measure?.['ValueComponent']);
    if (factor === null) return null;
    // ConversionFactor is "value of the named unit expressed in the base SI
    // unit"; e.g. INCH → 0.0254 m. The base unit may itself be prefixed.
    const baseId = refValue(measure?.['UnitComponent']);
    const baseFactor = baseId !== null ? (lengthScaleFromUnit(reader, baseId) ?? 1.0) : 1.0;
    return factor * baseFactor;
  }

  return null;
}

// SI prefix multipliers relative to the metre. Only the prefixes that appear on
// length units in practice are enumerated; an unknown prefix falls back to 1.0.
function siPrefixFactor(prefix: string | null): number {
  switch (prefix) {
    case null:
      return 1.0;
    case 'KILO':
      return 1000.0;
    case 'HECTO':
      return 100.0;
    case 'DECA':
      return 10.0;
    case 'DECI':
      return 0.1;
    case 'CENTI':
      return 0.01;
    case 'MILLI':
      return 0.001;
    case 'MICRO':
      return 1e-6;
    default:
      return 1.0;
  }
}

/**
 * Composes the full IfcLocalPlacement chain rooted at `placementExpressId` into
 * a column-major world matrix, scaling translations to millimetres via `scale`
 * (metres-per-file-unit). Returns null if the placement cannot be resolved.
 *
 * Walks `PlacementRelTo` recursively and pre-multiplies each parent transform,
 * mirroring how the writer nests element → storey → building → site → project.
 * This is independent of the geometry engine, so it is unaffected by the
 * COORDINATE_TO_ORIGIN recenter flag.
 */
export function composeWorldMatrix(
  reader: SpfReader,
  placementExpressId: number,
  scale: number,
): Mat4x4 | null {
  return composeLocalPlacement(reader, placementExpressId, scale, new Set());
}

function composeLocalPlacement(
  reader: SpfReader,
  placementExpressId: number,
  scale: number,
  seen: Set<number>,
): Mat4x4 | null {
  if (seen.has(placementExpressId)) return null; // guard against malformed cycles
  seen.add(placementExpressId);

  const placement = reader.getLine<Record<string, unknown>>(placementExpressId);
  if (placement === null) return null;

  const relativeId = refValue(placement['RelativePlacement']);
  if (relativeId === null) return null;
  const relative = readAxis2Placement3D(reader, relativeId, scale);
  if (relative === null) return null;

  const parentId = refValue(placement['PlacementRelTo']);
  if (parentId === null) return relative;

  const parent = composeLocalPlacement(reader, parentId, scale, seen);
  if (parent === null) return relative;
  return multiply(parent, relative);
}

/**
 * Composes the placement chain and returns it decomposed into origin + axes,
 * the form spec reconstruction consumes. Returns null on failure.
 */
export function composeWorldPlacement(
  reader: SpfReader,
  placementExpressId: number,
  scale: number,
): WorldPlacement | null {
  const matrix = composeWorldMatrix(reader, placementExpressId, scale);
  if (matrix === null) return null;
  return decomposePlacement(matrix);
}

/**
 * Reads a single IfcAxis2Placement3D into a column-major matrix. Location is
 * scaled to mm; Axis (local Z) and RefDirection (local X) default to +Z/+X and
 * are orthonormalised (local Y = Z × X, local X = Y × Z) so the basis is
 * always a proper rotation.
 */
export function readAxis2Placement3D(
  reader: SpfReader,
  placementExpressId: number,
  scale: number,
): Mat4x4 | null {
  const placement = reader.getLine<Record<string, unknown>>(placementExpressId);
  if (placement === null) return null;

  const locationId = refValue(placement['Location']);
  const location =
    locationId !== null ? readCartesianPoint(reader, locationId) : [0, 0, 0];
  const originMm: Vec3 = [
    (location[0] ?? 0) * scale * 1000,
    (location[1] ?? 0) * scale * 1000,
    (location[2] ?? 0) * scale * 1000,
  ];

  const axisId = refValue(placement['Axis']);
  const refDirId = refValue(placement['RefDirection']);
  const axisZraw: Vec3 =
    axisId !== null ? readDirection(reader, axisId) ?? [0, 0, 1] : [0, 0, 1];
  const refXraw: Vec3 =
    refDirId !== null ? readDirection(reader, refDirId) ?? [1, 0, 0] : [1, 0, 0];

  const z = normalize(axisZraw);
  // Project RefDirection onto the plane perpendicular to Z, per IFC axis rules.
  const dot = z[0] * refXraw[0] + z[1] * refXraw[1] + z[2] * refXraw[2];
  const projX: Vec3 = [
    refXraw[0] - dot * z[0],
    refXraw[1] - dot * z[1],
    refXraw[2] - dot * z[2],
  ];
  // Test the projected (un-normalized) vector: normalize() returns a safe unit
  // fallback for near-zero input, so checking it post-normalize would never fire
  // and would leave x parallel to z (making y = cross(z, x) the zero vector).
  const x = lengthSq(projX) < 1e-12 ? normalize(orthogonal(z)) : normalize(projX);
  const y = cross(z, x);

  return [
    x[0], x[1], x[2], 0,
    y[0], y[1], y[2], 0,
    z[0], z[1], z[2], 0,
    originMm[0], originMm[1], originMm[2], 1,
  ];
}

/** Decomposes a column-major matrix into origin (mm) + IFC axes (Z, X). */
export function decomposePlacement(m: Mat4x4): WorldPlacement {
  return {
    axisX: normalize([m[0], m[1], m[2]]),
    axisZ: normalize([m[8], m[9], m[10]]),
    origin: [m[12], m[13], m[14]],
  };
}

export function identityMatrix(): Mat4x4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * Reads the IfcMapConversion georeferencing offset (Eastings/Northings/
 * OrthogonalHeight, scaled to mm) and true-north rotation. Returns null when
 * the model carries no IfcMapConversion. Use this to recenter far-from-origin
 * coordinates: subtract the offset to bring geometry near the origin.
 */
export function readGeoref(reader: SpfReader, scale: number): Georef | null {
  const conversions = reader.getLinesOfType(WebIFC.IFCMAPCONVERSION);
  const conversionId = conversions[0];
  if (conversionId === undefined) return null;
  const conv = reader.getLine<Record<string, unknown>>(conversionId);
  if (conv === null) return null;

  const eastings = (numericValue(conv['Eastings']) ?? 0) * scale * 1000;
  const northings = (numericValue(conv['Northings']) ?? 0) * scale * 1000;
  const orthogonalHeight = (numericValue(conv['OrthogonalHeight']) ?? 0) * scale * 1000;
  const abscissa = numericValue(conv['XAxisAbscissa']);
  const ordinate = numericValue(conv['XAxisOrdinate']);
  const rotation =
    abscissa !== null && ordinate !== null ? Math.atan2(ordinate, abscissa) : 0;

  return { eastings, northings, orthogonalHeight, rotation };
}

// --- matrix / vector helpers ------------------------------------------------

// Column-major 4x4 multiply: result = a * b (apply b first, then a).
function multiply(a: Mat4x4, b: Mat4x4): Mat4x4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += (a[k * 4 + row] ?? 0) * (b[col * 4 + k] ?? 0);
      }
      out[col * 4 + row] = sum;
    }
  }
  return [
    out[0] ?? 0, out[1] ?? 0, out[2] ?? 0, out[3] ?? 0,
    out[4] ?? 0, out[5] ?? 0, out[6] ?? 0, out[7] ?? 0,
    out[8] ?? 0, out[9] ?? 0, out[10] ?? 0, out[11] ?? 0,
    out[12] ?? 0, out[13] ?? 0, out[14] ?? 0, out[15] ?? 0,
  ];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function lengthSq(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(lengthSq(v));
  // Degenerate/near-zero direction: fall back to a canonical unit vector (+Z)
  // rather than returning the non-unit near-zero vector, which would corrupt
  // downstream placement axes.
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// Returns an arbitrary unit vector orthogonal to v (v assumed non-zero).
function orthogonal(v: Vec3): Vec3 {
  return Math.abs(v[0]) < 0.9 ? cross(v, [1, 0, 0]) : cross(v, [0, 1, 0]);
}

// --- line-value extraction helpers ------------------------------------------

function readCartesianPoint(reader: SpfReader, expressId: number): number[] {
  const point = reader.getLine<Record<string, unknown>>(expressId);
  const coords = point?.['Coordinates'];
  if (!Array.isArray(coords)) return [0, 0, 0];
  return coords.map((c) => numericValue(c) ?? 0);
}

function readDirection(reader: SpfReader, expressId: number): Vec3 | null {
  const dir = reader.getLine<Record<string, unknown>>(expressId);
  const ratios = dir?.['DirectionRatios'];
  if (!Array.isArray(ratios)) return null;
  return [
    numericValue(ratios[0]) ?? 0,
    numericValue(ratios[1]) ?? 0,
    numericValue(ratios[2]) ?? 0,
  ];
}

// web-ifc references appear as `{ type, value: expressId }`; extract the id.
function refValue(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const value = (v as { value?: unknown }).value;
  return typeof value === 'number' ? value : null;
}

function asRefArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) {
    const id = refValue(item);
    if (id !== null) out.push(id);
  }
  return out;
}

// Typed scalar wrappers appear as `{ type, value }`; bare numbers pass through.
function numericValue(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return null;
  const value = (v as { value?: unknown }).value;
  return typeof value === 'number' ? value : null;
}

// Enum wrappers appear as `{ type: 3, value: 'LITERAL' }`; bare strings pass
// through. Returns null for absent enums (e.g. a null SI Prefix).
function enumValue(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return null;
  const value = (v as { value?: unknown }).value;
  return typeof value === 'string' ? value : null;
}
