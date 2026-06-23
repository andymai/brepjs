import type { AnyShape, Solid } from 'brepjs';
import type { BrepNs } from './brepjsRuntime.js';
import type { BodyInfo, BodyRelation, BoreInfo, VerifyManufacturability } from './report.js';

// Deterministic, render-free metrics that inform the design judge (see bench/blind-judge.md). Computed
// only on demand (CLI `--metrics`) so the author's hot `--check` loop is untouched. The headline signal
// is the per-body interference matrix: it tells the judge how many distinct bodies a part has and which
// touch/overlap vs sit apart — the assembly-relationship read that an exterior render is blind to. The
// kernel's contact primitive (`checkInterference`, which already does AABB pre-rejection) is reused; we
// drive the pair loop ourselves only to enforce a wall-clock budget (BRepExtrema distance is slow on
// high-face parts like gears, and the report must never hang).

interface Metrics {
  bodies?: BodyInfo[];
  bodyRelations?: BodyRelation[];
  manufacturability: VerifyManufacturability;
}

type Bounds = NonNullable<BodyInfo['bounds']>;

const RELATION_BUDGET_MS = 15_000;
// Above this body count the pair matrix is skipped wholesale (recorded as truncated) — BIM-scale
// assemblies would otherwise spend minutes in pairwise distance with little judge value.
const MAX_BODIES = 24;
// A body below this volume (mm³) is treated as a degenerate sliver — a conservative hard violation.
const VOL_EPS = 1e-9;
// A cylindrical face counts as a real bore/shaft (not a fillet strip) only above this angular extent
// (radians): a drilled bore sweeps ~2π, a corner/edge fillet only ~π/2. Empirically separates them.
const SUBSTANTIAL_USPAN = 2.5;
// Outward-material-normal · radial < -this ⇒ the wall faces the axis (an internal bore). A
// boss/shaft wall faces away (≈ +1), a bore wall faces in (≈ -1), so 0.5 is a safe split.
// occt-wasm's surfaceNormal is already orientation-aware, so no manual face-orientation flip.
const BORE_DOT = 0.5;

type V3 = readonly [number, number, number];
const v3sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const v3scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const v3unit = (a: V3): V3 => {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
};

function diagonalOf(boundsList: readonly Bounds[]): number {
  if (boundsList.length === 0) return 1;
  const u = {
    xMin: Math.min(...boundsList.map((b) => b.xMin)),
    yMin: Math.min(...boundsList.map((b) => b.yMin)),
    zMin: Math.min(...boundsList.map((b) => b.zMin)),
    xMax: Math.max(...boundsList.map((b) => b.xMax)),
    yMax: Math.max(...boundsList.map((b) => b.yMax)),
    zMax: Math.max(...boundsList.map((b) => b.zMax)),
  };
  return Math.hypot(u.xMax - u.xMin, u.yMax - u.yMin, u.zMax - u.zMin) || 1;
}

function aabbDisjoint(a: Bounds, b: Bounds, eps: number): boolean {
  return (
    a.xMax + eps < b.xMin ||
    b.xMax + eps < a.xMin ||
    a.yMax + eps < b.yMin ||
    b.yMax + eps < a.yMin ||
    a.zMax + eps < b.zMin ||
    b.zMax + eps < a.zMin
  );
}

/** Per-body volume/bounds/validity. Used both for the report and to drive the relation matrix. */
function computeBodies(brep: BrepNs, solids: readonly Solid[]): BodyInfo[] {
  const { measureVolume, getBounds, validSolid, isOk } = brep;
  return solids.map((s, index) => {
    const v = measureVolume(s);
    const volume = isOk(v) ? v.value : 0;
    let bounds: Bounds | undefined;
    try {
      bounds = getBounds(s);
    } catch {
      // a degenerate body may have no bounds; leave it absent (it still counts as a body)
    }
    return { index, volume, ...(bounds ? { bounds } : {}), valid: isOk(validSolid(s)) };
  });
}

/**
 * Pairwise body relationships. `separate` when the bodies are apart (AABB-disjoint, or measured
 * clearance above eps); `interfering` when they touch or overlap (clearance within eps). `touching`/
 * `nested` (which need a boolean-volume tier) are reserved for a later phase. eps scales to the
 * assembly diagonal so it is meaningful from millimetre parts to metre-scale BIM.
 */
