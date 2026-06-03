import {
  type Result,
  type Vec3,
  type Solid,
  type Face,
  ok,
  err,
  validationError,
  getFaces,
  getSurfaceType,
  pointOnSurface,
  normalAt,
  faceCenter,
  sharedEdges,
  measureArea,
  getBounds,
  isValid,
  vecAdd,
  vecSub,
  vecScale,
  vecDot,
  vecCross,
  vecLength,
  vecNormalize,
  line,
  wireLoop,
} from 'brepjs';
import type {
  UnfoldResult,
  FlatPattern,
  BendReport,
  SheetMetalWarning,
} from './types.js';
import { developedLength } from './allowanceFns.js';

/** Default neutral-axis K-factor for a purely geometric unfold (mid-surface). */
const DEFAULT_FOREIGN_K = 0.5;
/** Relative tolerance for the cylinder-fit residual (fraction of the radius). */
const FIT_RESIDUAL_TOL = 1e-2;
/** Absolute tolerance for matching parallel planes / coincident geometry. */
const GEOM_TOL = 1e-4;

/** A fitted cylinder recovered numerically from a face's sampled points + normals. */
export interface FittedCylinder {
  /** A point on the axis line. */
  axisOrigin: Vec3;
  /** Unit axis direction. */
  axisDir: Vec3;
  /** Fitted radius (mean distance from the axis line to the sampled points). */
  radius: number;
  /** Angular extent swept by the face about the axis, in radians. */
  angleSpan: number;
  /** Max relative residual of the fit (fraction of radius); small for a true cylinder. */
  residual: number;
}

interface Sample {
  point: Vec3;
  normal: Vec3;
}

/**
 * Sample a regular grid of surface points and their normals across the face's UV
 * bounds. `pointOnSurface` takes normalized (0-1) UV; `normalAt` re-projects the
 * sampled point to UV internally, so the pair holds for true cylinders/planes but
 * is not an exact-UV guarantee for degenerate parameterizations.
 */
function sampleFace(face: Face, n: number): Sample[] {
  const samples: Sample[] = [];
  for (let i = 0; i < n; i += 1) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    for (let j = 0; j < n; j += 1) {
      const v = n === 1 ? 0.5 : j / (n - 1);
      const point = pointOnSurface(face, u, v);
      const normal = normalAt(face, point);
      const len = vecLength(normal);
      if (len < GEOM_TOL) continue;
      samples.push({ point, normal: vecScale(normal, 1 / len) });
    }
  }
  return samples;
}

/**
 * Numerically fit a cylinder to a face.
 *
 * Every normal of a cylinder is perpendicular to the axis, so the axis direction
 * is the common perpendicular of the sampled normals: it is recovered as the
 * sign-aligned average of the cross products of pairs of non-parallel sampled
 * normals (each such cross product lies along ±axis). The axis LINE and RADIUS
 * are then found by projecting the sample points onto the plane ⟂ axis and
 * fitting a circle (algebraic least squares); the radius is the mean distance
 * from the axis line to the points. The angular span is the extent of the
 * projected points about the fitted centre. Returns `null` when the surface
 * does not fit a cylinder within {@link FIT_RESIDUAL_TOL}.
 */
export function fitCylinder(face: Face): FittedCylinder | null {
  const surf = getSurfaceType(face);
  if (!surf.ok || surf.value !== 'CYLINDRE') return null;

  const samples = sampleFace(face, 6);
  if (samples.length < 4) return null;

  const axisDir = axisFromNormals(samples.map((s) => s.normal));
  if (axisDir === null) return null;

  // Project points onto the plane ⟂ axis (in a local 2D basis) and fit a circle.
  const basis = perpBasis(axisDir);
  const pts2: [number, number][] = samples.map((s) => [
    vecDot(s.point, basis.e1),
    vecDot(s.point, basis.e2),
  ]);
  const circle = fitCircle2(pts2);
  if (circle === null) return null;

  // Lift the 2D centre back to a 3D point on the axis: use the axial component of
  // an arbitrary sample so the origin sits at a real location on the face.
  const axial = vecDot(samples[0]?.point ?? [0, 0, 0], axisDir);
  const axisOrigin = vecAdd(
    vecAdd(vecScale(basis.e1, circle.cx), vecScale(basis.e2, circle.cy)),
    vecScale(axisDir, axial)
  );

  // Radius = mean distance from the axis line to the sampled points; residual is
  // the max relative deviation from that radius (a true cylinder is near zero).
  let sumR = 0;
  for (const s of samples) sumR += distanceToAxis(s.point, axisOrigin, axisDir);
  const radius = sumR / samples.length;
  if (radius < GEOM_TOL) return null;
  let maxDev = 0;
  for (const s of samples) {
    const d = distanceToAxis(s.point, axisOrigin, axisDir);
    maxDev = Math.max(maxDev, Math.abs(d - radius));
  }
  const residual = maxDev / radius;
  if (residual > FIT_RESIDUAL_TOL) return null;

  const angleSpan = angularExtent(pts2, circle.cx, circle.cy);
  return { axisOrigin, axisDir, radius, angleSpan, residual };
}

