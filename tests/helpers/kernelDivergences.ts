/**
 * Divergence registry -- single source of truth for all kernel-specific test differences.
 *
 * Each entry maps a divergence key (operation.specificCase) to its kind and reason.
 * Test files use `skipIfDiverges(ctx, key)` instead of inline `if (isBrepkit) ctx.skip()`.
 */
import { expect } from 'vitest';
import type { TestContext } from 'vitest';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DivergenceKind = 'not-implemented' | 'skip' | 'tolerance' | 'topology-differs';

interface BaseDivergence {
  readonly kind: DivergenceKind;
  readonly reason: string;
  readonly since?: string | undefined;
  readonly tracking?: string | undefined;
}

export interface ToleranceDivergence extends BaseDivergence {
  readonly kind: 'tolerance';
  readonly relativeTol: number;
  readonly absoluteTol?: number | undefined;
  readonly metric: 'volume' | 'area' | 'distance' | 'angle' | 'count';
}

export type Divergence = BaseDivergence | ToleranceDivergence;

type DivergenceMap = Record<string, Record<string, Divergence>>;

// ---------------------------------------------------------------------------
// Current kernel detection
// ---------------------------------------------------------------------------

export const currentKernelId: string = process.env['TEST_KERNEL'] ?? 'occt';
export const isBrepkit: boolean = currentKernelId === 'brepkit';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const divergences: DivergenceMap = {
  manifold: {
    // -----------------------------------------------------------------------
    // booleans.test.ts — mesh CSG vs exact B-rep
    // -----------------------------------------------------------------------
    'booleans.cutFuseRecombine': {
      kind: 'skip',
      reason:
        'Mesh CSG is ambiguous at exactly-coincident faces — fast-check generates concentric, equal-size cubes whose intersection collapses to empty (100% volume loss) where B-rep resolves it exactly. The identity holds on manifold for realistic non-coincident geometry; real designs avoid coincident faces via clearance margins.',
    },
    'meshFns.exportStlTolerance': {
      kind: 'skip',
      reason:
        'manifold sphere is a fixed-segment primitive — tolerance/angularTolerance do not change its facet count, so coarse and fine STL exports are identical.',
    },
    'curves.cylinderUnwrapOriginal': {
      kind: 'not-implemented',
      reason:
        'manifold proxies getSurfaceCylinderData to occt, which throws ' +
        '(oc.GeomAdaptor_Surface_2 is not a constructor in the brepjs-opencascade WASM build; see #1312)',
    },
  },
  brepkit: {
    // -----------------------------------------------------------------------
    // booleanFns.test.ts
    // -----------------------------------------------------------------------
    'booleanFns.sectionToFaceSphere': {
      kind: 'skip',
      reason: 'brepkit sectionToFace produces degenerate face for sphere cross-sections',
    },
    'booleanFns.nullShapeValidation': {
      kind: 'not-implemented',
      reason:
        'Tests use raw OCCT API (oc.TopoDS_Solid) to construct null shapes; unavailable in brepkit',
    },

    // -----------------------------------------------------------------------
    // modifierFns.test.ts
    // -----------------------------------------------------------------------
    'modifierFns.variableFilletRadius': {
      kind: 'not-implemented',
      reason:
        'brepkit variable fillet produces vol > 1000 (physically impossible -- fillet removes material)',
    },
    'modifierFns.variableFilletCallback': {
      kind: 'not-implemented',
      reason:
        'brepkit variable fillet produces vol > 1000 (physically impossible -- fillet removes material)',
    },
    'modifierFns.nullShapeValidation': {
      kind: 'not-implemented',
      reason:
        'Tests use raw OCCT API (oc.TopoDS_Solid) to construct null shapes; unavailable in brepkit',
    },

    // -----------------------------------------------------------------------
    // compoundOpsFns.test.ts
    // -----------------------------------------------------------------------
    'compoundOpsFns.noFacesShape': {
      kind: 'skip',
      reason:
        'Uses raw OCCT API (oc.gp_Pnt_3, BRepBuilderAPI_MakeEdge_3) to construct edge-only shape',
    },
    'compoundOpsFns.pocketVolume': {
      kind: 'skip',
      reason:
        'brepkit: translate on faces requires copyFace/transformFace WASM exports not yet available',
    },
    'compoundOpsFns.bossVolume': {
      kind: 'skip',
      reason:
        'brepkit: translate on faces requires copyFace/transformFace WASM exports not yet available',
    },

    // -----------------------------------------------------------------------
    // kernelCall.test.ts
    // -----------------------------------------------------------------------
    'kernelCall.doubleFillet': {
      kind: 'skip',
      reason:
        'Double fillet requires filleting edges adjacent to NURBS blend faces, which brepkit does not yet support',
    },

    // -----------------------------------------------------------------------
    // sketcher3d.test.ts
    // -----------------------------------------------------------------------
    'sketcher3d.sagittaArcTo': {
      kind: 'skip',
      reason: 'brepkit: 2D-to-3D lift produces different geometry than direct 3D construction',
    },
    'sketcher3d.bulgeArcTo': {
      kind: 'skip',
      reason: 'brepkit: 2D-to-3D lift produces different geometry than direct 3D construction',
    },
    'sketcher3d.halfEllipseTo': {
      kind: 'skip',
      reason: 'brepkit: 2D-to-3D lift produces different geometry than direct 3D construction',
    },
    'sketcher3d.ellipseTo': {
      kind: 'skip',
      reason: 'brepkit: 2D-to-3D lift produces different geometry than direct 3D construction',
    },
    'sketcher3d.smoothSplineTo': {
      kind: 'skip',
      reason: 'brepkit: 2D-to-3D lift produces different geometry than direct 3D construction',
    },
    'sketcher3d.customCornerFillet': {
      kind: 'skip',
      reason:
        'brepkit: fillet2d produces incorrect geometry when lifted to 3D via curvesAsEdgesOnPlane',
    },
    'sketcher3d.customCornerChamfer': {
      kind: 'skip',
      reason:
        'brepkit: chamfer2d produces incorrect geometry when lifted to 3D via curvesAsEdgesOnPlane',
    },
    'sketcher3d.closeWithCustomCorner': {
      kind: 'skip',
      reason:
        'brepkit: fillet2d produces incorrect geometry when lifted to 3D via curvesAsEdgesOnPlane',
    },
    'sketcher3d.customCornerNonXY': {
      kind: 'skip',
      reason:
        'brepkit: fillet2d produces incorrect geometry when lifted to 3D via curvesAsEdgesOnPlane',
    },

    // -----------------------------------------------------------------------
    // docs-examples.test.ts
    // -----------------------------------------------------------------------
    'docsExamples.2dTo3dWorkflow': {
      kind: 'skip',
      reason: 'brepkit: drawingCut + drawingToSketchOnPlane 2D-to-3D workflow not yet supported',
    },

    // -----------------------------------------------------------------------
    // gridfinity-smoke.test.ts
    // -----------------------------------------------------------------------
    'gridfinity.roundedRectExtrude': {
      kind: 'skip',
      reason: 'brepkit: roundedRect extrude depth=37 vs expected 7',
    },
    'gridfinity.circleExtrude': {
      kind: 'skip',
      reason: 'brepkit: FACE_BUILD_FAILED on circle wire (non-planar wire detection issue)',
    },
    'gridfinity.rectLipSweep': {
      kind: 'skip',
      reason:
        'brepkit: sweep pipe on rectangular spine produces wildly different geometry bounds (xMax ~105 vs expected ~24)',
    },

    // -----------------------------------------------------------------------
    // faceFinder.test.ts (topology-differs, not a skip)
    // -----------------------------------------------------------------------
    'faceFinder.sphereFaceCount': {
      kind: 'topology-differs',
      reason: 'brepkit reports 2 sphere faces vs OCCT 1 (different tessellation topology)',
    },

    // -----------------------------------------------------------------------
    // draftFns.test.ts (OCCT draft test skipped on brepkit)
    // -----------------------------------------------------------------------
    'draftFns.occtDraft': {
      kind: 'skip',
      reason: 'OCCT draft test -- skipped on brepkit; brepkit has its own draft tests',
    },

    // -----------------------------------------------------------------------
    // cast.test.ts
    // -----------------------------------------------------------------------
    'cast.nullShape': {
      kind: 'not-implemented',
      reason:
        'Tests use raw OCCT API (oc.TopoDS_Solid) to construct null shapes; unavailable in brepkit',
    },
    'cast.downcastNull': {
      kind: 'not-implemented',
      reason:
        'Tests use raw OCCT API (oc.TopoDS_Solid) to construct null shapes; unavailable in brepkit',
    },
    'cast.toBREPRoundTrip': {
      kind: 'not-implemented',
      reason: 'BREP round-trip via oc.TopoDS_Solid unavailable in brepkit',
    },
    'cast.garbageInput': {
      kind: 'not-implemented',
      reason: 'BREP garbage input test uses raw OCCT API; unavailable in brepkit',
    },

    // -----------------------------------------------------------------------
    // extrudeFns.test.ts
    // -----------------------------------------------------------------------
    'extrudeFns.circleExtrude': {
      kind: 'not-implemented',
      reason: 'brepkit circle extrude uses sketchCircle + castShape path that differs from OCCT',
    },
    'extrudeFns.nullFace': {
      kind: 'not-implemented',
      reason: 'Tests use raw OCCT API to construct null face; unavailable in brepkit',
    },
    'extrudeFns.revolveNullFace': {
      kind: 'not-implemented',
      reason: 'Tests use raw OCCT API to construct null face; unavailable in brepkit',
    },

    // -----------------------------------------------------------------------
    // shapeRef.test.ts
    // -----------------------------------------------------------------------
    'shapeRef.evolutionFuse': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking (fuseWithEvolution) not implemented in brepkit kernel',
    },
    'shapeRef.deletedFace': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },
    'shapeRef.splitEvolution': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },

    // -----------------------------------------------------------------------
    // shapeRefIntegration.test.ts
    // -----------------------------------------------------------------------
    'shapeRefIntegration.multiStepReplay': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },
    'shapeRefIntegration.filletEvolution': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },
    'shapeRefIntegration.cutEvolution': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },
    'shapeRefIntegration.geometricFallback': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },
    'shapeRefIntegration.brokenRef': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },
    'shapeRefIntegration.rolePropagation': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },
    'shapeRefIntegration.multipleTrackedFaces': {
      kind: 'not-implemented',
      reason: 'Shape evolution tracking not implemented in brepkit kernel',
    },

    // -----------------------------------------------------------------------
    // meshFns.test.ts
    // -----------------------------------------------------------------------
    'meshFns.stepReadError': {
      kind: 'not-implemented',
      reason: 'Tests patch oc.FS.readFile -- OCCT FS API not available in brepkit',
    },
    'meshFns.meshDeflection': {
      kind: 'not-implemented',
      reason: 'Mesh deflection control uses OCCT-specific API',
    },

    // -----------------------------------------------------------------------
    // Whole-suite OCCT-only (describe.skipIf)
    // -----------------------------------------------------------------------
    variableFillet: {
      kind: 'not-implemented',
      reason: 'OCCT-specific variable fillet via kernel API not available in brepkit',
    },
    multiSweepFns: {
      kind: 'not-implemented',
      reason: 'Multi-sweep (pipe with multiple profiles) not implemented in brepkit kernel',
    },
    guidedSweepFns: {
      kind: 'not-implemented',
      reason: 'Guided sweep (auxiliary spine) not implemented in brepkit kernel',
    },
    interferenceFns: {
      kind: 'not-implemented',
      reason: 'Interference detection not implemented in brepkit kernel',
    },
    hullFns: {
      kind: 'not-implemented',
      reason: 'Convex hull not implemented in brepkit kernel',
    },
    'geometry.findCurveType': {
      kind: 'not-implemented',
      reason: 'findCurveType uses OCCT-specific curve classification API',
    },
    'batchOps.cacheReset': {
      kind: 'not-implemented',
      reason: 'OCCT-specific cache reset mechanism not available in brepkit',
    },
    disposal: {
      kind: 'not-implemented',
      reason: 'OCCT-specific disposal/handle tracking not available in brepkit',
    },
    'booleanFns.propertyTests': {
      kind: 'not-implemented',
      reason: 'Property-based boolean tests use OCCT-specific volume precision',
    },
    occtBoundary: {
      kind: 'not-implemented',
      reason: 'toKernelVec / fromKernelVec are OCCT-specific boundary layer functions',
    },
    minkowskiFns: {
      kind: 'not-implemented',
      reason: 'Minkowski sum not implemented in brepkit kernel',
    },
    'measureFns.nullShapeValidation': {
      kind: 'not-implemented',
      reason: 'Null-shape pre-validation tests use OCCT-specific raw API',
    },
  },

  occt: {
    // -----------------------------------------------------------------------
    // brepkit-only suites (descBk pattern)
    // -----------------------------------------------------------------------
    brepkitSketchArc: {
      kind: 'not-implemented',
      reason: 'Sketch arc entity and constraints are brepkit-only features',
    },
    brepkitOffsetV2: {
      kind: 'not-implemented',
      reason: 'offsetSolidV2 (intersection-based offset engine) is brepkit-only',
    },
    brepkitBooleanEdgeCases: {
      kind: 'not-implemented',
      reason: 'GFA hardening edge cases are brepkit-specific boolean tests',
    },
    brepkitExtended: {
      kind: 'not-implemented',
      reason:
        'Extended I/O, advanced modeling, validation, point classification, mesh boolean, batch execution, arena checkpoint are brepkit-only',
    },
    gltfRoundTrip: {
      kind: 'not-implemented',
      reason: 'GLB round-trip is brepkit-only (OCCT does not support GLTF export natively)',
    },

    // -----------------------------------------------------------------------
    // draftFns.test.ts -- brepkit-only draft operations
    // -----------------------------------------------------------------------
    'draftFns.brepkitUniform': {
      kind: 'not-implemented',
      reason:
        'brepkit draft operations use brepkit-native API; OCCT needs WASM rebuild with BRepOffsetAPI_DraftAngle',
    },
    'draftFns.brepkitCallback': {
      kind: 'not-implemented',
      reason: 'brepkit draft callback API not available in OCCT',
    },
    'draftFns.brepkitMultiAngle': {
      kind: 'not-implemented',
      reason: 'brepkit multi-angle callback draft rejection not available in OCCT',
    },
    'draftFns.brepkitFinderFn': {
      kind: 'not-implemented',
      reason: 'brepkit draft with FinderFn selection not available in OCCT',
    },
    'draftFns.brepkitNegativeAngle': {
      kind: 'not-implemented',
      reason: 'brepkit negative angle draft not available in OCCT',
    },
    // geometry2d migration: sampled B-spline bridge loses analytic precision
    'docsExamples.2dTo3dWorkflow': {
      kind: 'skip',
      reason:
        'Sampled B-spline bridge for circle cut holes loses analytic precision — ' +
        'OCCT face builder needs exact circle geometry for hole subtraction during extrusion',
    },
    'sketcher3d.halfEllipseTo': {
      kind: 'skip',
      reason:
        'Sampled B-spline approximation of ellipse arcs has lower precision than native OCCT Geom2d',
    },
    'sketcher3d.ellipseTo': {
      kind: 'skip',
      reason:
        'Sampled B-spline approximation of ellipse arcs has lower precision than native OCCT Geom2d',
    },
    'curves.cylinderUnwrapOriginal': {
      kind: 'not-implemented',
      reason:
        'getSurfaceCylinderData throws on occt: oc.GeomAdaptor_Surface_2 is not a constructor ' +
        'in the brepjs-opencascade WASM build (see #1312)',
    },
  },

  // occt-wasm is near-identical to occt; divergences are tracked via
  // excludeTests in kernelRegistry.ts. Add entries here when specific
  // tests need per-test skipping rather than whole-file exclusion.
  'occt-wasm': {
    // ---------------------------------------------------------------------
    // Raw-OCCT-API tests: exercise the Emscripten `oc` object (gp_Vec,
    // TopoDS_*, FS.readFile, raw BREP) that occt-wasm does not expose by
    // design. Same class brepkit skips; not a geometry-parity gap.
    // ---------------------------------------------------------------------
    occtBoundary: {
      kind: 'not-implemented',
      reason: 'toKernelVec / fromKernelVec are raw-OCCT boundary helpers; occt-wasm has no `oc`',
    },
    disposal: {
      kind: 'not-implemented',
      reason: 'createHandle tests wrap raw `oc` shapes; occt-wasm exposes no raw `oc` instance',
    },
    'meshFns.stepReadError': {
      kind: 'not-implemented',
      reason: 'Patches oc.FS.readFile — OCCT Emscripten FS API not exposed by occt-wasm',
    },
    'meshFns.meshDeflection': {
      kind: 'not-implemented',
      reason: 'STL read-error test patches oc.FS.readFile — not exposed by occt-wasm',
    },
    'cast.garbageInput': {
      kind: 'not-implemented',
      reason: 'BREP garbage-input test uses raw `oc` API; occt-wasm exposes no raw `oc`',
    },
    'geometry.findCurveType': {
      kind: 'not-implemented',
      reason: 'Test feeds raw oc.GeomAbs_CurveType enums; getKernel().curveType works on occt-wasm',
    },
    guidedSweepFns: {
      kind: 'not-implemented',
      reason: 'Test builds the spine via raw `oc` (gp_Ax2_4/gp_Circ_2); occt-wasm exposes no `oc`',
    },
    multiSweepFns: {
      kind: 'not-implemented',
      reason: 'Test builds sections via raw `oc` (gp_Circ_2/BRepBuilderAPI_MakeEdge); no `oc`',
    },
    // ---------------------------------------------------------------------
    // Already divergent on `occt` too: the sampled B-spline 2D bridge loses
    // analytic precision vs native Geom2d (see the `occt` entries above).
    // ---------------------------------------------------------------------
    'sketcher3d.halfEllipseTo': {
      kind: 'skip',
      reason:
        'Sampled B-spline approximation of ellipse arcs is lower-precision than native Geom2d',
    },
    'sketcher3d.ellipseTo': {
      kind: 'skip',
      reason:
        'Sampled B-spline approximation of ellipse arcs is lower-precision than native Geom2d',
    },
    'docsExamples.2dTo3dWorkflow': {
      kind: 'skip',
      reason:
        'Sampled B-spline bridge for circle cut holes loses analytic precision — ' +
        'face builder needs exact circle geometry for hole subtraction during extrusion',
    },
    brepkitSketchArc: {
      kind: 'not-implemented',
      reason: 'Sketch arc entity and constraints are brepkit-only features',
    },
    'draftFns.brepkitCallback': {
      kind: 'not-implemented',
      reason: 'brepkit draft callback API not available in OCCT',
    },
    'draftFns.brepkitMultiAngle': {
      kind: 'not-implemented',
      reason: 'brepkit multi-angle callback draft rejection not available in OCCT',
    },
    'draftFns.brepkitFinderFn': {
      kind: 'not-implemented',
      reason: 'brepkit FinderFn draft not available in OCCT',
    },
  },
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Look up a divergence entry for a given key and kernel.
 * Returns `undefined` if no divergence is registered.
 */
