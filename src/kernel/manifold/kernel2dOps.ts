/**
 * 2D geometry capability for the manifold adapter.
 *
 * Manifold is a 3D-only mesh kernel with no 2D curve representation, so every
 * Kernel2DCapability method delegates to the OCCT kernel when one is
 * registered. With no 'occt' kernel present, each throws a clear unsupported
 * error. Delegation is a thin uniform wrapper rather than 63 hand-written
 * bodies: each method forwards its arguments to the identically-named OCCT
 * method, resolved lazily at call time.
 * @module
 */

import type { Kernel2DCapability } from '@/kernel/kernel2dTypes.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { ManifoldModule } from './helpers.js';
import { resolveOcct } from './meshHandle.js';

const KERNEL_2D_METHODS: readonly (keyof Kernel2DCapability)[] = [
  'createPoint2d',
  'createDirection2d',
  'createVector2d',
  'createAxis2d',
  'wrapCurve2dHandle',
  'createCurve2dAdaptor',
  'makeLine2d',
  'makeCircle2d',
  'makeArc2dThreePoints',
  'makeArc2dTangent',
  'makeEllipse2d',
  'makeEllipseArc2d',
  'makeBezier2d',
  'makeBSpline2d',
  'evaluateCurve2d',
  'evaluateCurve2dD1',
  'getCurve2dBounds',
  'getCurve2dType',
  'trimCurve2d',
  'reverseCurve2d',
  'copyCurve2d',
  'offsetCurve2d',
  'translateCurve2d',
  'rotateCurve2d',
  'scaleCurve2d',
  'mirrorCurve2dAtPoint',
  'mirrorCurve2dAcrossAxis',
  'affinityTransform2d',
  'createIdentityGTrsf2d',
  'createAffinityGTrsf2d',
  'createTranslationGTrsf2d',
  'createMirrorGTrsf2d',
  'createRotationGTrsf2d',
  'createScaleGTrsf2d',
  'setGTrsf2dTranslationPart',
  'multiplyGTrsf2d',
  'transformCurve2dGeneral',
  'intersectCurves2d',
  'projectPointOnCurve2d',
  'distanceBetweenCurves2d',
  'approximateCurve2dAsBSpline',
  'decomposeBSpline2dToBeziers',
  'createBoundingBox2d',
  'addCurveToBBox2d',
  'getBBox2dBounds',
  'mergeBBox2d',
  'isBBox2dOut',
  'isBBox2dOutPoint',
  'getCurve2dCircleData',
  'getCurve2dEllipseData',
  'getCurve2dBezierPoles',
  'getCurve2dBezierDegree',
  'getCurve2dBSplineData',
  'serializeCurve2d',
  'deserializeCurve2d',
  'splitCurve2d',
  'liftCurve2dToPlane',
  'buildEdgeOnSurface',
  'extractSurfaceFromFace',
  'extractCurve2dFromEdge',
  'buildCurves3d',
  'fixWireOnFace',
  'fillSurface',
];

function resolveOcct2D(
  method: keyof Kernel2DCapability
): Record<keyof Kernel2DCapability, (...a: unknown[]) => unknown> {
  const occt: KernelAdapter | undefined = resolveOcct();
  if (!occt) {
    throw new Error(
      `manifold: ${method} unsupported on manifold kernel; no B-rep kernel registered`
    );
  }
  return occt as unknown as Record<keyof Kernel2DCapability, (...a: unknown[]) => unknown>;
}

export function makeKernel2DOps(_module: ManifoldModule): Kernel2DCapability {
  const ops: Partial<Record<keyof Kernel2DCapability, unknown>> = {};
  for (const method of KERNEL_2D_METHODS) {
    ops[method] = (...args: unknown[]): unknown => resolveOcct2D(method)[method](...args);
  }
  return ops as Kernel2DCapability;
}