/**
 * Axis direction as the common perpendicular of the cylinder normals: average the
 * cross products of pairs of sufficiently non-parallel normals, aligning each to a
 * consistent hemisphere before summing so they don't cancel. Returns `null` if no
 * pair is non-parallel (a degenerate/near-planar sample).
 */
function axisFromNormals(normals: Vec3[]): Vec3 | null {
  let acc: Vec3 = [0, 0, 0];
  let ref: Vec3 | null = null;
  for (let i = 0; i < normals.length; i += 1) {
    for (let j = i + 1; j < normals.length; j += 1) {
      const a = normals[i];
      const b = normals[j];
      if (a === undefined || b === undefined) continue;
      const c = vecCross(a, b);
      const len = vecLength(c);
      if (len < 1e-3) continue;
      let unit = vecScale(c, 1 / len);
      if (ref === null) ref = unit;
      else if (vecDot(unit, ref) < 0) unit = vecScale(unit, -1);
      acc = vecAdd(acc, unit);
    }
  }
  if (vecLength(acc) < GEOM_TOL) return null;
  return vecNormalize(acc);
}

/** An orthonormal pair spanning the plane perpendicular to `axis`. */
function perpBasis(axis: Vec3): { e1: Vec3; e2: Vec3 } {
  const seed: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = vecNormalize(vecCross(axis, seed));
  const e2 = vecNormalize(vecCross(axis, e1));
  return { e1, e2 };
}

/** Perpendicular distance from `p` to the line through `o` with unit direction `d`. */
function distanceToAxis(p: Vec3, o: Vec3, d: Vec3): number {
  const w = vecSub(p, o);
  const along = vecDot(w, d);
  const perp = vecSub(w, vecScale(d, along));
  return vecLength(perp);
}

/** Algebraic (Kåsa) least-squares circle fit to 2D points. */
function fitCircle2(pts: [number, number][]): { cx: number; cy: number; r: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  }
  // Solve the normal equations for [A, B, C] in A·x + B·y + C = z (= x²+y²).
  const m = [
    [sxx, sxy, sx],
    [sxy, syy, sy],
    [sx, sy, n],
  ];
  const rhs = [sxz, syz, sz];
  const sol = solve3(m, rhs);
  if (sol === null) return null;
  const [a, b, c] = sol;
  const cx = a / 2;
  const cy = b / 2;
  const r2 = c + cx * cx + cy * cy;
  if (r2 <= 0) return null;
  return { cx, cy, r: Math.sqrt(r2) };
}

/** Solve a 3×3 linear system by Cramer's rule; `null` if (near-)singular. */
function solve3(m: number[][], rhs: number[]): [number, number, number] | null {
  const det = det3(m);
  if (Math.abs(det) < 1e-12) return null;
  const mx = [
    [rhs[0] ?? 0, m[0]?.[1] ?? 0, m[0]?.[2] ?? 0],
    [rhs[1] ?? 0, m[1]?.[1] ?? 0, m[1]?.[2] ?? 0],
    [rhs[2] ?? 0, m[2]?.[1] ?? 0, m[2]?.[2] ?? 0],
  ];
  const my = [
    [m[0]?.[0] ?? 0, rhs[0] ?? 0, m[0]?.[2] ?? 0],
    [m[1]?.[0] ?? 0, rhs[1] ?? 0, m[1]?.[2] ?? 0],
    [m[2]?.[0] ?? 0, rhs[2] ?? 0, m[2]?.[2] ?? 0],
  ];
  const mz = [
    [m[0]?.[0] ?? 0, m[0]?.[1] ?? 0, rhs[0] ?? 0],
    [m[1]?.[0] ?? 0, m[1]?.[1] ?? 0, rhs[1] ?? 0],
    [m[2]?.[0] ?? 0, m[2]?.[1] ?? 0, rhs[2] ?? 0],
  ];
  return [det3(mx) / det, det3(my) / det, det3(mz) / det];
}

function det3(m: number[][]): number {
  const a = m[0] ?? [];
  const b = m[1] ?? [];
  const c = m[2] ?? [];
  return (
    (a[0] ?? 0) * ((b[1] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[1] ?? 0)) -
    (a[1] ?? 0) * ((b[0] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[0] ?? 0)) +
    (a[2] ?? 0) * ((b[0] ?? 0) * (c[1] ?? 0) - (b[1] ?? 0) * (c[0] ?? 0))
  );
}

/** Angular extent (radians) spanned by 2D points about a centre. */
function angularExtent(pts: [number, number][], cx: number, cy: number): number {
  const angles = pts.map(([x, y]) => Math.atan2(y - cy, x - cx)).sort((a, b) => a - b);
  if (angles.length < 2) return 0;
  // Largest gap between consecutive sorted angles (wrapping); the span is 2π minus it.
  let maxGap = (angles[0] ?? 0) + 2 * Math.PI - (angles[angles.length - 1] ?? 0);
  for (let i = 1; i < angles.length; i += 1) {
    maxGap = Math.max(maxGap, (angles[i] ?? 0) - (angles[i - 1] ?? 0));
  }
  return 2 * Math.PI - maxGap;
}