export function getDivergence(
  key: string,
  kernelId: string = currentKernelId
): Divergence | undefined {
  return divergences[kernelId]?.[key];
}

/**
 * Look up a tolerance divergence. Returns `undefined` if the divergence
 * exists but is not of kind `'tolerance'`, or if no divergence is registered.
 */
export function getToleranceFor(
  key: string,
  kernelId: string = currentKernelId
): ToleranceDivergence | undefined {
  const div = getDivergence(key, kernelId);
  return div?.kind === 'tolerance' ? (div as ToleranceDivergence) : undefined;
}

/**
 * Return the full divergence map (all kernels).
 */
export function getAllDivergences(): DivergenceMap {
  return divergences;
}

/**
 * Returns `true` if the given key is registered as `not-implemented` or `skip`
 * for the specified kernel, meaning the entire suite/test should be skipped.
 */
export function shouldSkipSuite(key: string, kernelId: string = currentKernelId): boolean {
  const div = getDivergence(key, kernelId);
  return div?.kind === 'not-implemented' || div?.kind === 'skip';
}

/**
 * Skip the current test if a divergence with kind `not-implemented` or `skip`
 * is registered for the given key and kernel.
 *
 * For `tolerance` and `topology-differs` divergences this is a no-op --
 * the test still runs; the divergence is informational only.
 */
