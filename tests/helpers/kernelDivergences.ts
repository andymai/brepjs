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
  brepkit: {
    // -----------------------------------------------------------------------
    // booleanFns.test.ts
    // -----------------------------------------------------------------------
    'booleanFns.disjointIntersection': {
      kind: 'skip',
      reason: 'brepkit throws on disjoint intersection instead of returning empty shape',
    },
    'booleanFns.sectionNonIntersecting': {
      kind: 'skip',
      reason: 'brepkit returns Err for non-intersecting section; OCCT returns Ok with empty edges',
    },
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
    'modifierFns.filletAllEdges': {
      kind: 'skip',
      reason: 'brepkit over-fillets when all 12 edges are filleted (vol ~530 vs >800 expected)',
    },
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

    // -----------------------------------------------------------------------
    // cannedSketches.test.ts
    // -----------------------------------------------------------------------
    'cannedSketches.faceOffset': {
      kind: 'skip',
      reason: 'brepkit: face offset area=576 vs expected<400 (offset not applied correctly)',
    },

    // -----------------------------------------------------------------------
    // kernel-ops.test.ts
    // -----------------------------------------------------------------------
    'kernelOps.variableFilletRadius': {
      kind: 'skip',
      reason:
        'brepkit: variable fillet produces vol > 8000 (physically impossible -- fillet removes material)',
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
    // nurbsFns.test.ts
    // -----------------------------------------------------------------------
    'nurbsFns.bsplineData': {
      kind: 'not-implemented',
      reason:
        'brepkit getNurbsCurveData returns null for interpolated curves (regressed in 2.43.2)',
    },
    'nurbsFns.planarFaceSurface': {
      kind: 'not-implemented',
      reason: 'brepkit does not expose BSpline surface data extraction (getNurbsSurfaceData)',
    },
    'nurbsFns.cylindricalFaceSurface': {
      kind: 'not-implemented',
      reason: 'brepkit does not expose BSpline surface data extraction (getNurbsSurfaceData)',
    },
    'nurbsFns.bsplineSurface': {
      kind: 'not-implemented',
      reason: 'brepkit does not expose BSpline surface data extraction from fillet faces',
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
    // operations.test.ts
    // -----------------------------------------------------------------------
    'operations.loftCircles': {
      kind: 'tolerance',
      relativeTol: 0.01,
      metric: 'volume',
      reason:
        'brepkit: loft volume ~1821 vs expected ~1833 (precision difference, not wrong geometry)',
    } satisfies ToleranceDivergence,

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

    // -----------------------------------------------------------------------
    // faceFinder.test.ts (topology-differs, not a skip)
    // -----------------------------------------------------------------------
    'faceFinder.sphereFaceCount': {
      kind: 'topology-differs',
      reason: 'brepkit reports 2 sphere faces vs OCCT 1 (different tessellation topology)',
    },

    // -----------------------------------------------------------------------
    // validityTypes.test.ts
    // -----------------------------------------------------------------------
    'validityTypes.nonPlanarWire': {
      kind: 'skip',
      reason: "brepkit's makeFace + surfaceType reports 'plane' even for non-coplanar wires",
    },
    'validityTypes.cylinderLateralWire': {
      kind: 'skip',
      reason: "brepkit's makeFace + surfaceType reports 'plane' even for non-coplanar wires",
    },
    'validityTypes.planarWireErr': {
      kind: 'skip',
      reason: "brepkit's makeFace + surfaceType reports 'plane' even for non-coplanar wires",
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
    'offsetWire2D.chamferJoin': {
      kind: 'not-implemented',
      reason: 'offsetWire2D chamfer join type not implemented in brepkit kernel',
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
  },

  // occt-wasm is near-identical to occt; divergences are tracked via
  // excludeTests in kernelRegistry.ts. Add entries here when specific
  // tests need per-test skipping rather than whole-file exclusion.
  'occt-wasm': {
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
