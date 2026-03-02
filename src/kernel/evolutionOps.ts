/**
 * Shape evolution tracking for OCCT operations.
 *
 * Provides the common logic for building ShapeEvolution records from
 * OCCT operation builders that expose Modified()/Generated()/IsDeleted().
 */

import type { KernelInstance, KernelShape, ShapeEvolution, OperationResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT operation builders are dynamically typed
type OcBuilder = any;

/**
 * Iterate an OCCT TopTools_ListOfShape, extracting hash codes.
 */
function iterListHashes(oc: KernelInstance, list: OcBuilder, hashUpperBound: number): number[] {
  const result: number[] = [];
  if (list.Size() === 0) return result;

  if (oc.TopTools_ListIteratorOfListOfShape) {
    const iter = new oc.TopTools_ListIteratorOfListOfShape(list);
    while (iter.More()) {
      result.push(iter.Value().HashCode(hashUpperBound));
      iter.Next();
    }
    iter.delete();
  } else {
    const copy = new oc.TopTools_ListOfShape_3(list);
    while (copy.Size() > 0) {
      result.push(copy.First_1().HashCode(hashUpperBound));
      copy.RemoveFirst();
    }
    copy.delete();
  }
  return result;
}

/**
 * Build a ShapeEvolution by querying an OCCT operation's Modified/Generated/IsDeleted
 * methods for a set of input faces identified by their hash codes.
 *
 * @param oc - OCCT instance
 * @param op - The OCCT operation builder (BRepBuilderAPI_Transform, BRepAlgoAPI_Fuse, etc.)
 * @param shape - The original shape (to extract faces via TopExp_Explorer)
 * @param inputFaceHashes - Hash codes of input faces to track
 * @param hashUpperBound - Upper bound for hash code computation
 */
export function buildEvolution(
  oc: KernelInstance,
  op: OcBuilder,
  shapes: KernelShape | KernelShape[],
  inputFaceHashes: number[],
  hashUpperBound: number
): ShapeEvolution {
  const modified = new Map<number, number[]>();
  const generated = new Map<number, number[]>();
  const deleted = new Set<number>();

  // Build a map from hash → face for the input faces across all input shapes
  const inputHashSet = new Set(inputFaceHashes);
  const facesById = new Map<number, KernelShape>();
  const shapeArray = Array.isArray(shapes) ? shapes : [shapes];

  for (const shape of shapeArray) {
    const faceExplorer = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    while (faceExplorer.More()) {
      const face = faceExplorer.Current();
      const hash = face.HashCode(hashUpperBound);
      if (inputHashSet.has(hash)) {
        facesById.set(hash, face);
      }
      faceExplorer.Next();
    }
    faceExplorer.delete();
  }

  // Query Modified/Generated/IsDeleted for each tracked face
  for (const [hash, face] of facesById) {
    if (op.IsDeleted?.(face)) {
      deleted.add(hash);
      continue;
    }

    const modList = op.Modified(face);
    if (modList.Size() > 0) {
      modified.set(hash, iterListHashes(oc, modList, hashUpperBound));
    }

    const genList = op.Generated(face);
    if (genList.Size() > 0) {
      generated.set(hash, iterListHashes(oc, genList, hashUpperBound));
    }
  }

  return { modified, generated, deleted };
}

/**
 * Wrap a transform operation with shape evolution tracking.
 */
export function transformWithEvolution(
  oc: KernelInstance,
  shape: KernelShape,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT gp_Trsf
  trsf: any,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  const resultShape = transformer.Shape();
  const evolution = buildEvolution(oc, transformer, shape, inputFaceHashes, hashUpperBound);
  transformer.delete();
  return { shape: resultShape, evolution };
}

/**
 * Wrap a boolean operation with shape evolution tracking.
 */
export function booleanWithEvolution(
  oc: KernelInstance,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT boolean operation builder
  boolOp: any,
  inputShapes: KernelShape | KernelShape[],
  inputFaceHashes: number[],
  hashUpperBound: number,
  simplify: boolean
): OperationResult {
  if (simplify) boolOp.SimplifyResult(true, true, 1e-3);
  const resultShape = boolOp.Shape();
  const evolution = buildEvolution(oc, boolOp, inputShapes, inputFaceHashes, hashUpperBound);
  return { shape: resultShape, evolution };
}

/**
 * Wrap a modifier operation (fillet, chamfer, shell, thicken, offset)
 * with shape evolution tracking.
 */
export function modifierWithEvolution(
  oc: KernelInstance,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT modifier builder
  builder: any,
  inputShape: KernelShape,
  inputFaceHashes: number[],
  hashUpperBound: number
): OperationResult {
  const resultShape = builder.Shape();
  const evolution = buildEvolution(oc, builder, inputShape, inputFaceHashes, hashUpperBound);
  return { shape: resultShape, evolution };
}