function computeBodyRelations(
  brep: BrepNs,
  solids: readonly Solid[],
  bodies: readonly BodyInfo[]
): { relations: BodyRelation[]; truncated: boolean } {
  const { checkInterference, isOk } = brep;
  const relations: BodyRelation[] = [];
  const eps = Math.max(
    1e-6,
    1e-4 * diagonalOf(bodies.flatMap((b) => (b.bounds ? [b.bounds] : [])))
  );
  const start = Date.now();
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      if (Date.now() - start > RELATION_BUDGET_MS) return { relations, truncated: true };
      const bi = bodies[i]?.bounds;
      const bj = bodies[j]?.bounds;
      if (bi && bj && aabbDisjoint(bi, bj, eps)) {
        relations.push({ a: i, b: j, relation: 'separate' });
        continue;
      }
      const si = solids[i];
      const sj = solids[j];
      if (!si || !sj) continue;
      const res = checkInterference(si, sj, eps);
      if (!isOk(res)) continue;
      relations.push({
        a: i,
        b: j,
        relation: res.value.hasInterference ? 'interfering' : 'separate',
        clearance: res.value.minDistance,
      });
    }
  }
  return { relations, truncated: false };
}

/**
 * Cylindrical features: the smallest substantial cylinder radius (bore/shaft; fillet strips excluded
 * by angular extent) and the internal bores (concave, detected by an outward-normal-vs-radial test).
 * The bore axis lets a later phase aim a section cut or anchor a feature mark.
 */
function computeCylinderFeatures(
  brep: BrepNs,
  shape: AnyShape
): { minRadius?: number; bores: BoreInfo[] } {
  const {
    getFaces,
    faceGeomType,
    pointOnSurface,
    normalAt,
    faceAxis,
    measureCurvatureAtMid,
    uvBounds,
    isOk,
  } = brep;
  const bores: BoreInfo[] = [];
  let minRadius: number | undefined;
  let faces;
  try {
    faces = getFaces(shape);
  } catch {
    return { bores };
  }
  for (const f of faces) {
    const geom = ((): string | null => {
      try {
        return faceGeomType(f);
      } catch {
        return null;
      }
    })();
    if (geom !== 'CYLINDRE') continue;
    const ax = faceAxis(f);
    if (!ax) continue;
    const curv = measureCurvatureAtMid(f);
    if (!isOk(curv)) continue;
    const k = Math.max(Math.abs(curv.value.maxCurvature), Math.abs(curv.value.minCurvature));
    if (k <= 0) continue;
    const radius = 1 / k;
    // Skip fillet/round strips — only a near-full cylinder is a bore/shaft worth sizing.
    try {
      const uv = uvBounds(f);
      if (uv.uMax - uv.uMin <= SUBSTANTIAL_USPAN) continue;
    } catch {
      continue;
    }
    minRadius = minRadius === undefined ? radius : Math.min(minRadius, radius);
    // Internal (bore) test: the outward material normal at the wall points toward the axis.
    // Sample the radial at a uv-mid wall point, not the face centroid — for a full cylinder the
    // centroid sits ON the axis, where the radial is degenerate and its sign is numerically
    // random (the recall bug from #1551). normalAt is already orientation-aware on occt-wasm.
    try {
      const o = ax.origin;
      const d = v3unit(ax.direction);
      const p = pointOnSurface(f, 0.5, 0.5);
      const rel = v3sub(p, o);
      const radial = v3unit(v3sub(rel, v3scale(d, v3dot(rel, d))));
      const n = v3unit(normalAt(f, p));
      if (v3dot(n, radial) < -BORE_DOT) {
        bores.push({ radius, axisOrigin: [o[0], o[1], o[2]], axisDir: [d[0], d[1], d[2]] });
      }
    } catch {
      // a kernel hiccup on one face shouldn't drop the rest
    }
  }
  return { ...(minRadius !== undefined ? { minRadius } : {}), bores };
}

/** Orchestrate the deterministic metrics for a verified shape. Never throws (caller wraps too). */
export function computeMetrics(brep: BrepNs, shape: AnyShape, solids: readonly Solid[]): Metrics {
  const bodies = computeBodies(brep, solids);
  const violations: string[] = [];
  bodies.forEach((b) => {
    if (b.volume <= VOL_EPS) violations.push(`body ${b.index} has ~zero volume (degenerate)`);
  });
  const manufacturability: VerifyManufacturability = { violations };

  // Cylindrical features (bores) — independent of body count.
  const feat = computeCylinderFeatures(brep, shape);
  if (feat.minRadius !== undefined) manufacturability.minRadius = feat.minRadius;
  if (feat.bores.length > 0) manufacturability.bores = feat.bores;

  if (bodies.length <= 1) return { manufacturability };
  if (bodies.length > MAX_BODIES) {
    manufacturability.relationsTruncated = true;
    return { bodies, manufacturability };
  }
  const { relations, truncated } = computeBodyRelations(brep, solids, bodies);
  if (truncated) manufacturability.relationsTruncated = true;
  return { bodies, bodyRelations: relations, manufacturability };
}
