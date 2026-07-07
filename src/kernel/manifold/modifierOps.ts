import type { KernelModifierOps } from '@/kernel/interfaces/modifierOps.js';
import type { KernelShape } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import type { ManifoldShape, ManifoldSolid } from './meshHandle.js';
import { nodeOf, unwrap, wrap } from './meshHandle.js';
import { makeNode } from './opGraph.js';
import { orientPositive } from './approximations.js';

const ROUNDING_BALL_SEGMENTS = 16;

// A pass-through op (no geometric change available) must still yield a distinct
// manifold object so two handles never alias the same one — otherwise the
// adapter's dispose() double-frees. translate by zero returns a fresh Manifold.
function cloneSolid(solid: ManifoldSolid): ManifoldSolid {
  return typeof solid?.translate === 'function' ? solid.translate([0, 0, 0]) : solid;
}

// Rolling-ball preview: Minkowski shrink-then-grow rounds convex edges by
// `radius`. Falls back to a clone of the input solid when the build lacks
// Minkowski ops (a clone, not the input, to avoid handle aliasing).
function approxFilletMesh(
  module: ManifoldModule,
  solid: ManifoldSolid,
  radius: number
): ManifoldSolid {
  if (!(radius > 0)) return cloneSolid(solid);
  const ball = roundingBall(module, radius);
  if (ball === undefined) return cloneSolid(solid);
  if (
    typeof solid?.minkowskiDifference !== 'function' ||
    typeof solid?.minkowskiSum !== 'function'
  ) {
    return cloneSolid(solid);
  }
  return solid.minkowskiDifference(ball).minkowskiSum(ball);
}

// Offset the surface outward (distance > 0) or inward (distance < 0) via a
// Minkowski operation with a sphere of the offset radius.
function approxOffsetMesh(
  module: ManifoldModule,
  solid: ManifoldSolid,
  distance: number
): ManifoldSolid {
  if (distance === 0) return cloneSolid(solid);
  const ball = roundingBall(module, Math.abs(distance));
  if (ball === undefined) return cloneSolid(solid);
  if (distance > 0) {
    return typeof solid?.minkowskiSum === 'function' ? solid.minkowskiSum(ball) : cloneSolid(solid);
  }
  return typeof solid?.minkowskiDifference === 'function'
    ? solid.minkowskiDifference(ball)
    : cloneSolid(solid);
}

// Hollow the solid (subtract an inward offset). `keepSolid` instead grows it
// outward by |thickness| for thicken semantics.
function approxShellMesh(
  module: ManifoldModule,
  solid: ManifoldSolid,
  thickness: number,
  keepSolid: boolean
): ManifoldSolid {
  if (thickness === 0) return cloneSolid(solid);
  if (keepSolid) return approxOffsetMesh(module, solid, Math.abs(thickness));
  const inner = approxOffsetMesh(module, solid, -Math.abs(thickness));
  return typeof solid?.subtract === 'function' ? solid.subtract(inner) : cloneSolid(solid);
}

function roundingBall(module: ManifoldModule, radius: number): ManifoldSolid | undefined {
  const Manifold = module?.Manifold as
    { sphere?: (r: number, segments?: number) => ManifoldSolid } | undefined;
  if (typeof Manifold?.sphere !== 'function') return undefined;
  return Manifold.sphere(radius, ROUNDING_BALL_SEGMENTS);
}

type FilletRadius = number | [number, number] | ((edge: KernelShape) => number | [number, number]);

type Vec3 = readonly [number, number, number];

interface Selection {
  readonly kind: 'all' | 'index' | 'witness';
  readonly count: number;
  readonly indices?: readonly number[];
  readonly points?: ReadonlyArray<Vec3>;
}

function asShape(shape: KernelShape): ManifoldShape {
  return shape as ManifoldShape;
}

function readIndex(handle: KernelShape): number | undefined {
  const h = handle as { index?: unknown; id?: unknown } | null | undefined;
  if (h === null || h === undefined) return undefined;
  if (typeof h.index === 'number') return h.index;
  if (typeof h.id === 'number') return h.id;
  return undefined;
}

function boxCenter(box: { min?: readonly number[]; max?: readonly number[] }): Vec3 | undefined {
  const { min, max } = box;
  if (min === undefined || max === undefined || min.length < 3 || max.length < 3) {
    return undefined;
  }
  return [
    ((min[0] ?? 0) + (max[0] ?? 0)) / 2,
    ((min[1] ?? 0) + (max[1] ?? 0)) / 2,
    ((min[2] ?? 0) + (max[2] ?? 0)) / 2,
  ];
}

/**
 * A representative 3D point on a selected sub-shape, used to re-identify the
 * matching OCCT sub-shape on replay (positional indices don't survive the
 * round-trip). manifold `iterShapes` handles carry the sub-shape's OCCT
 * bounding box directly; other handles expose a `manifold.boundingBox()`.
 */
