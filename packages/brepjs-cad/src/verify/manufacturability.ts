import type { AnyShape, Solid } from 'brepjs';
import type { BrepNs } from './brepjsRuntime.js';
import type { BodyInfo, BodyRelation, VerifyManufacturability } from './report.js';

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

/** Orchestrate the deterministic metrics for a verified shape. Never throws (caller wraps too). */
export function computeMetrics(brep: BrepNs, _shape: AnyShape, solids: readonly Solid[]): Metrics {
  const bodies = computeBodies(brep, solids);
  const violations: string[] = [];
  bodies.forEach((b) => {
    if (b.volume <= VOL_EPS) violations.push(`body ${b.index} has ~zero volume (degenerate)`);
  });
  const manufacturability: VerifyManufacturability = { violations };

  if (bodies.length <= 1) return { manufacturability };
  if (bodies.length > MAX_BODIES) {
    manufacturability.relationsTruncated = true;
    return { bodies, manufacturability };
  }
  const { relations, truncated } = computeBodyRelations(brep, solids, bodies);
  if (truncated) manufacturability.relationsTruncated = true;
  return { bodies, bodyRelations: relations, manufacturability };
}
