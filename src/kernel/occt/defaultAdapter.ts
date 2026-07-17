/**
 * DefaultAdapter — OCCT-backed `KernelAdapter`.
 *
 * Composed by spreading per-domain factory objects (`make*Ops(oc)`) into the
 * class instance via `Object.assign` in the constructor. The factories live
 * alongside their underlying free functions in each `*Ops.ts` module.
 *
 * Declaration merging (`interface DefaultAdapter extends KernelAdapter`) tells
 * TypeScript that the runtime-assigned methods are present on the type. If a
 * method is forgotten across every factory, the class fails to satisfy
 * `KernelAdapter` and the union check at the bottom of this file errors at
 * compile time.
 *
 * @see docs/decisions/0007-kernel-interface-segregation.md
 */

import type { KernelCapabilities } from '@/kernel/capabilities.js';
import { EXACT_BREP_CAPABILITIES } from '@/kernel/capabilities.js';
import type { KernelAdapter, KernelMeshResult, KernelInstance } from '@/kernel/types.js';
import type { Kernel2DCapability } from '@/kernel/kernel2dTypes.js';
import { UnsupportedKernelOperationError } from '@/kernel/unsupported.js';

import { makeBooleanOps } from './booleanOps.js';
import { makeBooleanPipelineOps } from './booleanPipelineOps.js';
import { makeHullOps } from './hullOps.js';
import { makeConstructorOps } from './constructorOps.js';
import { makeExtendedConstructorOps } from './extendedConstructorOps.js';
import { makeSweepOps } from './sweepOps.js';
import { makeModifierOps } from './modifierOps.js';
import { makeTransformOps } from './transformOps.js';
import { makeMeshOps } from './meshOps.js';
import { makeIoOps } from './ioOps.js';
import { makeMeasureOps } from './measureOps.js';
import { makeTopologyOps } from './topologyOps.js';
import { makeGeometryQueryOps } from './geometryQueryOps.js';
import { makeNurbsQueryOps } from './nurbsQueryOps.js';
import { makeCurveOps } from './curveOps.js';
import { makeHealingOps } from './healingOps.js';
import { makeHistoryOps } from './historyOps.js';
import { makeAdvancedOps } from './advancedOps.js';
import { makeKernel2dOps } from './kernel2dOps.js';
import { draftWithHistory } from './historyOps.js';

/**
 * Stubs for methods that only the brepkit kernel implements.
 *
 * Each throws a uniform error so callers (or kernel-capability checks) can
 * detect the missing implementation. Kept here rather than in a separate
 * module because they share no logic and are zero-cost from the OCCT side.
 */
// brepjs-patterns-disable: max-function-lines
function makeBrepkitOnlyStubs() {
  const u = (name: string) => () => {
    throw new UnsupportedKernelOperationError(`${name} is only available with the brepkit kernel`);
  };
  return {
    export3MF: u('export3MF'),
    exportGLB: u('exportGLB'),
    exportOBJ: u('exportOBJ'),
    exportPLY: u('exportPLY'),
    import3MF: u('import3MF'),
    importOBJ: u('importOBJ'),
    importGLB: u('importGLB'),
    filletVariable: u('filletVariable'),
    helicalSweep: u('helicalSweep'),
    sweepWithOptions: u('sweepWithOptions'),
    defeature: u('defeature'),
    detectSmallFeatures: u('detectSmallFeatures'),
    recognizeFeatures: u('recognizeFeatures'),
    meshBoolean: ((): KernelMeshResult => {
      throw new UnsupportedKernelOperationError(
        'meshBoolean is only available with the brepkit kernel'
      );
    }) as KernelAdapter['meshBoolean'],
    edgeToFaceMap: u('edgeToFaceMap'),
    sharedEdges: u('sharedEdges'),
    adjacentFaces: u('adjacentFaces'),
    curveDegreeElevate: u('curveDegreeElevate'),
    curveKnotInsert: u('curveKnotInsert'),
    curveKnotRemove: u('curveKnotRemove'),
    curveSplit: u('curveSplit'),
    approximateSurfaceLspia: u('approximateSurfaceLspia'),
    untrimFace: u('untrimFace'),
    mergeCoincidentVertices: u('mergeCoincidentVertices'),
    removeDegenerateEdges: u('removeDegenerateEdges'),
    fixFaceOrientations: u('fixFaceOrientations'),
    classifyPointRobust: u('classifyPointRobust'),
    classifyPointWinding: u('classifyPointWinding'),
    executeBatch: u('executeBatch'),
    checkpoint: u('checkpoint'),
    checkpointCount: u('checkpointCount'),
    restoreCheckpoint: u('restoreCheckpoint'),
    discardCheckpoint: u('discardCheckpoint'),
  } satisfies Pick<
    KernelAdapter,
    | 'export3MF'
    | 'exportGLB'
    | 'exportOBJ'
    | 'exportPLY'
    | 'import3MF'
    | 'importOBJ'
    | 'importGLB'
    | 'filletVariable'
    | 'helicalSweep'
    | 'sweepWithOptions'
    | 'defeature'
    | 'detectSmallFeatures'
    | 'recognizeFeatures'
    | 'meshBoolean'
    | 'edgeToFaceMap'
    | 'sharedEdges'
    | 'adjacentFaces'
    | 'curveDegreeElevate'
    | 'curveKnotInsert'
    | 'curveKnotRemove'
    | 'curveSplit'
    | 'approximateSurfaceLspia'
    | 'untrimFace'
    | 'mergeCoincidentVertices'
    | 'removeDegenerateEdges'
    | 'fixFaceOrientations'
    | 'classifyPointRobust'
    | 'classifyPointWinding'
    | 'executeBatch'
    | 'checkpoint'
    | 'checkpointCount'
    | 'restoreCheckpoint'
    | 'discardCheckpoint'
  >;
}

