export interface VerifyCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface VerifyMeasurements {
  volume?: number;
  area?: number;
  /** Volume centroid `[x, y, z]`. Absent when center-of-mass can't be computed. */
  centerOfMass?: readonly [number, number, number];
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
}

/** Topology element counts — a quick structural fingerprint of a shape. */
export interface VerifyTopology {
  faceCount: number;
  edgeCount: number;
  wireCount: number;
  vertexCount: number;
  /** True when every shell is manifold. Absent for shapes without shells (nothing to assess). */
  manifold?: boolean;
}

/** A failure captured with whatever structured context it carried (a `BrepError` code/suggestion). */
export interface ErrorInfo {
  message: string;
  code?: string | undefined;
  suggestion?: string | undefined;
}

export interface VerifyHint {
  code: string;
  message: string;
  fix: string;
  nextStep: string;
}

/** One measured-vs-expected comparison from a part's `export const expected`. */
export interface VerifyAssertion {
  name: string;
  expected: number;
  /** The measured value, or null when the part produced no such measurement. */
  actual: number | null;
  passed: boolean;
}

export interface VerifyReport {
  shapeType: string | null;
  checks: VerifyCheck[];
  measurements: VerifyMeasurements;
  /** Topology element counts. Absent when traversal fails on a degenerate shape. */
  topology?: VerifyTopology;
  errors: string[];
  /** Structured copies of `errors`, carrying any `BrepError` code/suggestion. Drives `hints`. */
  errorInfos: ErrorInfo[];
  /** Actionable, code-keyed guidance derived from `errorInfos`. */
  hints: VerifyHint[];
  /**
   * Measured-vs-expected comparisons from a part's `export const expected`. Empty when the part
   * declares no expectations; when non-empty, `ok` additionally requires every assertion pass.
   */
  assertions: VerifyAssertion[];
}