// ---------------------------------------------------------------------------
// Foreign-solid unfold
// ---------------------------------------------------------------------------

/** A detected flat panel: a pair of large parallel planar faces a thickness apart. */
interface DetectedFlat {
  id: string;
  /** The two parallel planar faces (outer + inner) of the panel. */
  faces: [Face, Face];
  /** Mid-surface plane normal (unit). */
  normal: Vec3;
  /** Centroid of the mid-surface. */
  center: Vec3;
  /** Mid-surface area (mean of the two face areas). */
  area: number;
}

/** A detected bend: a pair of coaxial inner/outer cylindrical faces. */
interface DetectedBend {
  id: string;
  faces: Face[];
  fit: FittedCylinder;
  /** Inner radius (smaller of the fitted pair). */
  innerRadius: number;
  /** Swept angle in degrees. */
  angleDeg: number;
}

/**
 * Unfold an ARBITRARY imported sheet-metal solid with no feature tree, by
 * detecting its geometry numerically. The supported class is roughly-uniform-
 * thickness solids whose panels are planar and whose bends are cylindrical:
 *
 * 1. Classify faces by surface type — planar faces are panel faces, cylindrical
 *    faces are bend faces. Any other surface type is reported `UNSUPPORTED_FACE`.
 * 2. Pair the two large parallel planar faces of each flat panel (a thickness
 *    apart); pair the inner/outer cylindrical faces of each bend and fit its
 *    axis + inner radius + swept angle via {@link fitCylinder}.
 * 3. Build a bend graph (flats = nodes; a bend connects the two flats it shares
 *    edges with), take a spanning tree from a root flat, and turn any non-tree
 *    bend into a seam cut (warned).
 * 4. Walk the tree replacing each cylindrical bend region with a developed strip
 *    of length `developedLength(angle, thickness, { innerRadius, kFactor })`
 *    (`kFactor` defaults to the {@link DEFAULT_FOREIGN_K} mid-surface), laying
 *    each flat out into the plane. Bend direction (up/down) is read from the
 *    cylinder centre relative to the parent flat.
 *
 * Non-fatal warnings ride inside the Ok payload; the function fails only when the
 * input is not a recognizable sheet-metal solid at all.
 */
export function unfoldForeignSolid(
  solid: Solid,
  opts?: { kFactor?: number | undefined }
): Result<UnfoldResult> {
  if (!isValid(solid)) {
    return err(validationError('INVALID_SOLID', 'foreign solid is not a valid B-rep'));
  }
  const kFactor = opts?.kFactor ?? DEFAULT_FOREIGN_K;
  if (!Number.isFinite(kFactor) || kFactor < 0 || kFactor > 1) {
    return err(validationError('INVALID_K_FACTOR', `kFactor must be in [0, 1], got ${kFactor}`));
  }

  const warnings: SheetMetalWarning[] = [];
  const faces = getFaces<'3D'>(solid);
  if (faces.length === 0) {
    return err(validationError('EMPTY_SOLID', 'foreign solid has no faces'));
  }

  const planarFaces: Face[] = [];
  const cylFaces: Face[] = [];
  for (const face of faces) {
    const t = getSurfaceType(face);
    if (!t.ok) {
      warnings.push({ code: 'UNSUPPORTED_FACE', message: 'failed to read a face surface type; skipping' });
      continue;
    }
    if (t.value === 'PLANE') planarFaces.push(face);
    else if (t.value === 'CYLINDRE') cylFaces.push(face);
    else {
      warnings.push({
        code: 'UNSUPPORTED_FACE',
        message: `UNSUPPORTED_FACE: surface type '${t.value}' is not a planar panel or cylindrical bend; the unfold ignores it and may be incomplete`,
      });
    }
  }

  const thicknessResult = detectThickness(planarFaces);
  if (!thicknessResult.ok) return thicknessResult;
  const thickness = thicknessResult.value;

  const flats = pairFlats(planarFaces, thickness, warnings);
  if (flats.length === 0) {
    return err(
      validationError('NO_FLATS', 'no planar panel pairs detected; not a recognizable sheet-metal solid')
    );
  }

  const bends = pairBends(cylFaces, warnings);

  const graph = buildBendGraph(flats, bends, warnings);
  const layout = layoutForeign(flats, graph, thickness, kFactor, warnings);
  if (!layout.ok) return layout;

  return ok({ pattern: layout.value.pattern, report: layout.value.report, warnings });
}

/**
 * Detect the sheet thickness as the smallest gap between an antiparallel pair of
 * planar faces (the two faces of one flat panel). For a roughly-uniform-thickness
 * part this gap is the same across panels; a spread beyond tolerance warns.
 */
