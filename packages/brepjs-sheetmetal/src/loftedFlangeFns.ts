import {
  type Result,
  type Vec3,
  type Wire,
  type Solid,
  ok,
  err,
  validationError,
  line,
  wireLoop,
  extrude,
  face,
  fuse,
  isPlanarWire,
  isSolid,
  getSolids,
} from 'brepjs';
import type { LoftedFlangeFeature, LoftedFlangeSpec, SheetMetalPart } from './types.js';

type Pt2 = [number, number];

/**
 * Relative out-of-plane tolerance for the per-quad developability test: a quad is
 * twisted (non-developable) when its far corner sits off the diagonal-triangle plane
 * by more than this fraction of the quad's own size. Relative — not absolute — so a
 * genuinely flat quad is not false-flagged on a large part (numerical noise scales
 * with coordinates), nor a real twist missed on a tiny one.
 */
const DEVELOPABLE_REL_TOL = 1e-6;
/** Floor on the size scale so a degenerate (near-zero-size) quad keeps a sane tolerance. */
const DEVELOPABLE_MIN_SCALE = 1e-9;

/**
 * Author a lofted / ruled transition flange between two parallel OPEN profiles.
 * The two profiles are lofted (ruled, straight generators) into a transition surface
 * and thickened to a valid solid; the result is fused onto the part. The developed
 * pattern is produced by TRIANGULATION (the standard transition development): each
 * quad between consecutive vertex pairs is split into two triangles laid flat
 * edge-length-preserving and accumulated into a developed boundary.
 *
 * The triangulated development is EXACT (to tolerance) when the ruled surface is
 * developable — every quad is planar, so the two triangles share their diagonal in
 * 3D and the flat layout preserves all lengths and angles. When a quad is non-planar
 * (twisted ruling) the surface is not developable and the flat layout is an
 * approximation; {@link approximate} is set and the unfold emits a
 * `DEVELOPMENT_APPROXIMATE` warning.
 */
export function authorLoftedFlange(
  part: SheetMetalPart,
  spec: LoftedFlangeSpec
): Result<SheetMetalPart> {
  if (spec.id === '' || spec.id.includes('::')) {
    return err(
      validationError('INVALID_LOFTED_ID', `lofted flange id must be non-empty and must not contain '::', got '${spec.id}'`)
    );
  }
  for (const existing of part.loftedFlanges ?? []) {
    if (existing.id === spec.id) {
      return err(validationError('DUPLICATE_LOFTED', `duplicate lofted flange id '${spec.id}'`));
    }
  }
  if (spec.profileA.length < 2 || spec.profileB.length < 2) {
    return err(
      validationError('INVALID_LOFTED_PROFILE', `lofted flange '${spec.id}' profiles need ≥ 2 points each`)
    );
  }
  if (spec.profileA.length !== spec.profileB.length) {
    return err(
      validationError('PROFILE_VERTEX_MISMATCH', `lofted flange '${spec.id}' profiles must have equal vertex counts (${spec.profileA.length} vs ${spec.profileB.length}) to pair into ruling triangles`)
    );
  }
  if (!Number.isFinite(spec.height) || spec.height <= 0) {
    return err(validationError('INVALID_LOFTED_HEIGHT', `lofted flange '${spec.id}' height must be positive, got ${spec.height}`));
  }

  const thickness = spec.thickness ?? part.thickness;
  if (!Number.isFinite(thickness) || thickness <= 0) {
    return err(validationError('INVALID_THICKNESS', `lofted flange '${spec.id}' thickness must be positive`));
  }

  // 3D profile points: profileA in the z=0 plane, profileB at z=height.
  const a3: Vec3[] = spec.profileA.map(([x, y]) => [x, y, 0]);
  const b3: Vec3[] = spec.profileB.map(([x, y]) => [x, y, spec.height]);

  const solidResult = buildLoftedSolid(spec.id, a3, b3, thickness);
  if (!solidResult.ok) return solidResult;

  const dev = developRuled(a3, b3);
  const loopResult = closedLoopWire(dev.loop);
  if (!loopResult.ok) return loopResult;

  const feature: LoftedFlangeFeature = {
    id: spec.id,
    developedLoop: dev.loop,
    developedArea: dev.area,
    approximate: dev.approximate,
  };

  // The lofted transition is an independent body fused to the part; like a contour
  // flange it carries no straight-bend tree entry (its development is the
  // triangulated loop, not a rectilinear strip).
  if (part.solid === undefined) {
    return ok({
      ...part,
      solid: solidResult.value,
      loftedFlanges: [...(part.loftedFlanges ?? []), feature],
    });
  }
  const fused = fuse(part.solid, solidResult.value);
  if (!fused.ok) return fused;

  return ok({
    ...part,
    solid: normalize(fused.value),
    loftedFlanges: [...(part.loftedFlanges ?? []), feature],
  });
}

function normalize(shape: Solid): Solid {
  if (isSolid(shape)) return shape;
  const solids = getSolids(shape);
  return solids.length === 1 ? (solids[0] as Solid) : shape;
}

