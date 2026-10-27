/**
 * 2D drawings of a session's elements: what an axis-aligned plane cuts, drawn heavy and layered by
 * category, and what lies beyond it, drawn by hidden-line projection. Plans cut a storey
 * horizontally and look down; sections cut vertically and look across. Runs in the worker, which
 * holds the shapes.
 */

import type { AnyShape } from 'brepjs';
import type { BrepNs } from '../verify/brepjsRuntime.js';
import { errorMessage } from './records.js';

type Vec3 = [number, number, number];
export type DrawAxis = 'x' | 'y' | 'z';

export interface DrawingSpec {
  /** The axis the cut plane is square to. */
  readonly axis: DrawAxis;
  /** Where the plane cuts that axis, in model millimetres. */
  readonly at: number;
  /** The side of the plane the viewer is on: a plan looks down from +z. */
  readonly side: 1 | -1;
  /** How far past the cut to draw, in mm; omitted draws everything beyond, 0 only the cut. */
  readonly depth?: number | undefined;
}

export interface DrawnElement {
  readonly id: string;
  readonly category: string;
  readonly shapes: readonly AnyShape[];
}

export interface Polyline {
  readonly layer: string;
  readonly points: readonly (readonly [number, number])[];
}

export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface DrawingGeometry {
  readonly polylines: readonly Polyline[];
  readonly bounds: Bounds2D | undefined;
  /** Elements the plane cuts. */
  readonly cut: readonly string[];
  /** Elements drawn beyond the cut. */
  readonly beyond: readonly string[];
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
}

export const BEYOND_LAYER = 'BEYOND';
const INDEX: Record<DrawAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
// Two points closer than this, in mm, are one vertex when chaining mesh segments.
const JOIN_MM = 1e-3;

/** The drawing frame: toward points at the viewer, x runs right, and up is toward × x. */
export function drawingFrame(axis: DrawAxis, side: 1 | -1): { toward: Vec3; x: Vec3; y: Vec3 } {
  const toward: Vec3 = [0, 0, 0];
  toward[INDEX[axis]] = side;
  let x: Vec3;
  if (axis === 'z') x = [1, 0, 0];
  else if (axis === 'y') x = [-side, 0, 0];
  else x = [0, side, 0];
  // `+ 0` turns the cross product's -0s into 0s.
  const y: Vec3 = [
    toward[1] * x[2] - toward[2] * x[1] + 0,
    toward[2] * x[0] - toward[0] * x[2] + 0,
    toward[0] * x[1] - toward[1] * x[0] + 0,
  ];
  return { toward, x, y };
}

export function cutLayer(category: string): string {
  const name = category.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_');
  return `CUT-${name || 'OTHER'}`;
}

/** Segment pairs from meshEdges, chained into polylines and projected onto the frame. */
function polylinesOf(
  mesh: { lines: Float32Array; edgeGroups: readonly { start: number; count: number }[] },
  project: (x: number, y: number, z: number) => readonly [number, number],
  layer: string,
  out: Polyline[]
): void {
  const at = (v: number): readonly [number, number] =>
    project(mesh.lines[v * 3] ?? 0, mesh.lines[v * 3 + 1] ?? 0, mesh.lines[v * 3 + 2] ?? 0);
  const groups =
    mesh.edgeGroups.length > 0 ? mesh.edgeGroups : [{ start: 0, count: mesh.lines.length / 3 }];
  for (const g of groups) {
    let points: (readonly [number, number])[] = [];
    for (let v = g.start; v + 1 < g.start + g.count; v += 2) {
      const a = at(v);
      const b = at(v + 1);
      const last = points[points.length - 1];
      if (last && Math.abs(last[0] - a[0]) < JOIN_MM && Math.abs(last[1] - a[1]) < JOIN_MM) {
        points.push(b);
      } else {
        if (points.length > 1) out.push({ layer, points });
        points = [a, b];
      }
    }
    if (points.length > 1) out.push({ layer, points });
  }
}

