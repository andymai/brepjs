/**
 * Cross-section recovery and mesh-skinning helpers for the sweep family (loft,
 * sweep/pipe, helical sweep, draft prism) which has no native manifold-3d
 * equivalent.
 *
 * Manifold is a triangle-mesh kernel with no B-rep wires or faces. These are
 * PREVIEW-quality results; the exact B-rep is reproduced by replaying the
 * recorded op-graph onto OCCT. Sweep ops reconstruct a cross-section polygon
 * from the profile handle and either feed it to Manifold's native
 * `extrude`/`revolve` (planar paths) or skin it along a discretized 3D path.
 * @module
 */

import type { ManifoldShape, ManifoldSolid } from './meshHandle.js';
import { unwrap } from './meshHandle.js';
import type { ManifoldModule } from './helpers.js';

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/** A planar cross-section: a 2D outline plus the world frame it lives in. */
export interface CrossSection {
  /** Closed outline in the section's local 2D coordinates (no repeated last point). */
  readonly outline: Vec2[];
  /** Inner contours (holes), CW-wound (opposite the outline) in section 2D coords. */
  readonly holes?: Vec2[][] | undefined;
  /** World-space origin of the section plane. */
  readonly origin: Vec3;
  /** Section local +X axis in world space (maps outline.x). */
  readonly xAxis: Vec3;
  /** Section local +Y axis in world space (maps outline.y). */
  readonly yAxis: Vec3;
}

/** A moving frame along a sweep path (origin + section-plane basis). */
export interface SweepFrame {
  readonly origin: Vec3;
  readonly xAxis: Vec3;
  readonly yAxis: Vec3;
  readonly tangent: Vec3;
}