/**
 * Build the thickened ruled transition solid as the union of per-quad plates. Each
 * quad of the ruled surface is triangulated and each triangle extruded by
 * `thickness` along its own normal, then all plates are fused. This per-triangle
 * construction is robust on OCCT-WASM for both planar (developable) and twisted
 * (non-developable) transitions, where a single lofted-then-shelled surface can fail
 * to sew.
 */
function buildLoftedSolid(id: string, a: Vec3[], b: Vec3[], thickness: number): Result<Solid> {
  let solid: Solid | undefined;
  for (let i = 0; i + 1 < a.length; i += 1) {
    const a0 = a[i];
    const a1 = a[i + 1];
    const b0 = b[i];
    const b1 = b[i + 1];
    if (a0 === undefined || a1 === undefined || b0 === undefined || b1 === undefined) {
      return err(validationError('LOFTED_QUAD_FAILED', `lofted flange '${id}' failed to index quad ${i}`));
    }
    const plate = buildQuadPlate(id, a0, a1, b1, b0, thickness);
    if (!plate.ok) return plate;
    if (solid === undefined) {
      solid = plate.value;
    } else {
      const fused = fuse(solid, plate.value);
      if (!fused.ok) return fused;
      solid = normalize(fused.value);
    }
  }
  if (solid === undefined) {
    return err(validationError('LOFTED_EMPTY', `lofted flange '${id}' produced no quads`));
  }
  return ok(solid);
}

/**
 * One quad of the ruled surface (corners a0→a1→b1→b0), thickened into a plate. The
 * quad is split along its a0–b1 diagonal into two triangles lofted to the same
 * triangles offset by `thickness` along the quad normal — robust on a non-planar
 * (twisted) quad where a single planar face would fail. We loft each triangle face
 * pair; for the common planar quad this is exact, for a twisted quad it is the
 * faceted plate matching the triangulated development.
 */
function buildQuadPlate(id: string, a0: Vec3, a1: Vec3, b1: Vec3, b0: Vec3, thickness: number): Result<Solid> {
  const t1 = buildTrianglePlate(id, a0, a1, b1, thickness);
  if (!t1.ok) return t1;
  const t2 = buildTrianglePlate(id, a0, b1, b0, thickness);
  if (!t2.ok) return t2;
  const fused = fuse(t1.value, t2.value);
  if (!fused.ok) return fused;
  return ok(normalize(fused.value));
}

/** A flat triangle (p0,p1,p2) extruded by `thickness` along its own normal. */
function buildTrianglePlate(id: string, p0: Vec3, p1: Vec3, p2: Vec3, thickness: number): Result<Solid> {
  const e0 = line(p0, p1);
  const e1 = line(p1, p2);
  const e2 = line(p2, p0);
  const loopResult = wireLoop([e0, e1, e2]);
  if (!loopResult.ok) return loopResult;
  const loop = loopResult.value;
  if (!isPlanarWire(loop)) {
    return err(validationError('LOFTED_TRIANGLE_NONPLANAR', `lofted flange '${id}' triangle is not planar`));
  }
  const faceResult = face(loop);
  if (!faceResult.ok) return faceResult;
  const n = triangleNormal(p0, p1, p2);
  const dir: Vec3 = [n[0] * thickness, n[1] * thickness, n[2] * thickness];
  const extruded = extrude(faceResult.value, dir);
  if (!extruded.ok) return extruded;
  return ok(normalize(extruded.value));
}

function triangleNormal(p0: Vec3, p1: Vec3, p2: Vec3): Vec3 {
  const u: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const c: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(c[0], c[1], c[2]) || 1;
  return [c[0] / len, c[1] / len, c[2] / len];
}

interface Development {
  loop: Pt2[];
  area: number;
  approximate: boolean;
}

/**
 * Triangulated development of a ruled transition between two equal-length vertex
 * lists `a` (z=0) and `b` (z=height). Each quad (a[i],a[i+1],b[i+1],b[i]) is split
 * along the a[i]–b[i+1] diagonal into two triangles; the triangles are laid out
 * flat one strip at a time, hinging each new triangle onto the previously-placed
 * shared edge with its true 3D edge lengths preserved. The developed boundary is the
 * `a` chain laid along the bottom and the `b` chain returning along the top.
 *
 * Developable check: a quad is developable iff its two triangles, sharing the
 * diagonal, are coplanar — equivalently the far corner b[i] lies in the plane of
 * (a[i],a[i+1],b[i+1]). Any quad failing this within tolerance flags the whole
 * development approximate.
 */