export function skipIfDiverges(
  ctx: TestContext,
  key: string,
  kernelId: string = currentKernelId
): void {
  if (shouldSkipSuite(key, kernelId)) {
    ctx.skip();
  }
}

// ---------------------------------------------------------------------------
// Cross-kernel comparison helpers
// ---------------------------------------------------------------------------

/**
 * Assert a value is close to expected within tolerance.
 * Supports both relative and absolute tolerance.
 */
export function expectClose(actual: number, expected: number, relTol = 1e-4, absTol = 1e-10): void {
  const diff = Math.abs(actual - expected);
  const tol = Math.max(absTol, Math.abs(expected) * relTol);
  expect(diff).toBeLessThanOrEqual(tol);
}

/**
 * Compare values from two kernels and assert they agree within tolerance.
 */
export function expectKernelsAgree(
  valA: number,
  valB: number,
  label: string,
  relTol = 1e-4,
  absTol = 1e-10
): void {
  const diff = Math.abs(valA - valB);
  const ref = Math.max(Math.abs(valA), Math.abs(valB));
  const tol = Math.max(absTol, ref * relTol);
  expect(
    diff,
    `Cross-kernel disagreement on ${label}: OCCT=${valA}, brepkit=${valB}, diff=${diff}, tol=${tol}`
  ).toBeLessThanOrEqual(tol);
}