function boundsOf(polylines: readonly Polyline[]): Bounds2D | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polylines) {
    for (const [x, y] of p.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
}

type Box3 = { lo: Vec3; hi: Vec3 };

function boxOf(brep: BrepNs, shape: AnyShape): Box3 {
  const b = brep.getBounds(shape);
  return { lo: [b.xMin, b.yMin, b.zMin], hi: [b.xMax, b.yMax, b.zMax] };
}

/**
 * Draw `elements` against `spec`. Each element the plane crosses is sectioned on its category's
 * cut layer; what lies beyond (within depth) is clipped and projected together, so nearer elements
 * hide farther ones.
 */
export function drawElements(
  brep: BrepNs,
  elements: readonly DrawnElement[],
  spec: DrawingSpec
): DrawingGeometry {
  const i = INDEX[spec.axis];
  const frame = drawingFrame(spec.axis, spec.side);
  const project = (x: number, y: number, z: number): readonly [number, number] => [
    x * frame.x[0] + y * frame.x[1] + z * frame.x[2],
    x * frame.y[0] + y * frame.y[1] + z * frame.y[2],
  ];
  // Beyond lies on the far side of the plane from the viewer.
  const far = spec.depth === undefined ? Infinity : spec.depth;
  const range: [number, number] =
    spec.side > 0 ? [spec.at - far, spec.at] : [spec.at, spec.at + far];

  const polylines: Polyline[] = [];
  const cut: string[] = [];
  const beyondIds: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const owned: Disposable[] = [];
  const beyond: AnyShape[] = [];
  let all: Box3 | undefined;
  const boxes = elements.map((el) => el.shapes.map((s) => boxOf(brep, s)));
  for (const list of boxes) {
    for (const b of list) {
      all = all
        ? {
            lo: [
              Math.min(all.lo[0], b.lo[0]),
              Math.min(all.lo[1], b.lo[1]),
              Math.min(all.lo[2], b.lo[2]),
            ],
            hi: [
              Math.max(all.hi[0], b.hi[0]),
              Math.max(all.hi[1], b.hi[1]),
              Math.max(all.hi[2], b.hi[2]),
            ],
          }
        : b;
    }
  }
  try {
    const normal: Vec3 = [0, 0, 0];
    normal[i] = 1;
    const origin: Vec3 = [0, 0, 0];
    origin[i] = spec.at;
    const plane = brep.createPlane(origin, null, normal);
    const clipLo: Vec3 = all ? [...all.lo] : [0, 0, 0];
    const clipHi: Vec3 = all ? [...all.hi] : [0, 0, 0];
    // A margin keeps faces that lie on the model's outer bounds out of the clip's own faces.
    for (let k = 0; k < 3; k++) {
      clipLo[k] = (clipLo[k] ?? 0) - 1000;
      clipHi[k] = (clipHi[k] ?? 0) + 1000;
    }
    clipLo[i] = Math.max(range[0], clipLo[i] ?? range[0]);
    clipHi[i] = Math.min(range[1], clipHi[i] ?? range[1]);
    const size: Vec3 = [clipHi[0] - clipLo[0], clipHi[1] - clipLo[1], clipHi[2] - clipLo[2]];
    let clip: ReturnType<BrepNs['box']> | undefined;
    if (spec.depth !== 0 && size.every((d) => d > 0)) {
      // translate copies, so the box it was given is freed here.
      using raw = brep.box(size[0], size[1], size[2]);
      clip = brep.translate(raw, clipLo);
      owned.push(clip);
    }

    elements.forEach((el, n) => {
      let crossed = false;
      let reached = false;
      el.shapes.forEach((shape, m) => {
        const b = boxes[n]?.[m];
        if (!b) return;
        const lo = b.lo[i];
        const hi = b.hi[i];
        if (lo <= spec.at && hi >= spec.at) {
          const sectioned = brep.section(shape, plane);
          if (sectioned.ok) {
            owned.push(sectioned.value);
            polylinesOf(brep.meshEdges(sectioned.value), project, cutLayer(el.category), polylines);
            crossed = true;
          } else {
            skipped.push({ id: el.id, reason: `section failed: ${errorMessage(sectioned.error)}` });
          }
        }
        if (clip === undefined || hi < range[0] || lo > range[1]) return;
        if (lo >= range[0] && hi <= range[1]) {
          beyond.push(shape);
          reached = true;
          return;
        }
        if (!brep.isShape3D(shape)) {
          skipped.push({ id: el.id, reason: 'not a solid, so it cannot be clipped' });
          return;
        }
        const clipped = brep.intersect(shape, clip);
        if (clipped.ok) {
          owned.push(clipped.value);
          beyond.push(clipped.value);
          reached = true;
        } else {
          skipped.push({ id: el.id, reason: `clip failed: ${errorMessage(clipped.error)}` });
        }
      });
      if (crossed) cut.push(el.id);
      if (reached) beyondIds.push(el.id);
    });

    if (beyond.length > 0) {
      const camera = brep.unwrap(brep.createCamera([0, 0, 0], frame.toward, frame.x));
      const group = brep.compound(beyond);
      owned.push(group);
      const { visible } = brep.projectEdges(group, camera, false);
      const edges = brep.compound(visible);
      owned.push(edges, ...visible);
      // Projected edges already sit in the frame's (x, y), at z = 0.
      polylinesOf(brep.meshEdges(edges), (x, y) => [x, y], BEYOND_LAYER, polylines);
    }
  } finally {
    for (const s of owned) s[Symbol.dispose]();
  }
  return { polylines, bounds: boundsOf(polylines), cut, beyond: beyondIds, skipped };
}