function developRuled(a: Vec3[], b: Vec3[]): Development {
  const aFlat: Pt2[] = [];
  const bFlat: Pt2[] = [];
  let area = 0;
  let approximate = false;

  // Place the first ruling (a[0]–b[0]) vertically: a[0] at origin, b[0] straight up
  // by its true 3D length, so the developed strip grows along +x.
  const d0 = dist(a[0] as Vec3, b[0] as Vec3);
  let aPrev: Pt2 = [0, 0];
  let bPrev: Pt2 = [0, d0];
  aFlat.push(aPrev);
  bFlat.push(bPrev);

  for (let i = 0; i + 1 < a.length; i += 1) {
    const A0 = a[i] as Vec3;
    const A1 = a[i + 1] as Vec3;
    const B0 = b[i] as Vec3;
    const B1 = b[i + 1] as Vec3;

    // True 3D edge lengths of this quad. Diagonal A0–B1 splits it into
    // T1=(A0,A1,B1) and T2=(A0,B1,B0).
    const lBottom = dist(A0, A1); // A0→A1
    const lTop = dist(B0, B1); // B0→B1
    const lDiag = dist(A0, B1); // shared diagonal A0→B1
    const lRight = dist(A1, B1); // right ruling A1→B1 (= next quad's left ruling)

    // Developable test: is B0 coplanar with (A0, A1, B1)? If not, the quad is
    // twisted and the flat layout cannot preserve all edges — mark approximate.
    // Tolerance is relative to the quad's size so the check is scale-invariant.
    const scale = Math.max(lBottom, lTop, lDiag, lRight, DEVELOPABLE_MIN_SCALE);
    if (planeDistance(A0, A1, B1, B0) > DEVELOPABLE_REL_TOL * scale) approximate = true;

    // Place B1 from the known A0(=aPrev, dist=lDiag) and B0(=bPrev, dist=lTop).
    const b1Flat = placeFrom(aPrev, bPrev, lDiag, lTop);
    // Place A1 from A0(=aPrev, dist=lBottom) and the just-placed B1(dist=lRight),
    // preserving the right ruling so it equals the next quad's left ruling exactly.
    const a1Flat = placeFrom(aPrev, b1Flat, lBottom, lRight);

    aFlat.push(a1Flat);
    bFlat.push(b1Flat);

    area += triArea3(A0, A1, B1) + triArea3(A0, B1, B0);
    aPrev = a1Flat;
    bPrev = b1Flat;
  }

  // Developed boundary: a-chain forward, b-chain back.
  const loop: Pt2[] = [...aFlat, ...[...bFlat].reverse()];
  return { loop, area, approximate };
}

/**
 * Place a new point at distance `r1` from `p1` and `r2` from `p2` in 2D, choosing
 * the solution on the +x side of the directed line p1→p2 (the strip grows toward +x,
 * so successive rulings advance rightward). Falls back to the midpoint if the circles
 * do not intersect (degenerate strip).
 */
function placeFrom(p1: Pt2, p2: Pt2, r1: number, r2: number): Pt2 {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-12) return [p1[0] + r1, p1[1]];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const mx = p1[0] + (a * dx) / d;
  const my = p1[1] + (a * dy) / d;
  // Perpendicular toward +x: pick the offset whose x is larger.
  const ox = (-dy / d) * h;
  const oy = (dx / d) * h;
  const s1: Pt2 = [mx + ox, my + oy];
  const s2: Pt2 = [mx - ox, my - oy];
  return s1[0] >= s2[0] ? s1 : s2;
}

function dist(p: Vec3, q: Vec3): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function triArea3(p0: Vec3, p1: Vec3, p2: Vec3): number {
  const u: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const c: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return Math.hypot(c[0], c[1], c[2]) / 2;
}

/** Perpendicular distance of `q` from the plane through (p0,p1,p2). */
function planeDistance(p0: Vec3, p1: Vec3, p2: Vec3, q: Vec3): number {
  const u: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const c: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const len = Math.hypot(c[0], c[1], c[2]);
  if (len < 1e-12) return 0;
  const w: Vec3 = [q[0] - p0[0], q[1] - p0[1], q[2] - p0[2]];
  return Math.abs((w[0] * c[0] + w[1] * c[1] + w[2] * c[2]) / len);
}

/** Trace a closed developed-plane loop (≥ 3 points) into a brepjs {@link Wire}. */
function closedLoopWire(loop: Pt2[]): Result<Wire> {
  const deduped: Pt2[] = [];
  for (const p of loop) {
    const last = deduped[deduped.length - 1];
    if (last === undefined || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-9) deduped.push(p);
  }
  // Drop a trailing point coincident with the first (the loop closes implicitly).
  if (deduped.length > 1) {
    const first = deduped[0] as Pt2;
    const last = deduped[deduped.length - 1] as Pt2;
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) deduped.pop();
  }
  if (deduped.length < 3) {
    return err(validationError('LOFTED_LOOP_TOO_SMALL', `developed loop has ${deduped.length} points, need ≥ 3`));
  }
  const edges = [];
  for (let i = 0; i < deduped.length; i += 1) {
    const p = deduped[i] as Pt2;
    const next = deduped[(i + 1) % deduped.length] as Pt2;
    edges.push(line([p[0], p[1], 0], [next[0], next[1], 0]));
  }
  return wireLoop(edges);
}