function detectThickness(planar: Face[]): Result<number> {
  const gaps: number[] = [];
  for (let i = 0; i < planar.length; i += 1) {
    for (let j = i + 1; j < planar.length; j += 1) {
      const fa = planar[i];
      const fb = planar[j];
      if (fa === undefined || fb === undefined) continue;
      const na = faceNormal(fa);
      const nb = faceNormal(fb);
      if (vecDot(na, nb) > -0.99) continue; // need antiparallel (opposite faces of a panel)
      const ca = faceCenter(fa);
      const cb = faceCenter(fb);
      const gap = Math.abs(vecDot(vecSub(cb, ca), na));
      if (gap > GEOM_TOL) gaps.push(gap);
    }
  }
  if (gaps.length === 0) {
    return err(validationError('NO_THICKNESS', 'could not detect a sheet thickness (no opposed planar pair)'));
  }
  gaps.sort((a, b) => a - b);
  return ok(gaps[0] as number);
}

/**
 * Pair planar faces into flat panels: each panel is two parallel faces a
 * `thickness` apart with overlapping footprints. Greedy nearest-match by gap.
 */
function pairFlats(planar: Face[], thickness: number, warnings: SheetMetalWarning[]): DetectedFlat[] {
  const used = new Set<number>();
  const flats: DetectedFlat[] = [];
  for (let i = 0; i < planar.length; i += 1) {
    if (used.has(i)) continue;
    const fa = planar[i];
    if (fa === undefined) continue;
    const na = faceNormal(fa);
    const ca = faceCenter(fa);
    let best = -1;
    let bestErr = Infinity;
    for (let j = 0; j < planar.length; j += 1) {
      if (j === i || used.has(j)) continue;
      const fb = planar[j];
      if (fb === undefined) continue;
      const nb = faceNormal(fb);
      if (vecDot(na, nb) > -0.99) continue;
      const cb = faceCenter(fb);
      const gap = Math.abs(vecDot(vecSub(cb, ca), na));
      const e = Math.abs(gap - thickness);
      if (e < bestErr) {
        bestErr = e;
        best = j;
      }
    }
    if (best < 0 || bestErr > thickness * 0.5 + GEOM_TOL) {
      // No usable antiparallel partner at the sheet thickness. A bend-edge cap or
      // rim band is plate-thin in one in-plane direction (≈ thickness) — expected,
      // skip quietly. A face that is wide in BOTH in-plane directions is a real
      // panel; dropping it means non-uniform thickness or unrecognised topology, so
      // flag it. (Area alone can't tell them apart — a long rim is large by area.)
      const db = getBounds(fa);
      const ext = [db.xMax - db.xMin, db.yMax - db.yMin, db.zMax - db.zMin].sort((p, q) => q - p);
      const inPlaneMin = ext[1] ?? 0;
      if (inPlaneMin > thickness * 4) {
        warnings.push({
          code: 'DETECTION_INCOMPLETE',
          message: `a panel-sized planar face (${(ext[0] ?? 0).toFixed(1)}×${inPlaneMin.toFixed(1)}) has no opposite face at the sheet thickness ${thickness.toFixed(3)}; omitted (possible non-uniform thickness)`,
        });
      }
      continue;
    }
    const fb = planar[best] as Face;
    used.add(i);
    used.add(best);
    const areaA = measureArea(fa);
    const areaB = measureArea(fb);
    let area: number;
    if (areaA.ok && areaB.ok) area = (areaA.value + areaB.value) / 2;
    else if (areaA.ok) area = areaA.value;
    else if (areaB.ok) area = areaB.value;
    else {
      // Neither face area is measurable: fall back to the panel's bounding-box
      // footprint so developedArea isn't silently zero, and flag the estimate.
      const b = getBounds(fa);
      const dx = b.xMax - b.xMin;
      const dy = b.yMax - b.yMin;
      const dz = b.zMax - b.zMin;
      area = Math.max(dx * dy, dy * dz, dx * dz);
      warnings.push({
        code: 'DETECTION_INCOMPLETE',
        message: `flat-${flats.length}: face area unmeasurable; using a bounding-box estimate (${area.toFixed(2)})`,
      });
    }
    flats.push({
      id: `flat-${flats.length}`,
      faces: [fa, fb],
      normal: na,
      center: vecScale(vecAdd(ca, faceCenter(fb)), 0.5),
      area,
    });
  }
  if (flats.length === 0 && planar.length > 0) {
    warnings.push({
      code: 'DETECTION_INCOMPLETE',
      message: 'no parallel planar face pairs matched the detected thickness; the part may have non-uniform thickness',
    });
  }
  return flats;
}

/**
 * Pair cylindrical faces into bends: each bend has an inner + outer coaxial face
 * (same axis, radii a thickness apart) or, failing a pair, a single fitted face.
 */