function readWitness(handle: KernelShape): Vec3 | undefined {
  const sub = handle as { box?: { min?: readonly number[]; max?: readonly number[] } } | null;
  if (sub?.box !== undefined) return boxCenter(sub.box);
  const solid = (handle as { manifold?: { boundingBox?: () => unknown } } | null)?.manifold;
  const box = solid?.boundingBox?.() as
    { min?: readonly number[]; max?: readonly number[] } | undefined;
  return box === undefined ? undefined : boxCenter(box);
}

function describeSelection(handles: readonly KernelShape[]): Selection {
  const count = handles.length;
  if (count === 0) return { kind: 'all', count };

  const points: Vec3[] = [];
  for (const handle of handles) {
    const point = readWitness(handle);
    if (point === undefined) {
      points.length = 0;
      break;
    }
    points.push(point);
  }
  if (points.length === count) return { kind: 'witness', count, points };

  const indices: number[] = [];
  for (const handle of handles) {
    const idx = readIndex(handle);
    if (idx === undefined) {
      indices.length = 0;
      break;
    }
    indices.push(idx);
  }
  if (indices.length === count) return { kind: 'index', count, indices };

  return { kind: 'all', count };
}

function normalizeRadius(radius: FilletRadius): number | [number, number] {
  if (typeof radius === 'function') {
    notImplemented('fillet (per-edge radius callback)');
  }
  return radius;
}

function scalarRadius(radius: number | [number, number]): number {
  return typeof radius === 'number' ? radius : radius[0];
}

function parseVariableSpecRadius(spec: string): number {
  const match = spec.match(/[-+]?\d*\.?\d+/);
  return match ? Number(match[0]) : 0;
}

function rounded(
  module: ManifoldModule,
  op: string,
  shape: KernelShape,
  edges: readonly KernelShape[],
  radius: FilletRadius
): ManifoldShape {
  const input = asShape(shape);
  const value = normalizeRadius(radius);
  const selection = describeSelection(edges);
  const manifold = approxFilletMesh(module, unwrap(input), scalarRadius(value));
  return wrap(manifold, makeNode(op, { radius: value, selection }, [nodeOf(input)]));
}

function chamferDistAngle(
  module: ManifoldModule,
  shape: KernelShape,
  edges: readonly KernelShape[],
  distance: number,
  angleDeg: number
): ManifoldShape {
  const input = asShape(shape);
  const selection = describeSelection(edges);
  const manifold = approxFilletMesh(module, unwrap(input), distance);
  return wrap(
    manifold,
    makeNode('chamferDistAngle', { distance, angleDeg, selection }, [nodeOf(input)])
  );
}

/**
 * Hollow an extrude-origin solid with an open top — the gridfinity bin-body case
 * (and what `approxShellMesh` cannot do: manifold-3d exposes no Minkowski inward
 * offset, so the generic shell no-ops and leaves the body solid). Reconstruct the
 * cavity from the extrude op-node's recorded outline: offset it inward by
 * `thickness` (Clipper2 2D), extrude full height so it punches through the top
 * (open), lifted by `thickness` along the extrude dir so a floor remains, then
 * subtract. Returns undefined for non-extrude solids (caller falls back).
 */
function extrudeOpenTopShell(
  module: ManifoldModule,
  input: ManifoldShape,
  thickness: number
): ManifoldSolid | undefined {
  const node = input.node as { op?: string; params?: Record<string, unknown> } | undefined;
  if (node?.op !== 'extrude') return undefined;
  const p = node.params ?? {};
  const outline = p['outline'] as ReadonlyArray<readonly [number, number]> | undefined;
  const origin = p['origin'] as Vec3 | undefined;
  const dir = p['direction'] as Vec3 | undefined;
  const length = p['length'] as number | undefined;
  if (!outline || outline.length < 3 || !origin || !dir || typeof length !== 'number') {
    return undefined;
  }
  const t = Math.abs(thickness);
  try {
    const cs = new module.CrossSection([outline.map((q) => [q[0], q[1]] as [number, number])]);
    const inner = cs.offset(-t);
    if (typeof inner.isEmpty === 'function' && inner.isEmpty()) return undefined;
    const cavity = module.Manifold.extrude(inner, length) as {
      rotate(r: Vec3): unknown;
      translate(t: Vec3): unknown;
    };
    const dlen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const alignedZ = Math.abs(dir[0]) < 1e-9 && Math.abs(dir[1]) < 1e-9 && dir[2] > 0;
    let placed = cavity;
    if (!alignedZ) {
      const pitch = Math.atan2(Math.hypot(dir[0], dir[1]), dir[2]) * (180 / Math.PI);
      const yaw = Math.atan2(dir[1], dir[0]) * (180 / Math.PI);
      placed = placed.rotate([0, pitch, yaw]) as typeof placed;
    }
    placed = placed.translate([
      origin[0] + (dir[0] / dlen) * t,
      origin[1] + (dir[1] / dlen) * t,
      origin[2] + (dir[2] / dlen) * t,
    ]) as typeof placed;
    return orientPositive(module, unwrap(input).subtract(placed as ManifoldSolid));
  } catch {
    return undefined;
  }
}