export interface BoundsDelta {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface DiffReport {
  volumeDelta: number;
  areaDelta: number;
  bboxDelta: BoundsDelta;
  symmetricDifferenceVolume: number;
  errors: string[];
}

export function emptyReport(): VerifyReport {
  return {
    shapeType: null,
    checks: [],
    measurements: {},
    errors: [],
    errorInfos: [],
    hints: [],
    assertions: [],
  };
}

// Keep errors and errorInfos parallel — callers must not push to either directly.
export function pushError(r: VerifyReport, info: ErrorInfo): void {
  r.errors.push(info.message);
  r.errorInfos.push(info);
}

export function reportOk(r: VerifyReport): boolean {
  return (
    r.errors.length === 0 && r.checks.every((c) => c.passed) && r.assertions.every((a) => a.passed)
  );
}

/**
 * Local, brepjs-verify-owned advice keyed on `BrepErrorCode` values (see `brepjs`'s public
 * `BrepErrorCode`). Intentionally not importing the library's internal `getSuggestionForCode`:
 * this table is the agent loop's own actionable `fix` + `nextStep` guidance, and the library's
 * public `BrepError.suggestion` is still surfaced alongside it on each hint.
 */
const HINT_TABLE: Record<string, { fix: string; nextStep: string }> = {
  FILLET_NO_EDGES: {
    fix: 'Select real edges before filleting — pass an edge query (e.g. find edges by direction/position) or a non-empty edge list, not the whole solid.',
    nextStep:
      'List the solid’s edges, pick the ones to round, then call fillet(solid, edges, radius).',
  },
  CHAMFER_NO_EDGES: {
    fix: 'Select real edges before chamfering — pass a non-empty edge query/list rather than relying on a default that matched nothing.',
    nextStep:
      'Enumerate the solid’s edges, choose the target edges, then call chamfer(solid, edges, distance).',
  },
  INVALID_FILLET_RADIUS: {
    fix: 'Use a fillet radius that is > 0 and small enough to fit the adjacent faces (well under half the thinnest wall).',
    nextStep:
      'Reduce the radius (try a fraction of the smallest local feature size) and re-verify.',
  },
  INVALID_CHAMFER_DISTANCE: {
    fix: 'Use a chamfer distance that is > 0 and smaller than the adjacent edge lengths.',
    nextStep: 'Lower the distance below the shortest adjacent edge and re-verify.',
  },
  INVALID_THICKNESS: {
    fix: 'Use a shell/wall thickness that is > 0 and less than half the smallest cross-section.',
    nextStep:
      'Reduce the thickness and re-verify, or remove the offending face from the removed-faces set.',
  },
  ZERO_LENGTH_EXTRUSION: {
    fix: 'Extrude by a non-zero distance — a length of 0 produces no solid.',
    nextStep: 'Set a positive extrusion height (units: mm) and re-verify.',
  },
  ZERO_OFFSET: {
    fix: 'Offset by a non-zero amount — an offset of 0 is a no-op the kernel rejects.',
    nextStep: 'Use a small non-zero offset (positive grows, negative shrinks) and re-verify.',
  },
  FILLET_NOT_3D: {
    fix: 'fillet needs a 3D solid. Build the solid (extrude/revolve/box) before rounding edges.',
    nextStep: 'Move the fillet after the solid is created, then fillet the solid’s edges.',
  },
  CHAMFER_NOT_3D: {
    fix: 'chamfer needs a 3D solid. Build the solid first, then chamfer its edges.',
    nextStep: 'Reorder so chamfer runs on the finished solid, not a sketch/wire/face.',
  },
  FUSE_NOT_3D: {
    fix: 'fuse needs two 3D solids. Ensure both operands are solids before unioning.',
    nextStep: 'Extrude/loft each profile into a solid first, then fuse and unwrap the Result.',
  },
  CUT_NOT_3D: {
    fix: 'cut needs 3D solids for both the base and the tool. Build both as solids first.',
    nextStep:
      'Make the tool a solid (e.g. a box/cylinder), then cut(base, tool) and unwrap the Result.',
  },
  INTERSECT_NOT_3D: {
    fix: 'intersect needs two 3D solids. Build both operands as solids first.',
    nextStep: 'Ensure both inputs are solids, then intersect(a, b) and unwrap the Result.',
  },
  SHELL_NOT_3D: {
    fix: 'shell needs a 3D solid. Create the solid before hollowing it.',
    nextStep: 'Build the solid first, then shell it with a thickness and the faces to remove.',
  },
  OFFSET_NOT_3D: {
    fix: 'This offset needs a 3D solid. Build the solid before offsetting.',
    nextStep: 'Reorder so offset runs on the solid, then re-verify.',
  },
  SWEEP_NOT_3D: {
    fix: 'sweep needs a 3D result context — check the profile and path produce a solid sweep.',
    nextStep:
      'Verify the profile is a closed wire/face and the path is a valid wire, then re-sweep.',
  },
  LOFT_NOT_3D: {
    fix: 'loft needs 3D-capable sections. Use closed profiles that can form a solid.',
    nextStep: 'Provide at least two closed section wires/faces, then loft and unwrap the Result.',
  },
  REVOLUTION_NOT_3D: {
    fix: 'revolve needs a 2D profile revolved about an axis. Pass a face/closed wire.',
    nextStep: 'Use a closed profile and a valid axis, then revolve and unwrap the Result.',
  },
  LOFT_FAILED: {
    fix: 'The loft could not be built — usually mismatched, self-intersecting, or out-of-order sections.',
    nextStep:
      'Make the sections consistent (same orientation, non-self-intersecting, ordered along the loft) and retry.',
  },
  LOFT_EMPTY: {
    fix: 'loft received too few sections. Provide at least two profiles.',
    nextStep: 'Add the missing section wires/faces and loft again.',
  },
  SWEEP_FAILED: {
    fix: 'The sweep failed — usually a path with sharp corners/self-intersection or a profile too large for the path curvature.',
    nextStep: 'Smooth or simplify the path, shrink the profile, then re-sweep.',
  },
  FUSE_FAILED: {
    fix: 'The boolean union failed — often touching-but-not-overlapping solids or tolerance issues.',
    nextStep: 'Make the operands overlap slightly (or heal/translate one), then re-fuse.',
  },
  CUT_FAILED: {
    fix: 'The boolean subtraction failed — often a tool that does not actually intersect the base, or tolerance issues.',
    nextStep: 'Confirm the tool overlaps the base, optionally heal the inputs, then re-cut.',
  },
  FILLET_FAILED: {
    fix: 'The fillet could not be built — usually the radius is too large for an edge it touched (it cannot exceed the adjacent face/wall), or you filleted EVERY edge (the no-edge-list form) including ones too thin to round.',
    nextStep:
      'Select only the edges you mean to round — e.g. edgeFinder().inDirection("Z").findAll(solid) — and/or reduce the radius below the thinnest adjacent wall, then re-verify.',
  },
  CHAMFER_FAILED: {
    fix: 'The chamfer could not be built — usually the distance is too large for an edge it touched, or you chamfered EVERY edge (the no-edge-list form) including ones too thin.',
    nextStep:
      'Select only the target edges with an edge finder and/or reduce the distance below the shortest adjacent edge, then re-verify.',
  },
  BOOLEAN_HAS_ERRORS: {
    fix: 'The boolean ran but the kernel reported errors (often coincident faces or near-tangent contact).',
    nextStep:
      'Perturb one operand slightly so contact is a clean overlap, or heal the inputs, then retry.',
  },
  STEP_EXPORT_CRASHED: {
    fix: 'STEP export crashed in the kernel — frequently a disjoint/degenerate fuse or an invalid solid reaching the exporter.',
    nextStep:
      'Run validity checks first, heal/simplify the shape (or avoid fusing disjoint solids), then re-export.',
  },
  STEP_EXPORT_FAILED: {
    fix: 'STEP export failed. The shape is likely invalid or non-manifold.',
    nextStep: 'Fix validity errors (heal/sew) until the solid is valid, then re-export.',
  },
  STL_EXPORT_CRASHED: {
    fix: 'STL export crashed — usually an invalid or non-manifold mesh source.',
    nextStep: 'Verify the solid is valid and watertight, then re-export.',
  },
  STL_EXPORT_FAILED: {
    fix: 'STL export failed. The shape is likely invalid or empty.',
    nextStep: 'Fix validity errors first, then re-export.',
  },
  NULL_SHAPE_INPUT: {
    fix: 'An operation received a null/empty shape. Ensure the previous step actually produced a shape.',
    nextStep: 'Check the upstream Result was unwrapped (not an Err) before passing it on.',
  },
  NULL_SHAPE: {
    fix: 'An operation produced or received a null shape. A prior step likely failed silently.',
    nextStep: 'Verify each intermediate shape is non-null before chaining the next operation.',
  },
  VALIDATION_FAILED: {
    fix: 'The shape failed validity (BRepCheck). It is non-manifold, self-intersecting, or has bad geometry.',
    nextStep:
      'Heal/sew the shape, or revisit the operation that produced it, until validSolid passes.',
  },
  TYPECHECK: {
    fix: 'Fix the TypeScript type error before running the part — the API call or value does not match brepjs’s types.',
    nextStep: 'Correct the flagged type (e.g. argument/return type or import), then re-verify.',
  },
  EXPECTED_UNKNOWN_KEY: {
    fix: 'Your `expected` block has keys the CLI does not assert (so the intended check never ran). Bounds must be `{ xMin, xMax, yMin, yMax, zMin, zMax }` — not `{ min, max }` or `{ x, y, z }`.',
    nextStep:
      'Rewrite `expected` using only volume, area, tolerancePct, and bounds.{xMin..zMax}, then re-verify.',
  },
};

/** Synthetic code attached to validity-check failures (validSolid returns a plain string error). */
export const VALIDITY_FAILURE_CODE = 'VALIDATION_FAILED';

export function hintFor(info: ErrorInfo): VerifyHint | null {
  if (!info.code) return null;
  const entry = HINT_TABLE[info.code];
  const fix =
    entry?.fix ??
    info.suggestion ??
    'No specific fix available; inspect the error and the operation that produced it.';
  const nextStep =
    entry?.nextStep ?? 'Adjust the failing operation per the message/suggestion, then re-verify.';
  return { code: info.code, message: info.message, fix, nextStep };
}

export function buildHints(r: VerifyReport): VerifyHint[] {
  const hints: VerifyHint[] = [];
  const seen = new Set<string>();
  for (const info of r.errorInfos) {
    const hint = hintFor(info);
    if (!hint) continue;
    const key = `${hint.code} ${hint.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push(hint);
  }
  return hints;
}

export function serializeReport(r: VerifyReport): string {
  return JSON.stringify({ ok: reportOk(r), ...r }, null, 2);
}
