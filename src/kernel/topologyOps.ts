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

/**
 * Iterates shapes using C++ bulk extraction.
 */
export function iterShapesBulk(
  oc: OpenCascadeInstance,
  shape: OcShape,
  type: ShapeType
): OcShape[] {
  const typeEnumMap: Record<ShapeType, number> = {
    vertex: 7,
    edge: 6,
    wire: 5,
    face: 4,
    shell: 3,
    solid: 2,
    compsolid: 1,
    compound: 0,
  };

  const raw = oc.TopologyExtractor.extract(shape, typeEnumMap[type]);
  const count = raw.getShapesCount() as number;
  const result: OcShape[] = [];
  for (let i = 0; i < count; i++) {
    result.push(raw.getShape(i));
  }
  raw.delete();
  return result;
}

/**
 * Iterates shapes using JS-side TopExp_Explorer.
 */
export function iterShapesJS(oc: OpenCascadeInstance, shape: OcShape, type: ShapeType): OcShape[] {
  const typeMap: Record<ShapeType, unknown> = {
    vertex: oc.TopAbs_ShapeEnum.TopAbs_VERTEX,
    edge: oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    wire: oc.TopAbs_ShapeEnum.TopAbs_WIRE,
    face: oc.TopAbs_ShapeEnum.TopAbs_FACE,
    shell: oc.TopAbs_ShapeEnum.TopAbs_SHELL,
    solid: oc.TopAbs_ShapeEnum.TopAbs_SOLID,
    compsolid: oc.TopAbs_ShapeEnum.TopAbs_COMPSOLID,
    compound: oc.TopAbs_ShapeEnum.TopAbs_COMPOUND,
  };

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
  if (!result) throw new Error(`Unknown shape type enum value: ${shape.ShapeType()}`);
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