function asShape(shape: unknown): ManifoldShape {
  return shape as ManifoldShape;
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scaleVec(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function length3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize3(a: Vec3): Vec3 {
  const len = length3(a);
  if (len < 1e-12) return [0, 0, 1];
  return [a[0] / len, a[1] / len, a[2] / len];
}

/** Pick any unit vector perpendicular to `n`. */
export function perpendicular(n: Vec3): Vec3 {
  const a: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize3(cross(n, a));
}

/** Build an orthonormal frame (xAxis, yAxis) for a plane with the given normal. */
export function frameForNormal(normal: Vec3): { xAxis: Vec3; yAxis: Vec3 } {
  const n = normalize3(normal);
  const xAxis = perpendicular(n);
  const yAxis = normalize3(cross(n, xAxis));
  return { xAxis, yAxis };
}

/** Signed area of a 2D loop (CCW positive). */
export function signedArea(outline: readonly Vec2[]): number {
  let area = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i] ?? [0, 0];
    const b = outline[(i + 1) % outline.length] ?? [0, 0];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

/** Force CCW winding so generated triangles face outward consistently. */
export function ensureCCW(outline: Vec2[]): Vec2[] {
  return signedArea(outline) < 0 ? [...outline].reverse() : outline;
}

/** Force CW winding (used for holes, opposite the CCW outline). */
export function ensureCW(outline: Vec2[]): Vec2[] {
  return signedArea(outline) > 0 ? [...outline].reverse() : outline;
}

function readNodeParams(shape: ManifoldShape): Readonly<Record<string, unknown>> | undefined {
  const node = shape.node as { params?: Readonly<Record<string, unknown>> } | undefined;
  return node?.params;
}

/**
 * Recover a planar cross-section from a profile handle.
 *
 * Profile handles carry their outline in the op-node params under `outline`
 * (preferred), `polygon`, or `points`, together with an optional plane frame
 * (`origin`/`xAxis`/`yAxis`, or a `normal`). When no polygon is recorded, the
 * outline is derived by projecting the profile's manifold mesh onto the XY plane.
 */
export function profileCrossSection(profile: unknown): CrossSection {
  const shape = asShape(profile);
  const params = readNodeParams(shape);
  const recorded =
    (params?.['outline'] as Vec2[] | undefined) ??
    (params?.['polygon'] as Vec2[] | undefined) ??
    (params?.['points'] as Vec2[] | undefined);

  if (recorded && recorded.length >= 3) {
    const origin = (params?.['origin'] as Vec3 | undefined) ?? [0, 0, 0];
    const outline = ensureCCW(recorded.map((p) => [p[0], p[1]] as Vec2));
    const holesRaw = params?.['holes'] as Vec2[][] | undefined;
    const holes = holesRaw
      ?.filter((h) => h.length >= 3)
      .map((h) => ensureCW(h.map((p) => [p[0], p[1]] as Vec2)));
    if (params?.['xAxis'] && params['yAxis']) {
      return {
        outline,
        holes,
        origin,
        xAxis: params['xAxis'] as Vec3,
        yAxis: params['yAxis'] as Vec3,
      };
    }
    const normal = (params?.['normal'] as Vec3 | undefined) ?? [0, 0, 1];
    const { xAxis, yAxis } = frameForNormal(normal);
    return { outline, holes, origin, xAxis, yAxis };
  }

  return crossSectionFromMesh(shape);
}

/** Project a profile's mesh onto the XY plane to recover a coarse outline. */
function crossSectionFromMesh(shape: ManifoldShape): CrossSection {
  const solid = unwrap(shape) as
    | { getMesh?: () => { numProp: number; vertProperties: Float32Array } }
    | undefined;
  const mesh = solid?.getMesh?.();
  if (!mesh) {
    throw new Error('manifold: profile carries no recorded outline and no mesh to derive one');
  }
  const stride = mesh.numProp;
  const count = Math.floor(mesh.vertProperties.length / stride);
  const flat: Vec2[] = [];
  let z = 0;
  for (let i = 0; i < count; i++) {
    flat.push([mesh.vertProperties[i * stride] ?? 0, mesh.vertProperties[i * stride + 1] ?? 0]);
    z += mesh.vertProperties[i * stride + 2] ?? 0;
  }
  z /= Math.max(1, count);
  const hull = convexHull2D(flat);
  return {
    outline: ensureCCW(
      hull.length >= 3
        ? hull
        : [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0, 0.5],
          ]
    ),
    origin: [0, 0, z],
    xAxis: [1, 0, 0],
    yAxis: [0, 1, 0],
  };
}

/** Monotone-chain 2D convex hull (used only as a mesh-derived fallback outline). */
export function convexHull2D(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  if (pts.length < 3) return [...pts];
  const turn = (o: Vec2, a: Vec2, b: Vec2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (
      lower.length >= 2 &&
      turn(lower[lower.length - 2] ?? p, lower[lower.length - 1] ?? p, p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i] ?? [0, 0];
    while (
      upper.length >= 2 &&
      turn(upper[upper.length - 2] ?? p, upper[upper.length - 1] ?? p, p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Triangle indices that fan a convex/simple closed loop of `vertexCount` points. */
export function fanTriangulate(vertexCount: number): number[] {
  const tris: number[] = [];
  for (let i = 1; i + 1 < vertexCount; i++) {
    tris.push(0, i, i + 1);
  }
  return tris;
}

/**
 * Place a section's local outline at a world frame, returning a ring of points
 * in correspondence with the section's outline order. `scale` rescales the
 * outline about its frame origin (for tapered/draft sweeps and scale laws).
 */
/**
 * Upsample a closed 2D outline to exactly `n` points by KEEPING every original
 * vertex and inserting extra points on the longest segments (proportional to
 * length, largest-remainder allotment). Vertex-preserving so corners aren't
 * rounded off — resampling a 4-point rectangle to 4 returns it unchanged. Used
 * to give loft sections a common vertex count so {@link skinRings} can connect
 * them by index; lofting profiles of different point counts (circle ↔ rounded
 * rect) is otherwise impossible on the mesh kernel. `n < k` is not supported
 * (callers pass `n = max` count), so it never downsamples.
 */
export function resampleClosed(outline: readonly Vec2[], n: number): Vec2[] {
  const k = outline.length;
  if (k < 2 || n <= k) return outline.map((p) => [p[0], p[1]] as Vec2);
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < k; i++) {
    const a = outline[i] ?? [0, 0];
    const b = outline[(i + 1) % k] ?? [0, 0];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(l);
    total += l;
  }
  if (total === 0) return outline.map((p) => [p[0], p[1]] as Vec2);
  const extra = n - k;
  // Largest-remainder: fractional share of `extra` per segment, by length.
  const quota = seg.map((l) => (extra * l) / total);
  const add = quota.map((q) => Math.floor(q));
  let placed = add.reduce((s, v) => s + v, 0);
  const rema = quota.map((q, i) => ({ i, f: q - Math.floor(q) })).sort((x, y) => y.f - x.f);
  for (let r = 0; placed < extra; r++, placed++) {
    const idx = rema[r % rema.length]?.i ?? 0;
    add[idx] = (add[idx] ?? 0) + 1;
  }
  const out: Vec2[] = [];
  for (let i = 0; i < k; i++) {
    const a = outline[i] ?? [0, 0];
    const b = outline[(i + 1) % k] ?? [0, 0];
    out.push([a[0], a[1]]); // keep the original vertex
    const inner = add[i] ?? 0;
    for (let j = 1; j <= inner; j++) {
      const t = j / (inner + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

export function placeRing(section: CrossSection, frame: SweepFrame, scale = 1): Vec3[] {
  return section.outline.map((p) => {
    const lx = p[0] * scale;
    const ly = p[1] * scale;
    return [
      frame.origin[0] + frame.xAxis[0] * lx + frame.yAxis[0] * ly,
      frame.origin[1] + frame.xAxis[1] * lx + frame.yAxis[1] * ly,
      frame.origin[2] + frame.xAxis[2] * lx + frame.yAxis[2] * ly,
    ];
  });
}

/**
 * Skin a sequence of equally-sized rings (each an array of world-space points
 * in correspondence) into a watertight triangle mesh and build a Manifold solid.
 *
 * Every ring must have the same vertex count `m`. Adjacent rings are connected
 * with two triangles per segment; the first and last rings are capped with fans
 * (oriented outward). This is the shared engine behind loft and sweep.
 */
export function skinRings(module: ManifoldModule, rings: readonly Vec3[][]): ManifoldSolid {
  if (rings.length < 2) {
    throw new Error('manifold: skinning requires at least two rings');
  }
  const m = rings[0]?.length ?? 0;
  if (m < 3) {
    throw new Error('manifold: skinning requires rings of at least three points');
  }

  const verts: number[] = [];
  for (const ring of rings) {
    if (ring.length !== m) {
      throw new Error('manifold: skinning requires all rings to share a vertex count');
    }
    for (const p of ring) verts.push(p[0], p[1], p[2]);
  }

  const tris = skinTriangles(rings.length, m);
  const built = new module.Mesh({
    numProp: 3,
    vertProperties: Float32Array.from(verts),
    triVerts: Uint32Array.from(tris),
  });
  return orientPositive(module, new module.Manifold(built));
}

/**
 * Normalize a built solid to outward (positive-volume) orientation. Skinning a
 * profile whose section order or outline winding runs "backwards" yields an
 * inside-out manifold (negative volume) that booleans then mishandle — a cut
 * tool that won't subtract, a fuse operand that cancels volume. If the volume
 * is negative, rebuild with reversed triangle winding so normals face outward.
 */
export function orientPositive(module: ManifoldModule, solid: ManifoldSolid): ManifoldSolid {
  if (typeof solid.volume !== 'function' || solid.volume() >= 0) return solid;
  const mesh = solid.getMesh();
  const tv = mesh.triVerts as Uint32Array;
  for (let i = 0; i + 2 < tv.length; i += 3) {
    const t = tv[i + 1] ?? 0;
    tv[i + 1] = tv[i + 2] ?? 0;
    tv[i + 2] = t;
  }
  const flipped = new module.Mesh({
    numProp: mesh.numProp,
    vertProperties: mesh.vertProperties,
    triVerts: tv,
  });
  const result = new module.Manifold(flipped);
  if (typeof solid.delete === 'function') solid.delete();
  return result;
}

/** Build the triangle index list for `ringCount` rings of `m` points each. */
function skinTriangles(ringCount: number, m: number): number[] {
  const tris: number[] = [];
  for (let r = 0; r + 1 < ringCount; r++) {
    const base0 = r * m;
    const base1 = (r + 1) * m;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      tris.push(base0 + i, base0 + j, base1 + j);
      tris.push(base0 + i, base1 + j, base1 + i);
    }
  }
  // Start cap reversed (outward), end cap forward.
  const startFan = fanTriangulate(m);
  for (let t = 0; t < startFan.length; t += 3) {
    tris.push(startFan[t] ?? 0, startFan[t + 2] ?? 0, startFan[t + 1] ?? 0);
  }
  const endBase = (ringCount - 1) * m;
  const endFan = fanTriangulate(m);
  for (let t = 0; t < endFan.length; t += 3) {
    tris.push(
      endBase + (endFan[t] ?? 0),
      endBase + (endFan[t + 1] ?? 0),
      endBase + (endFan[t + 2] ?? 0)
    );
  }
  return tris;
}

/**
 * Build rotation-minimizing frames (double-reflection method) along a polyline
 * path. Returns one frame per path point; the section's in-plane axes are
 * carried so the profile keeps a stable orientation around corners.
 */
export function rotationMinimizingFrames(path: readonly Vec3[], seed: Vec3): SweepFrame[] {
  const frames: SweepFrame[] = [];
  if (path.length === 0) return frames;

  const tangentAt = (i: number): Vec3 => {
    const prev = path[Math.max(0, i - 1)] ?? path[i] ?? [0, 0, 0];
    const next = path[Math.min(path.length - 1, i + 1)] ?? path[i] ?? [0, 0, 0];
    return normalize3(sub(next, prev));
  };

  let t0 = tangentAt(0);
  let x0 = normalize3(sub(seed, scaleVec(t0, dot(seed, t0))));
  if (length3(x0) < 1e-9) x0 = perpendicular(t0);
  frames.push({
    origin: path[0] ?? [0, 0, 0],
    xAxis: x0,
    yAxis: normalize3(cross(t0, x0)),
    tangent: t0,
  });

  for (let i = 1; i < path.length; i++) {
    const p0 = path[i - 1] ?? [0, 0, 0];
    const p1 = path[i] ?? [0, 0, 0];
    const v1 = sub(p1, p0);
    const c1 = dot(v1, v1);
    let xRef = x0;
    if (c1 > 1e-18) {
      const rL = sub(x0, scaleVec(v1, (2 / c1) * dot(v1, x0)));
      const tL = sub(t0, scaleVec(v1, (2 / c1) * dot(v1, t0)));
      const t1 = tangentAt(i);
      const v2 = sub(t1, tL);
      const c2 = dot(v2, v2);
      xRef = c2 > 1e-18 ? sub(rL, scaleVec(v2, (2 / c2) * dot(v2, rL))) : rL;
    }
    const t1 = tangentAt(i);
    const x1 = normalize3(sub(xRef, scaleVec(t1, dot(xRef, t1))));
    const y1 = normalize3(cross(t1, x1));
    frames.push({ origin: p1, xAxis: x1, yAxis: y1, tangent: t1 });
    t0 = t1;
    x0 = x1;
  }
  return frames;
}