function shell(
  module: ManifoldModule,
  shape: KernelShape,
  faces: readonly KernelShape[],
  thickness: number,
  tolerance: number | undefined
): ManifoldShape {
  const input = asShape(shape);
  const selection = describeSelection(faces);
  const manifold =
    extrudeOpenTopShell(module, input, thickness) ??
    approxShellMesh(module, unwrap(input), thickness, false);
  const params =
    tolerance === undefined ? { thickness, selection } : { thickness, selection, tolerance };
  return wrap(manifold, makeNode('shell', params, [nodeOf(input)]));
}

function thicken(module: ManifoldModule, shape: KernelShape, thickness: number): ManifoldShape {
  const input = asShape(shape);
  const manifold = approxShellMesh(module, unwrap(input), thickness, true);
  return wrap(manifold, makeNode('thicken', { thickness }, [nodeOf(input)]));
}

function offset(
  module: ManifoldModule,
  shape: KernelShape,
  distance: number,
  tolerance: number | undefined
): ManifoldShape {
  const input = asShape(shape);
  const manifold = approxOffsetMesh(module, unwrap(input), distance);
  const params = tolerance === undefined ? { distance } : { distance, tolerance };
  return wrap(manifold, makeNode('offset', params, [nodeOf(input)]));
}

function filletVariable(module: ManifoldModule, shape: KernelShape, spec: string): ManifoldShape {
  const input = asShape(shape);
  const manifold = approxFilletMesh(module, unwrap(input), parseVariableSpecRadius(spec));
  return wrap(manifold, makeNode('filletVariable', { spec }, [nodeOf(input)]));
}

function draft(
  shape: KernelShape,
  faces: readonly KernelShape[],
  pullDirection: readonly [number, number, number],
  neutralPlane: readonly [number, number, number],
  angleDeg: number | ((face: KernelShape) => number)
): ManifoldShape {
  if (typeof angleDeg === 'function') {
    notImplemented('draft (per-face angle callback)');
  }
  const input = asShape(shape);
  const selection = describeSelection(faces);
  return wrap(
    cloneSolid(unwrap(input)),
    makeNode('draft', { pullDirection, neutralPlane, angleDeg, selection }, [nodeOf(input)])
  );
}

function defeature(shape: KernelShape, faces: readonly KernelShape[]): ManifoldShape {
  const input = asShape(shape);
  const selection = describeSelection(faces);
  return wrap(cloneSolid(unwrap(input)), makeNode('defeature', { selection }, [nodeOf(input)]));
}

function simplify(shape: KernelShape): ManifoldShape {
  const input = asShape(shape);
  const solid = unwrap(input);
  const simplified = typeof solid?.simplify === 'function' ? solid.simplify() : cloneSolid(solid);
  return wrap(simplified, makeNode('simplify', {}, [nodeOf(input)]));
}

function reverseShape(shape: KernelShape): ManifoldShape {
  const input = asShape(shape);
  const solid = unwrap(input);
  const reversed =
    typeof solid?.mirror === 'function' ? solid.mirror([1, 0, 0]) : cloneSolid(solid);
  return wrap(reversed, makeNode('reverseShape', {}, [nodeOf(input)]));
}

function filletBatchEntry(
  module: ManifoldModule,
  entry: {
    shape: KernelShape;
    edges: ReadonlyArray<{ edge: KernelShape; radius: number; r2?: number | undefined }>;
  }
): ManifoldShape {
  const input = asShape(entry.shape);
  const selection = describeSelection(entry.edges.map((e) => e.edge));
  const radii = entry.edges.map((e) =>
    e.r2 === undefined ? e.radius : ([e.radius, e.r2] as [number, number])
  );
  const firstRadius = entry.edges[0]?.radius ?? 0;
  const manifold = approxFilletMesh(module, unwrap(input), firstRadius);
  return wrap(manifold, makeNode('fillet', { radii, selection }, [nodeOf(input)]));
}

export function makeModifierOps(module: ManifoldModule): KernelModifierOps {
  return {
    fillet: (shape, edges, radius) => rounded(module, 'fillet', shape, edges, radius),
    chamfer: (shape, edges, distance) => rounded(module, 'chamfer', shape, edges, distance),
    chamferDistAngle: (shape, edges, distance, angleDeg) =>
      chamferDistAngle(module, shape, edges, distance, angleDeg),
    shell: (shape, faces, thickness, tolerance) =>
      shell(module, shape, faces, thickness, tolerance),
    thicken: (shape, thickness) => thicken(module, shape, thickness),
    offset: (shape, distance, tolerance) => offset(module, shape, distance, tolerance),
    filletVariable: (shape, spec) => filletVariable(module, shape, spec),
    draft: (shape, faces, pullDirection, neutralPlane, angleDeg) =>
      draft(shape, faces, pullDirection, neutralPlane, angleDeg),
    defeature: (shape, faces) => defeature(shape, faces),
    offsetWire2D: () => notImplemented('offsetWire2D'),
    simplify: (shape) => simplify(shape),
    reverseShape: (shape) => reverseShape(shape),
    shellBatch: (entries) =>
      entries.map((e) => shell(module, e.shape, e.faces, e.thickness, e.tolerance)),
    filletBatch: (entries) => entries.map((e) => filletBatchEntry(module, e)),
  };
}
