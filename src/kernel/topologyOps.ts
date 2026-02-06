/**
 * Topology iteration operations for OCCT shapes.
 *
 * Provides shape iteration, type detection, and comparison operations.
 * Has dual implementations: C++ TopologyExtractor when available, JS TopExp_Explorer fallback.
 *
 * Used by OCCTAdapter - re-exported for backward compatibility.
 */

import type { OpenCascadeInstance, OcShape, ShapeType } from './types.js';
import { HASH_CODE_MAX } from './measureOps.js';

// Static type enum map for bulk extraction (TopologyExtractor uses integer types)
const BULK_TYPE_ENUM_MAP: Record<ShapeType, number> = {
  vertex: 7,
  edge: 6,
  wire: 5,
  face: 4,
  shell: 3,
  solid: 2,
  compsolid: 1,
  compound: 0,
};

/**
 * Iterates shapes using C++ bulk extraction.
 */
export function iterShapesBulk(
  oc: OpenCascadeInstance,
  shape: OcShape,
  type: ShapeType
): OcShape[] {
  const raw = oc.TopologyExtractor.extract(shape, BULK_TYPE_ENUM_MAP[type]);
  const count = raw.getShapesCount() as number;
  const result: OcShape[] = [];
  for (let i = 0; i < count; i++) {
    result.push(raw.getShape(i));
  }
  raw.delete();
  return result;
}

// Cached type enum maps for JS-side iteration, keyed by OC instance
const jsTypeEnumMaps = new WeakMap<OpenCascadeInstance, Record<ShapeType, unknown>>();

/**
 * Iterates shapes using JS-side TopExp_Explorer.
 */
export function iterShapesJS(oc: OpenCascadeInstance, shape: OcShape, type: ShapeType): OcShape[] {
  // Get or create cached type enum map for this OC instance
  let typeMap = jsTypeEnumMaps.get(oc);
  if (!typeMap) {
    const ta = oc.TopAbs_ShapeEnum;
    typeMap = {
      vertex: ta.TopAbs_VERTEX,
      edge: ta.TopAbs_EDGE,
      wire: ta.TopAbs_WIRE,
      face: ta.TopAbs_FACE,
      shell: ta.TopAbs_SHELL,
      solid: ta.TopAbs_SOLID,
      compsolid: ta.TopAbs_COMPSOLID,
      compound: ta.TopAbs_COMPOUND,
    };
    jsTypeEnumMaps.set(oc, typeMap);
  }
  const explorer = new oc.TopExp_Explorer_2(shape, typeMap[type], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);

  const result: OcShape[] = [];
  const seen = new Map<number, OcShape[]>();
  while (explorer.More()) {
    const item = explorer.Current();
    const hash = item.HashCode(HASH_CODE_MAX);
    const bucket = seen.get(hash);
    if (!bucket) {
      seen.set(hash, [item]);
      result.push(item);
    } else if (!bucket.some((s) => s.IsSame(item))) {
      bucket.push(item);
      result.push(item);
    }
    explorer.Next();
  }
  explorer.delete();
  return result;
}

/**
 * Iterates sub-shapes of a given type, using C++ bulk extraction when available.
 */
export function iterShapes(oc: OpenCascadeInstance, shape: OcShape, type: ShapeType): OcShape[] {
  if (oc.TopologyExtractor) {
    return iterShapesBulk(oc, shape, type);
  }
  return iterShapesJS(oc, shape, type);
}

// Cached shape type map per OC instance
const shapeTypeMaps = new WeakMap<OpenCascadeInstance, Map<unknown, ShapeType>>();

/**
 * Gets or creates the shape type enum-to-string map for an OC instance.
 */
function getShapeTypeMap(oc: OpenCascadeInstance): Map<unknown, ShapeType> {
  let map = shapeTypeMaps.get(oc);
  if (!map) {
    const ta = oc.TopAbs_ShapeEnum;
    map = new Map<unknown, ShapeType>([
      [ta.TopAbs_VERTEX, 'vertex'],
      [ta.TopAbs_EDGE, 'edge'],
      [ta.TopAbs_WIRE, 'wire'],
      [ta.TopAbs_FACE, 'face'],
      [ta.TopAbs_SHELL, 'shell'],
      [ta.TopAbs_SOLID, 'solid'],
      [ta.TopAbs_COMPSOLID, 'compsolid'],
      [ta.TopAbs_COMPOUND, 'compound'],
    ]);
    shapeTypeMaps.set(oc, map);
  }
  return map;
}

/**
 * Returns the shape type string for a given shape.
 */
export function shapeType(oc: OpenCascadeInstance, shape: OcShape): ShapeType {
  if (shape.IsNull()) throw new Error('Cannot determine shape type: shape is null');
  const result = getShapeTypeMap(oc).get(shape.ShapeType());
  if (!result) throw new Error('Unknown shape type enum value');
  return result;
}

/**
 * Checks if a shape is valid according to OCCT geometry and topology checks.
 */
export function isValid(oc: OpenCascadeInstance, shape: OcShape): boolean {
  const analyzer = new oc.BRepCheck_Analyzer(shape, true, false);
  const valid = analyzer.IsValid_2();
  analyzer.delete();
  return valid;
}

/**
 * Sews shapes together using BRepBuilderAPI_Sewing.
 */
export function sew(oc: OpenCascadeInstance, shapes: OcShape[], tolerance = 1e-6): OcShape {
  const builder = new oc.BRepBuilderAPI_Sewing(tolerance, true, true, true, false);
  for (const shape of shapes) {
    builder.Add(shape);
  }
  const progress = new oc.Message_ProgressRange_1();
  builder.Perform(progress);
  const result = builder.SewedShape();
  progress.delete();
  builder.delete();
  return result;
}

/**
 * Checks if two shapes are the same (same TShape, location, and orientation).
 */
export function isSame(a: OcShape, b: OcShape): boolean {
  return a.IsSame(b);
}

/**
 * Checks if two shapes are equal (IsEqual).
 */
export function isEqual(a: OcShape, b: OcShape): boolean {
  return a.IsEqual(b);
}