function pairBends(cyl: Face[], warnings: SheetMetalWarning[]): DetectedBend[] {
  interface Fitted {
    face: Face;
    fit: FittedCylinder;
  }
  const fitted: Fitted[] = [];
  for (const face of cyl) {
    const fit = fitCylinder(face);
    if (fit === null) {
      warnings.push({
        code: 'UNSUPPORTED_FACE',
        message: 'a cylindrical face did not fit a cylinder within tolerance; the bend is ignored',
      });
      continue;
    }
    fitted.push({ face, fit });
  }

  const used = new Set<number>();
  const bends: DetectedBend[] = [];
  for (let i = 0; i < fitted.length; i += 1) {
    if (used.has(i)) continue;
    const a = fitted[i];
    if (a === undefined) continue;
    let mate = -1;
    for (let j = i + 1; j < fitted.length; j += 1) {
      if (used.has(j)) continue;
      const b = fitted[j];
      if (b === undefined) continue;
      if (Math.abs(vecDot(a.fit.axisDir, b.fit.axisDir)) < 0.99) continue;
      if (distanceToAxis(b.fit.axisOrigin, a.fit.axisOrigin, a.fit.axisDir) > GEOM_TOL * 10) continue;
      mate = j;
      break;
    }
    const faces: Face[] = [a.face];
    let innerRadius = a.fit.radius;
    let fit = a.fit;
    if (mate >= 0) {
      const b = fitted[mate] as Fitted;
      faces.push(b.face);
      innerRadius = Math.min(a.fit.radius, b.fit.radius);
      fit = a.fit.radius <= b.fit.radius ? a.fit : b.fit;
      used.add(mate);
    }
    used.add(i);
    bends.push({
      id: `bend-${bends.length}`,
      faces,
      fit,
      innerRadius,
      angleDeg: (fit.angleSpan * 180) / Math.PI,
    });
  }
  return bends;
}

interface BendGraphEdge {
  bend: DetectedBend;
  flats: [number, number];
}

interface BendGraph {
  edges: BendGraphEdge[];
}

/**
 * Connect bends to the flats they touch: a bend's cylindrical face shares edges
 * with exactly the two flats tangent to it. A bend that touches fewer than two
 * detected flats is dropped (it is a free rim); more than two is ambiguous and
 * warned. Spanning-tree / seam handling happens in {@link layoutForeign}.
 */
function buildBendGraph(
  flats: DetectedFlat[],
  bends: DetectedBend[],
  warnings: SheetMetalWarning[]
): BendGraph {
  const edges: BendGraphEdge[] = [];
  for (const bend of bends) {
    const touching: number[] = [];
    for (let fi = 0; fi < flats.length; fi += 1) {
      const flat = flats[fi];
      if (flat === undefined) continue;
      if (bendTouchesFlat(bend, flat)) touching.push(fi);
    }
    if (touching.length < 2) {
      warnings.push({
        code: 'DETECTION_INCOMPLETE',
        message: `bend '${bend.id}' connects ${touching.length} flats (expected 2); ignored`,
        featureId: bend.id,
      });
      continue;
    }
    if (touching.length > 2) {
      warnings.push({
        code: 'DETECTION_INCOMPLETE',
        message: `bend '${bend.id}' touches ${touching.length} flats; using the first two`,
        featureId: bend.id,
      });
    }
    edges.push({ bend, flats: [touching[0] as number, touching[1] as number] });
  }
  return { edges };
}

/** True if any of the bend's faces shares an edge with either face of the flat. */
function bendTouchesFlat(bend: DetectedBend, flat: DetectedFlat): boolean {
  for (const bf of bend.faces) {
    for (const ff of flat.faces) {
      if (sharedEdges(bf, ff).length > 0) return true;
    }
  }
  return false;
}

interface ForeignLayout {
  pattern: FlatPattern;
  report: BendReport;
}

/**
 * Lay out detected flats into the developed plane. A spanning tree over the bend
 * graph (BFS from flat 0) places each flat as a rectangle and each tree bend as a
 * developed strip; non-tree bends become seam cuts (warned). The developed area
 * is the sum of flat mid-surface areas plus each developed-strip area, computed
 * directly from detected geometry. Bend direction is read from the cylinder
 * centre relative to the parent flat's outward normal.
 */
