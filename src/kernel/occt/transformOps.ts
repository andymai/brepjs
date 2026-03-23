/**
 * Transform operations for OCCT shapes.
 *
 * Provides translate, rotate, mirror, scale, and generic transform operations.
 * Used by DefaultAdapter.
 */

import type { TransformEntry } from '@/kernel/interfaces/transformOps.js';
import type { KernelInstance, KernelShape, KernelType } from '@/kernel/types.js';
import { perfTimer } from '../perfStats.js';

export type { TransformEntry };

/** Cached flag: does the WASM build include TransformBatch? */
let hasCppTransformBatch: boolean | undefined;

/** Reset detection cache (called when kernel is re-initialized). */
export function resetTransformDetectionCache(): void {
  hasCppTransformBatch = undefined;
}

function detectCppTransformBatch(oc: KernelInstance): boolean {
  hasCppTransformBatch ??= typeof oc.TransformBatch === 'function';
  return hasCppTransformBatch;
}

/**
 * Apply N transforms in a single WASM call (when C++ TransformBatch is available).
 * Falls back to individual JS calls otherwise.
 */
export function transformBatch(oc: KernelInstance, entries: TransformEntry[]): KernelShape[] {
  if (entries.length === 0) return [];

  const endPerf = perfTimer('transform');
  try {
    /* v8 ignore start -- C++ extractor not available in test WASM build */
    if (detectCppTransformBatch(oc)) {
      const batch = new oc.TransformBatch();
      try {
        for (const e of entries) {
          // brepjs-patterns-disable: max-nesting-depth
          switch (e.type) {
            case 'translate':
              batch.addTranslate(e.shape, e.x, e.y, e.z);
              break;
            case 'rotate':
              batch.addRotate(e.shape, (e.angle * Math.PI) / 180, ...e.axis, ...e.center);
              break;
            case 'scale':
              batch.addScale(e.shape, ...e.center, e.factor);
              break;
            case 'mirror':
              batch.addMirror(e.shape, ...e.origin, ...e.normal);
              break;
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
      }
    }
    /* v8 ignore stop */

    // JS fallback — individual calls
    return entries.map((e) => {
      switch (e.type) {
        case 'translate':
          return translate(oc, e.shape, e.x, e.y, e.z);
        case 'rotate':
          return rotate(oc, e.shape, e.angle, [...e.axis], [...e.center]);
        case 'scale':
          return scale(oc, e.shape, [...e.center], e.factor);
        case 'mirror':
          return mirror(oc, e.shape, [...e.origin], [...e.normal]);
      }
    });
  } finally {
    endPerf();
  }
}

/**
 * Applies a transformation matrix to a shape.
 */
export function transform(oc: KernelInstance, shape: KernelShape, trsf: KernelType): KernelShape {
  const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  const result = transformer.ModifiedShape(shape);
  transformer.delete();
  return result;
}

/**
 * Translates a shape by the given offset.
 */
export function translate(
  oc: KernelInstance,
  shape: KernelShape,
  x: number,
  y: number,
  z: number
): KernelShape {
  const trsf = new oc.gp_Trsf_1();
  const vec = new oc.gp_Vec_4(x, y, z);
  trsf.SetTranslation_1(vec);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  vec.delete();
  return result;
}

/**
 * Rotates a shape around an axis.
 */
export function rotate(
  oc: KernelInstance,
  shape: KernelShape,
  angle: number,
  axis: [number, number, number] = [0, 0, 1],
  center: [number, number, number] = [0, 0, 0]
): KernelShape {
  const trsf = new oc.gp_Trsf_1();
  const origin = new oc.gp_Pnt_3(...center);
  const dir = new oc.gp_Dir_4(...axis);
  const ax1 = new oc.gp_Ax1_2(origin, dir);
  trsf.SetRotation_1(ax1, (angle * Math.PI) / 180);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  ax1.delete();
  origin.delete();
  dir.delete();
  return result;
}

/**
 * Mirrors a shape through a plane.
 */
export function mirror(
  oc: KernelInstance,
  shape: KernelShape,
  origin: [number, number, number],
  normal: [number, number, number]
): KernelShape {
  const trsf = new oc.gp_Trsf_1();
  const pnt = new oc.gp_Pnt_3(...origin);
  const dir = new oc.gp_Dir_4(...normal);
  const ax2 = new oc.gp_Ax2_3(pnt, dir);
  trsf.SetMirror_3(ax2);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  ax2.delete();
  pnt.delete();
  dir.delete();
  return result;
}

/**
 * Scales a shape uniformly around a center point.
 */
export function scale(
  oc: KernelInstance,
  shape: KernelShape,
  center: [number, number, number],
  factor: number
): KernelShape {
  const trsf = new oc.gp_Trsf_1();
  const pnt = new oc.gp_Pnt_3(...center);
  trsf.SetScale(pnt, factor);
  const result = transform(oc, shape, trsf);
  trsf.delete();
  pnt.delete();
  return result;
}

/**
 * Applies a general affine transform (3x3 linear + translation) to a shape.
 *
 * If `isOrthogonal` is true, uses the fast gp_Trsf + BRepBuilderAPI_Transform path.
 * Otherwise uses gp_GTrsf + BRepBuilderAPI_GTransform for non-orthogonal transforms
 * (shear, non-uniform scale).
 */
export function generalTransform(
  oc: KernelInstance,
  shape: KernelShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number],
  isOrthogonal: boolean
): KernelShape {
  if (isOrthogonal) {
    const trsf = new oc.gp_Trsf_1();
    trsf.SetValues(
      linear[0],
      linear[1],
      linear[2],
      translation[0],
      linear[3],
      linear[4],
      linear[5],
      translation[1],
      linear[6],
      linear[7],
      linear[8],
      translation[2]
    );
    const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
    const result = transformer.ModifiedShape(shape);
    transformer.delete();
    trsf.delete();
    return result;
  }

  /* v8 ignore start -- untestable until WASM is rebuilt with BRepBuilderAPI_GTransform */
  const gtrsf = new oc.gp_GTrsf_1();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      gtrsf.SetValue(row + 1, col + 1, linear[row * 3 + col]);
    }
  }
  const xyz = new oc.gp_XYZ_2(translation[0], translation[1], translation[2]);
  gtrsf.SetTranslationPart(xyz);
  xyz.delete();

  const transformer = new oc.BRepBuilderAPI_GTransform_2(shape, gtrsf, true);
  const result = transformer.ModifiedShape(shape);
  transformer.delete();
  gtrsf.delete();
  return result;
  /* v8 ignore stop */
}

/**
 * Simplifies a shape by unifying same-domain surfaces.
 */
export function simplify(oc: KernelInstance, shape: KernelShape): KernelShape {
  const upgrader = new oc.ShapeUpgrade_UnifySameDomain_2(shape, true, true, false);
  upgrader.Build();
  const result = upgrader.Shape();
  upgrader.delete();
  return result;
}
