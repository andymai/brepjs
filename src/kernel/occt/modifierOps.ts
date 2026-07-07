/**
 * Shape modification operations for OCCT.
 *
 * Provides fillet, chamfer, shell, and offset operations
 * for modifying existing 3D shapes.
 *
 * Used by DefaultAdapter.
 */

import type { KernelInstance, KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import { perfTimer } from '../perfStats.js';

export type FilletRadiusSpec =
  number | [number, number] | ((edge: KernelShape) => number | [number, number]);

/**
 * Applies a fillet (rounded edge) to selected edges of a shape.
 * Supports constant radius, variable radius [r1, r2], and per-edge callbacks.
 */
export function fillet(
  oc: KernelInstance,
  shape: KernelShape,
  edges: KernelShape[],
  radius: FilletRadiusSpec
): KernelShape {
  const end = perfTimer('fillet');
  try {
    const builder = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
    for (const edge of edges) {
      const r = typeof radius === 'function' ? radius(edge) : radius;
      const downcast = oc.TopoDS_Cast.Edge(edge);
      if (typeof r === 'number') {
        if (r > 0) builder.Add_2(r, downcast);
      } else {
        const [r1, r2] = r;
        if (r1 > 0 && r2 > 0) builder.Add_3(r1, r2, downcast);
      }
    }
    const result = builder.Shape();
    builder.delete();
    return result;
  } finally {
    end();
  }
}

export type ChamferDistSpec =
  number | [number, number] | ((edge: KernelShape) => number | [number, number]);

/**
 * Applies a chamfer (beveled edge) to selected edges of a shape.
 * Supports symmetric distance, asymmetric `[d1, d2]`, and per-edge callbacks.
 */
export function chamfer(
  oc: KernelInstance,
  shape: KernelShape,
  edges: KernelShape[],
  distance: ChamferDistSpec
): KernelShape {
  const builder = new oc.BRepFilletAPI_MakeChamfer(shape);

  // Build edge→face map lazily (O(faces×edges_per_face) once, then O(1) per lookup)
  let edgeFaceMap: Map<number, KernelShape> | null = null;
  function getEdgeFaceMap(): Map<number, KernelShape> {
    if (edgeFaceMap) return edgeFaceMap;
    edgeFaceMap = new Map();
    const faceExp = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    while (faceExp.More()) {
      const face = oc.TopoDS_Cast.Face(faceExp.Current());
      const edgeExp = new oc.TopExp_Explorer_2(
        face,
        oc.TopAbs_ShapeEnum.TopAbs_EDGE,
        oc.TopAbs_ShapeEnum.TopAbs_SHAPE
      );
      while (edgeExp.More()) {
        const hash = oc.shapeHashCode(edgeExp.Current(), 2147483647);
        if (!edgeFaceMap.has(hash)) {
          edgeFaceMap.set(hash, face);
        }
        edgeExp.Next();
      }
      edgeExp.delete();
      faceExp.Next();
    }
    faceExp.delete();
    return edgeFaceMap;
  }

  function findContainingFace(edge: KernelShape): KernelShape | null {
    return getEdgeFaceMap().get(oc.shapeHashCode(edge, 2147483647)) ?? null;
  }

  for (const edge of edges) {
    const d = typeof distance === 'function' ? distance(edge) : distance;
    const downcast = oc.TopoDS_Cast.Edge(edge);
    if (typeof d === 'number') {
      if (d > 0) builder.Add_2(d, downcast);
    } else {
      const [d1, d2] = d;
      if (d1 > 0 && d2 > 0) {
        const face = findContainingFace(edge);
        if (face) {
          builder.Add_3(d1, d2, downcast, face);
        }
      }
    }
  }

  const result = builder.Shape();
  builder.delete();
  return result;
}

/**
 * Creates a shell (hollow shape) by removing faces and offsetting the remaining walls.
 */
export function shell(
  oc: KernelInstance,
  shape: KernelShape,
  faces: KernelShape[],
  thickness: number,
  tolerance = 1e-3
): KernelShape {
  const end = perfTimer('shell');
  try {
    const facesToRemove = new oc.TopTools_ListOfShape_1();
    for (const face of faces) {
      facesToRemove.Append_1(face);
    }
    const progress = new oc.Message_ProgressRange_1();
    const builder = new oc.BRepOffsetAPI_MakeThickSolid();
    builder.MakeThickSolidByJoin(
      shape,
      facesToRemove,
      -thickness,
      tolerance,
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress
    );
    const result = builder.Shape();
    builder.delete();
    facesToRemove.delete();
    progress.delete();
    return result;
  } finally {
    end();
  }
}

/**
 * Thickens a surface (face/shell) into a solid by offsetting it.
 * Uses the simple offset approach (BRepOffsetAPI_MakeThickSolid.MakeThickSolidBySimple).
 */
export function thicken(oc: KernelInstance, shape: KernelShape, thickness: number): KernelShape {
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  builder.MakeThickSolidBySimple(shape, thickness);
  const progress = new oc.Message_ProgressRange_1();
  builder.Build(progress);
  const result = builder.Shape();
  builder.delete();
  progress.delete();
  return result;
}

/**
 * Applies a chamfer with distance + angle to selected edges of a shape.
 *
 * Each edge requires a face that contains it, so the shape's faces are iterated
 * to find a containing face for each edge.
 */
export function chamferDistAngle(
  oc: KernelInstance,
  shape: KernelShape,
  edges: KernelShape[],
  distance: number,
  angleDeg: number
): KernelShape {
  const builder = new oc.BRepFilletAPI_MakeChamfer(shape);
  const angleRad = (angleDeg * Math.PI) / 180;

  // Build edge→face map once (O(faces×edges_per_face)), then O(1) per lookup
  const edgeFaceMap = new Map<number, KernelShape>();
  const faceExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  while (faceExplorer.More()) {
    const face = oc.TopoDS_Cast.Face(faceExplorer.Current());
    const edgeExp = new oc.TopExp_Explorer_2(
      face,
      oc.TopAbs_ShapeEnum.TopAbs_EDGE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    while (edgeExp.More()) {
      const hash = oc.shapeHashCode(edgeExp.Current(), 2147483647);
      if (!edgeFaceMap.has(hash)) {
        edgeFaceMap.set(hash, face);
      }
      edgeExp.Next();
    }
    edgeExp.delete();
    faceExplorer.Next();
  }
  faceExplorer.delete();

  for (const edge of edges) {
    const containingFace = edgeFaceMap.get(oc.shapeHashCode(edge, 2147483647)) ?? null;
    if (containingFace && distance > 0) {
      builder.AddDA(distance, angleRad, oc.TopoDS_Cast.Edge(edge), containingFace);
    }
  }

  const result = builder.Shape();
  builder.delete();
  return result;
}

/**
 * Offsets a 2D wire by the given distance.
 * joinType: a string ('arc', 'intersection', 'tangent') or raw OCCT enum value.
 */
export function offsetWire2D(
  oc: KernelInstance,
  wire: KernelShape,
  offsetVal: number,
  joinType?: number | 'arc' | 'intersection' | 'tangent'
): KernelShape {
  let jt: number;
  if (typeof joinType === 'string') {
    const map: Record<string, number> = {
      arc: oc.GeomAbs_JoinType.GeomAbs_Arc,
      intersection: oc.GeomAbs_JoinType.GeomAbs_Intersection,
      tangent: oc.GeomAbs_JoinType.GeomAbs_Tangent,
    };
    jt = map[joinType] ?? oc.GeomAbs_JoinType.GeomAbs_Arc;
  } else {
    jt = joinType ?? oc.GeomAbs_JoinType.GeomAbs_Arc;
  }
  const offsetter = new oc.BRepOffsetAPI_MakeOffset_3(wire, jt, false);
  offsetter.Perform(offsetVal, 0);
  const result = offsetter.Shape();
  offsetter.delete();
  return result;
}

/**
 * Offsets all faces of a shape by a given distance.
 */
export function offset(
  oc: KernelInstance,
  shape: KernelShape,
  distance: number,
  tolerance = 1e-6
): KernelShape {
  const progress = new oc.Message_ProgressRange_1();
  const builder = new oc.BRepOffsetAPI_MakeOffsetShape();
  builder.PerformByJoin(
    shape,
    distance,
    tolerance,
    oc.BRepOffset_Mode.BRepOffset_Skin,
    false,
    false,
    oc.GeomAbs_JoinType.GeomAbs_Arc,
    false,
    progress
  );
  const result = builder.Shape();
  builder.delete();
  progress.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Batch operations — C++ detection + JS fallback
// ---------------------------------------------------------------------------

let hasCppShellBatch: boolean | undefined;
let hasCppFilletBatch: boolean | undefined;

export function resetShellBatchDetectionCache(): void {
  hasCppShellBatch = undefined;
}

export function resetFilletBatchDetectionCache(): void {
  hasCppFilletBatch = undefined;
}

function detectCppShellBatch(oc: KernelInstance): boolean {
  hasCppShellBatch ??= typeof oc.ShellBatch === 'function';
  return hasCppShellBatch;
}

function detectCppFilletBatch(oc: KernelInstance): boolean {
  hasCppFilletBatch ??= typeof oc.FilletBatch === 'function';
  return hasCppFilletBatch;
}

export interface ShellBatchEntry {
  shape: KernelShape;
  faces: KernelShape[];
  thickness: number;
  tolerance?: number | undefined;
}

export function shellBatch(oc: KernelInstance, entries: readonly ShellBatchEntry[]): KernelShape[] {
  if (entries.length === 0) return [];

  /* v8 ignore start -- C++ extractor not available in test WASM build */
  if (detectCppShellBatch(oc)) {
    const end = perfTimer('shell');
    const batch = new oc.ShellBatch();
    try {
      for (const e of entries) {
        const idx = batch.beginShell(e.shape, e.thickness, e.tolerance ?? 1e-3) as number;
        // brepjs-patterns-disable: max-nesting-depth
        for (const face of e.faces) {
          batch.addFaceToRemove(idx, face);
        }
      }

      const result = batch.execute();
      try {
        const count = result.getShapesCount() as number;
        return Array.from({ length: count }, (_, i) => result.getShape(i));
      } finally {
        result.delete();
      }
    } finally {
      batch.delete();
      end();
    }
  }
  /* v8 ignore stop */

  // JS fallback — shell() has its own perfTimer
  return entries.map((e) => shell(oc, e.shape, e.faces, e.thickness, e.tolerance ?? 1e-3));
}

export interface FilletBatchEdge {
  edge: KernelShape;
  radius: number;
  r2?: number | undefined;
}

export interface FilletBatchEntry {
  shape: KernelShape;
  edges: readonly FilletBatchEdge[];
}

export function filletBatch(
  oc: KernelInstance,
  entries: readonly FilletBatchEntry[]
): KernelShape[] {
  if (entries.length === 0) return [];

  /* v8 ignore start -- C++ extractor not available in test WASM build */
  if (detectCppFilletBatch(oc)) {
    const end = perfTimer('fillet');
    const batch = new oc.FilletBatch();
    try {
      for (const e of entries) {
        const idx = batch.beginFillet(e.shape) as number;
        // brepjs-patterns-disable: max-nesting-depth
        for (const ei of e.edges) {
          // brepjs-patterns-disable: max-nesting-depth
          if (ei.r2 !== undefined) {
            batch.addEdgeVariable(idx, ei.edge, ei.radius, ei.r2);
          } else {
            batch.addEdge(idx, ei.edge, ei.radius);
          }
        }
      }

      const result = batch.execute();
      try {
        const count = result.getShapesCount() as number;
        return Array.from({ length: count }, (_, i) => result.getShape(i));
      } finally {
        result.delete();
      }
    } finally {
      batch.delete();
      end();
    }
  }
  /* v8 ignore stop */

  // JS fallback — per-edge radius via callback, fillet() has its own perfTimer
  return entries.map((e) => {
    const edges = e.edges.map((ei) => ei.edge);
    // Build a per-edge radius callback to preserve individual radii
    const radiusFn = (edge: KernelShape): number | [number, number] => {
      const match = e.edges.find((ei) => ei.edge === edge);
      if (!match) return 0;
      return match.r2 !== undefined ? [match.radius, match.r2] : match.radius;
    };
    return fillet(oc, e.shape, edges, radiusFn);
  });
}

/** Co-located factory: returns the modifier slice of {@link KernelAdapter} bound to `oc`. */
export function makeModifierOps(oc: KernelInstance) {
  return {
    fillet: (shape, edges, radius) => fillet(oc, shape, edges, radius),
    chamfer: (shape, edges, distance) => chamfer(oc, shape, edges, distance),
    chamferDistAngle: (shape, edges, distance, angleDeg) =>
      chamferDistAngle(oc, shape, edges, distance, angleDeg),
    shell: (shape, faces, thickness, tolerance) => shell(oc, shape, faces, thickness, tolerance),
    thicken: (shape, thickness) => thicken(oc, shape, thickness),
    offset: (shape, distance, tolerance) => offset(oc, shape, distance, tolerance),
    offsetWire2D: (wire, dist, joinType) => offsetWire2D(oc, wire, dist, joinType),
    shellBatch: (entries) => shellBatch(oc, entries),
    filletBatch: (entries) => filletBatch(oc, entries),
  } satisfies Pick<
    KernelAdapter,
    | 'fillet'
    | 'chamfer'
    | 'chamferDistAngle'
    | 'shell'
    | 'thicken'
    | 'offset'
    | 'offsetWire2D'
    | 'shellBatch'
    | 'filletBatch'
  >;
}