function layoutForeign(
  flats: DetectedFlat[],
  graph: BendGraph,
  thickness: number,
  kFactor: number,
  warnings: SheetMetalWarning[]
): Result<ForeignLayout> {
  const adjacency = new Map<number, BendGraphEdge[]>();
  for (let i = 0; i < flats.length; i += 1) adjacency.set(i, []);
  for (const e of graph.edges) {
    adjacency.get(e.flats[0])?.push(e);
    adjacency.get(e.flats[1])?.push(e);
  }

  const visited = new Set<number>([0]);
  const treeEdges = new Set<BendGraphEdge>();
  const treeBends: { edge: BendGraphEdge; parent: number; child: number }[] = [];
  const queue: number[] = [0];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur === undefined) break;
    for (const e of adjacency.get(cur) ?? []) {
      if (treeEdges.has(e)) continue;
      const next = e.flats[0] === cur ? e.flats[1] : e.flats[0];
      if (visited.has(next)) continue;
      visited.add(next);
      treeEdges.add(e);
      treeBends.push({ edge: e, parent: cur, child: next });
      queue.push(next);
    }
  }

  for (const e of graph.edges) {
    if (treeEdges.has(e)) continue;
    warnings.push({
      code: 'SEAM_CUT',
      message: `closed profile: bend '${e.bend.id}' becomes a seam cut`,
      featureId: e.bend.id,
    });
  }

  // Each bend's strip width = the bend cylinder's axial extent (its span).
  const bendSpan = new Map<DetectedBend, number>();
  for (const e of graph.edges) bendSpan.set(e.bend, bendAxialExtent(e.bend));

  // 2D placement: develop each flat into the plane preserving its real fold
  // direction (perpendicular to the bend axis), so an L-bracket lays out L-shaped,
  // not collapsed into a straight chain. Each placed flat carries a consistent
  // 3D→2D affine map (`m2`): a 3D point on the flat's plane maps to 2D via its
  // in-plane basis, so the bend line, edges and develop-out direction are all
  // derived in 3D then mapped to 2D — keeping signs/edges consistent. The root is
  // laid at the origin; a child is placed past its developed strip, out from the
  // shared bend line. The developed AREA is geometry-exact (Σ flat mid-surface
  // areas + Σ developed-strip areas).
  const placed = new Map<number, PlacedFlat>();
  const root = flats[0] as DetectedFlat;
  const rootAxis = treeBends[0]?.edge.bend.fit.axisDir ?? perpBasis(root.normal).e1;
  const rootBasis = planeBasis(root.normal, rootAxis);
  placed.set(0, {
    flat: root,
    a: rootBasis.along,
    b: rootBasis.out,
    o3: root.center,
    o2: [0, 0],
    a2: [1, 0],
    b2: [0, 1],
  });

  let developedArea = 0;
  for (const f of flats) developedArea += f.area;

  const bendReportRows: BendReport['bends'] = [];
  const rects: Rect2[] = [];
  const bendLines: FlatPattern['bendLines'] = [];
  rects.push(flatRect2(placed.get(0) as PlacedFlat));

  for (const tb of treeBends) {
    const bend = tb.edge.bend;
    const dev = developedLength(bend.angleDeg, thickness, { innerRadius: bend.innerRadius, kFactor }, (w) => warnings.push(w));
    if (!dev.ok) return dev;
    const parentPlace = placed.get(tb.parent);
    const parent = flats[tb.parent] as DetectedFlat;
    const child = flats[tb.child] as DetectedFlat;
    if (parentPlace === undefined) continue;
    const direction = bendDirection(bend, parent);
    const axis = bend.fit.axisDir;
    const span = bendSpan.get(bend) ?? bendAxialExtent(bend);

    const placement = placeChildFlat(parentPlace, child, bend, axis, span, dev.value);
    placed.set(tb.child, placement.child);

    rects.push(placement.strip);
    rects.push(flatRect2(placement.child));
    bendLines.push({
      id: bend.id,
      line: line([placement.bendA[0], placement.bendA[1], 0], [placement.bendB[0], placement.bendB[1], 0]),
      angleDeg: bend.angleDeg,
      direction,
      inward: [-placement.outDir2[0], -placement.outDir2[1]],
    });
    developedArea += dev.value * span;

    bendReportRows.push({
      id: bend.id,
      angleDeg: bend.angleDeg,
      radius: bend.innerRadius,
      allowance: dev.value,
      flatLength: placement.runLen,
      direction,
    });
  }

  const bbox = aabb2(rects);
  const outline = buildRectOutline2(bbox);
  const outlineWire = wireLoop(outline);
  if (!outlineWire.ok) return outlineWire;

  const pattern: FlatPattern = {
    outline: outlineWire.value,
    bendLines,
    holes: [],
    formCuts: [],
    formMarkers: [],
    formHinges: [],
    loftedDevelopments: [],
    developedArea,
  };
  const report: BendReport = {
    bends: bendReportRows,
    totalFlatSize: [bbox.x1 - bbox.x0, bbox.y1 - bbox.y0],
  };
  return ok({ pattern, report });
}

/**
 * A placed flat: its detected geometry plus a consistent 3D→2D affine map. A 3D
 * point P on the flat's plane maps to `o2 + (P−o3)·a · a2 + (P−o3)·b · b2`, where
 * (a, b) is the flat's in-plane 3D basis and (a2, b2) the 2D images of those axes.
 */
interface PlacedFlat {
  flat: DetectedFlat;
  a: Vec3;
  b: Vec3;
  o3: Vec3;
  o2: [number, number];
  a2: [number, number];
  b2: [number, number];
}