/**
 * `draft` is a convenience wrapper around `draftWithHistory` for callers that
 * don't need evolution tracking. Lives here because it's the only method that
 * shims one factory's output into a different signature.
 */
function makeDraftAdapter(oc: KernelInstance): Pick<KernelAdapter, 'draft'> {
  return {
    draft: (shape, faces, pullDirection, neutralPlane, angleDeg) =>
      draftWithHistory(oc, shape, faces, pullDirection, neutralPlane, angleDeg, [], 1).shape,
  };
}

// Declaration merge: tells TS the class instance has every KernelAdapter
// method, even though they're attached at runtime by Object.assign. The
// canonical pattern for composing mixin-style adapters; the unsafe-merging
// rule guards against accidental shadowing, which isn't a risk here because
// the interface adds no properties of its own.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional mixin composition
export interface DefaultAdapter extends KernelAdapter, Kernel2DCapability {}

/**
 * Default implementation of `KernelAdapter` backed by OpenCascade WASM.
 *
 * All methods are composed from per-domain factories at construction time —
 * there is no body-level method declaration. To find a method's implementation,
 * grep for `function <name>` in `src/kernel/occt/*Ops.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional mixin composition
export class DefaultAdapter {
  readonly oc: KernelInstance;
  readonly kernelId = 'occt';
  readonly capabilities: KernelCapabilities = EXACT_BREP_CAPABILITIES;

  constructor(oc: KernelInstance) {
    this.oc = oc;
    Object.assign(
      this,
      makeBooleanOps(oc),
      makeBooleanPipelineOps(oc),
      makeHullOps(oc),
      makeConstructorOps(oc),
      makeExtendedConstructorOps(oc),
      makeSweepOps(oc),
      makeModifierOps(oc),
      makeTransformOps(oc),
      makeMeshOps(oc),
      makeIoOps(oc),
      makeMeasureOps(oc),
      makeTopologyOps(oc),
      makeGeometryQueryOps(oc),
      makeNurbsQueryOps(oc),
      makeCurveOps(oc),
      makeHealingOps(oc),
      makeHistoryOps(oc),
      makeAdvancedOps(oc),
      makeKernel2dOps(oc),
      makeDraftAdapter(oc),
      makeBrepkitOnlyStubs()
    );
  }
}

// --- Compile-time guard --------------------------------------------------
// If any method is missing across every factory, `new DefaultAdapter(...)`
// won't satisfy `KernelAdapter` and TS errors here with a precise list of
// missing properties. (No runtime cost — strictly compile-time.)
type _AssertSatisfiesKernelAdapter = (
  ...args: ConstructorParameters<typeof DefaultAdapter>
) => KernelAdapter;
const _check: _AssertSatisfiesKernelAdapter = (oc) => new DefaultAdapter(oc);
void _check;