interface Rect2 {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Map a 3D in-plane point through a placed flat's affine map. */
function mapPoint(p: PlacedFlat, point: Vec3): [number, number] {
  const da = vecDot(vecSub(point, p.o3), p.a);
  const db = vecDot(vecSub(point, p.o3), p.b);
  return [p.o2[0] + da * p.a2[0] + db * p.b2[0], p.o2[1] + da * p.a2[1] + db * p.b2[1]];
}

/** 3D in-plane basis of a flat: `along` parallel to `axis`, `out` perpendicular. */
function planeBasis(normal: Vec3, axis: Vec3): { along: Vec3; out: Vec3 } {
  const proj = vecSub(axis, vecScale(normal, vecDot(axis, normal)));
  const along = vecLength(proj) > GEOM_TOL ? vecNormalize(proj) : perpBasis(normal).e1;
  const out = vecNormalize(vecCross(normal, along));
  return { along, out };
}

/** AABB rectangle of a placed flat in 2D (mapping its mid-surface sample corners). */
function flatRect2(p: PlacedFlat): Rect2 {
  const samples = sampleFace(p.flat.faces[0], 4);
  const pts2 = samples.map((s) => mapPoint(p, s.point));
  return rectFrom(pts2);
}

interface ChildPlacement {
  child: PlacedFlat;
  strip: Rect2;
  bendA: [number, number];
  bendB: [number, number];
  outDir2: [number, number];
  runLen: number;
}

/**
 * Place a child flat past its developed bend strip. The shared bend line is the
 * bend axis projected into the parent's plane; the child develops `out` from it on
 * the side away from the parent. Both the bend line and the develop-out direction
 * are computed in 3D then mapped to 2D through the parent's affine map, so the 2D
 * placement stays consistent with the real geometry regardless of basis sign.
 */
function placeChildFlat(
  parent: PlacedFlat,
  childFlat: DetectedFlat,
  bend: DetectedBend,
  axis: Vec3,
  span: number,
  dev: number
): ChildPlacement {
  // In-plane bend axis direction (the strip-width direction).
  const axisInPlane = vecNormalize(
    vecSub(axis, vecScale(parent.flat.normal, vecDot(axis, parent.flat.normal)))
  );
  // The shared bend line is where the bend meets the parent: the bend axis line
  // projected onto the parent plane, positioned over the parent/child along-axis
  // overlap (the fit's axial origin is arbitrary, so the line is placed by the
  // parent's footprint, not the fit point). Its mid-point along the axis is the
  // centre of the parent footprint along the axis; it spans `span` (the bend's
  // axial extent).
  const axisLineMid = projectToPlane(bend.fit.axisOrigin, parent.flat.normal, parent.o3);
  const lineMid = parentFootprintCentreAlong(parent, axisInPlane, axisLineMid);
  const toBend = vecSub(axisLineMid, parent.flat.center);
  let outDir3 = vecSub(toBend, vecScale(axisInPlane, vecDot(toBend, axisInPlane)));
  if (vecLength(outDir3) < GEOM_TOL) outDir3 = vecNormalize(vecCross(parent.flat.normal, axisInPlane));
  else outDir3 = vecNormalize(outDir3);

  const bend3A = vecSub(lineMid, vecScale(axisInPlane, span / 2));
  const bend3B = vecAdd(lineMid, vecScale(axisInPlane, span / 2));
  const bendA = mapPoint(parent, bend3A);
  const bendB = mapPoint(parent, bend3B);

  // 2D develop-out direction = image of `outDir3`; 2D along = image of axisInPlane.
  const outBase2 = mapPoint(parent, vecAdd(lineMid, outDir3));
  const lineMid2 = mapPoint(parent, lineMid);
  const outDir2 = unit2([outBase2[0] - lineMid2[0], outBase2[1] - lineMid2[1]]);
  const along2 = unit2([bendB[0] - bendA[0], bendB[1] - bendA[1]]);

  const stripFarA: [number, number] = [bendA[0] + outDir2[0] * dev, bendA[1] + outDir2[1] * dev];
  const childBasis = planeBasis(childFlat.normal, axis);
  const runLen = inPlaneRun(childFlat, childBasis.out);

  // The child's 2D frame: origin maps the child corner that develops onto
  // `stripFarA` — the corner at minimum bend-axis position (the bend-line start)
  // and minimum run (nearest the bend). `a2`=along2, `b2`=outDir2. Its 3D basis
  // `a`=axisInPlane (shared bend axis, oriented to match `along2`), `b`=child run
  // direction pointing away from the bend.
  const childRunDir = runDirectionAway(childFlat, childBasis.out, bend.fit.axisOrigin);
  const child: PlacedFlat = {
    flat: childFlat,
    a: axisInPlane,
    b: childRunDir,
    o3: childNearCorner(childFlat, axisInPlane, childRunDir),
    o2: stripFarA,
    a2: along2,
    b2: outDir2,
  };
  const stripFarB: [number, number] = [bendB[0] + outDir2[0] * dev, bendB[1] + outDir2[1] * dev];
  const strip = rectFrom([bendA, bendB, stripFarA, stripFarB]);
  return { child, strip, bendA, bendB, outDir2, runLen };
}

/** Project a point onto a plane (point `o`, unit normal `n`). */
function projectToPlane(p: Vec3, n: Vec3, o: Vec3): Vec3 {
  return vecSub(p, vecScale(n, vecDot(vecSub(p, o), n)));
}

/**
 * A point on the parent plane at the centre of the parent's footprint along the
 * bend axis, keeping the bend's out-position (so the bend line sits on the parent's
 * edge but is centred over the parent's along-extent). This pins the bend line to
 * the parent footprint rather than the fit's arbitrary axial origin.
 */
function parentFootprintCentreAlong(parent: PlacedFlat, axisInPlane: Vec3, axisRef: Vec3): Vec3 {
  const samples = sampleFace(parent.flat.faces[0], 4);
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    const v = vecDot(s.point, axisInPlane);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const mid = (min + max) / 2;
  const refAlong = vecDot(axisRef, axisInPlane);
  return vecAdd(axisRef, vecScale(axisInPlane, mid - refAlong));
}

/** In-plane run extent of a flat along `out` (perpendicular to the bend axis). */
function inPlaneRun(flat: DetectedFlat, out: Vec3): number {
  const samples = sampleFace(flat.faces[0], 4);
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    const v = vecDot(s.point, out);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return Number.isFinite(max - min) ? max - min : 0;
}

/** Run direction of a child flat pointing away from the bend axis. */
function runDirectionAway(flat: DetectedFlat, out: Vec3, axisOrigin: Vec3): Vec3 {
  const toCenter = vecSub(flat.center, axisOrigin);
  return vecDot(toCenter, out) >= 0 ? out : vecScale(out, -1);
}

/**
 * The child corner that develops onto the strip-far near point: minimum along the
 * (oriented) bend axis and minimum along the run (nearest the bend). Searched over
 * the in-plane bounds so `(P−o3)·a ∈ [0, span]` and `(P−o3)·b ∈ [0, runLen]`.
 */
function childNearCorner(flat: DetectedFlat, axis: Vec3, run: Vec3): Vec3 {
  const samples = sampleFace(flat.faces[0], 4);
  let minAxis = Infinity;
  let minRun = Infinity;
  for (const s of samples) {
    minAxis = Math.min(minAxis, vecDot(s.point, axis));
    minRun = Math.min(minRun, vecDot(s.point, run));
  }
  // Reconstruct the corner in the plane: shift a reference sample to the
  // (minAxis, minRun) coordinates so `(P−corner)·axis ∈ [0, span]` and
  // `(P−corner)·run ∈ [0, runLen]` over the flat.
  const ref = samples[0]?.point ?? flat.center;
  const da = minAxis - vecDot(ref, axis);
  const db = minRun - vecDot(ref, run);
  return vecAdd(vecAdd(ref, vecScale(axis, da)), vecScale(run, db));
}

function unit2(v: [number, number]): [number, number] {
  const len = Math.hypot(v[0], v[1]);
  return len < 1e-12 ? [1, 0] : [v[0] / len, v[1] / len];
}

function rectFrom(pts: [number, number][]): Rect2 {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

function aabb2(rects: Rect2[]): Rect2 {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x0);
    y0 = Math.min(y0, r.y0);
    x1 = Math.max(x1, r.x1);
    y1 = Math.max(y1, r.y1);
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0, y0, x1, y1 };
}

function buildRectOutline2(b: Rect2): ReturnType<typeof line>[] {
  return [
    line([b.x0, b.y0, 0], [b.x1, b.y0, 0]),
    line([b.x1, b.y0, 0], [b.x1, b.y1, 0]),
    line([b.x1, b.y1, 0], [b.x0, b.y1, 0]),
    line([b.x0, b.y1, 0], [b.x0, b.y0, 0]),
  ];
}

/** Axial extent of a bend (its cylindrical face span along the fitted axis). */
function bendAxialExtent(bend: DetectedBend): number {
  const face = bend.faces[0];
  if (face === undefined) return 0;
  const axis = bend.fit.axisDir;
  const samples = sampleFace(face, 6);
  let min = Infinity;
  let max = -Infinity;
  for (const s of samples) {
    const a = vecDot(s.point, axis);
    min = Math.min(min, a);
    max = Math.max(max, a);
  }
  return Number.isFinite(max - min) ? max - min : 0;
}

/**
 * Bend direction: 'up' if the cylinder axis sits on the +normal side of the
 * parent flat's mid-surface, 'down' otherwise.
 */
function bendDirection(bend: DetectedBend, parent: DetectedFlat): 'up' | 'down' {
  const toAxis = vecSub(bend.fit.axisOrigin, parent.center);
  return vecDot(toAxis, parent.normal) >= 0 ? 'up' : 'down';
}

function faceNormal(face: Face): Vec3 {
  return vecNormalize(normalAt(face, faceCenter(face)));
}
