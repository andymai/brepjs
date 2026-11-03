import {
  type Compound,
  type Edge,
  type Face,
  type Solid,
  type Vec3,
  compound,
  getFaces,
  isSolid,
  isValid,
  nurbsSurface,
  closedWire,
  edgeOnFace,
  subFace,
  wire,
} from 'brepjs';
import { type Segmentation, deviationOf } from './analyticFns.js';
import { type Owned, cutCavities, outwardSolid } from './solidFns.js';
import type { ConversionReport } from './types.js';

/** A chart boundary from one corner to the next, shared by the two charts it separates. */
export interface FreeformRun {
  readonly points: readonly Vec3[];
}

export interface FreeformChart {
  readonly body: number;
  /** The boundary loop in order. */
  readonly sides: readonly { readonly run: number; readonly reversed: boolean }[];
  /**
   * Poles of the surface fitted to the chart: a uniform cubic B-spline over
   * k × k poles row by row, knots -3..k (empty when absent).
   */
  readonly poles: readonly Vec3[];
  /** Largest distance of the chart's points from that surface. */
  readonly fitError: number;
}

export interface FreeformCharts {
  readonly runs: readonly FreeformRun[];
  readonly charts: readonly FreeformChart[];
}

/** The engine's packed charts (`FreeformCharts` in the wasm build). */
export interface PackedCharts {
  readonly run_offsets: Uint32Array;
  readonly run_points: Float64Array;
  readonly chart_bodies: Uint32Array;
  readonly side_offsets: Uint32Array;
  readonly sides: Int32Array;
  readonly surface_offsets: Uint32Array;
  readonly surface_poles: Float64Array;
  readonly fit_errors: Float64Array;
}

function pointsIn(flat: Float64Array, from: number, to: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = from; i < to; i++) {
    out.push([flat[3 * i] ?? 0, flat[3 * i + 1] ?? 0, flat[3 * i + 2] ?? 0]);
  }
  return out;
}

export function decodeCharts(p: PackedCharts): FreeformCharts {
  // Each wasm getter copies its whole array, so every one is read once.
  const runOffsets = p.run_offsets;
  const runPoints = p.run_points;
  const bodies = p.chart_bodies;
  const sideOffsets = p.side_offsets;
  const allSides = p.sides;
  const surfaceOffsets = p.surface_offsets;
  const surfacePoles = p.surface_poles;
  const fitErrors = p.fit_errors;
  const runs: FreeformRun[] = [];
  for (let r = 0; r + 1 < runOffsets.length; r++) {
    runs.push({ points: pointsIn(runPoints, runOffsets[r] ?? 0, runOffsets[r + 1] ?? 0) });
  }
  const charts: FreeformChart[] = [];
  for (let c = 0; c < bodies.length; c++) {
    const sides = Array.from(
      allSides.subarray(sideOffsets[c] ?? 0, sideOffsets[c + 1] ?? 0),
      (s) => (s < 0 ? { run: -s - 1, reversed: true } : { run: s, reversed: false })
    );
    charts.push({
      body: bodies[c] ?? 0,
      sides,
      poles: pointsIn(surfacePoles, surfaceOffsets[c] ?? 0, surfaceOffsets[c + 1] ?? 0),
      fitError: fitErrors[c] ?? Infinity,
    });
  }
  return { runs, charts };
}

export interface FreeformOptions {
  /** How far a boundary curve may stray from its run's points. */
  readonly runTolerance: number;
  /** Largest acceptable distance between the input mesh and the result. */
  readonly maxDeviation: number;
  /** Chord tolerance for triangulating the result to measure that distance. */
  readonly triangulation: number;
}

export interface FreeformOutcome {
  readonly shape: Solid | Compound;
  readonly stats: { readonly charts: number; readonly runs: number; readonly faces: number };
  readonly deviation: ConversionReport['deviation'];
}

export type FreeformResult = { ok: true; value: FreeformOutcome } | { ok: false; reason: string };

/**
 * The chart's fitted surface as the engine fitted it: a uniform cubic
 * B-spline over k × k poles, knots -3, -2, ..., k.
 */
function chartSurface(poles: readonly Vec3[], owned: Owned[]): Face | null {
  const k = Math.round(Math.sqrt(poles.length));
  if (k < 4 || k * k !== poles.length) return null;
  const knots = Array.from({ length: k + 4 }, (_, i) => i - 3);
  const ones = knots.map(() => 1);
  const surface = nurbsSurface({
    degreeU: 3,
    degreeV: 3,
    poles: Array.from({ length: k }, (_, i) => poles.slice(i * k, (i + 1) * k)),
    knotsU: knots,
    knotsV: knots,
    multiplicitiesU: ones,
    multiplicitiesV: ones,
  });
  if (!surface.ok) return null;
  owned.push(surface.value);
  return surface.value;
}

/**
 * The chart's fitted surface trimmed by its boundary: each run laid onto the
 * surface as an edge. Neighbours lay a shared run onto their own surfaces,
 * which part by about their fit error; sewing closes that gap.
 */
function trimmedFace(
  chart: FreeformChart,
  runs: readonly FreeformRun[],
  tolerance: number,
  owned: Owned[]
): Face | null {
  const surface = chartSurface(chart.poles, owned);
  if (surface === null) return null;
  const edges: Edge[] = [];
  for (const side of chart.sides) {
    const run = runs[side.run];
    if (run === undefined) return null;
    const pts = side.reversed ? [...run.points].reverse() : [...run.points];
    const e = edgeOnFace(surface, pts, { tolerance });
    if (!e.ok) return null;
    owned.push(e.value);
    edges.push(e.value);
  }
  const w = wire(edges);
  if (!w.ok) return null;
  owned.push(w.value);
  const loop = closedWire(w.value);
  if (!loop.ok) return null;
  try {
    return subFace(surface, loop.value);
  } catch {
    return null;
  }
}

/**
 * Rebuild every body from B-spline faces, one per chart: the chart's own
 * fitted surface trimmed by its boundary runs, each body's faces sewn into a
 * solid, then checked against the mesh.
 */
export function buildFreeform(
  c: FreeformCharts,
  seg: Pick<Segmentation, 'bodyParent' | 'bodyClosed' | 'deviation'>,
  opts: FreeformOptions
): FreeformResult {
  if (c.charts.length === 0) return { ok: false, reason: 'no freeform charts' };
  const owned: Owned[] = [];
  try {
    const bodies = new Map<number, Face[]>();
    for (const [i, chart] of c.charts.entries()) {
      const face = trimmedFace(chart, c.runs, opts.runTolerance, owned);
      if (face === null) return { ok: false, reason: `chart ${i} could not be trimmed` };
      owned.push(face);
      const list = bodies.get(chart.body) ?? [];
      list.push(face);
      bodies.set(chart.body, list);
    }
    for (let b = 0; b < seg.bodyClosed.length; b++) {
      if (!bodies.has(b)) return { ok: false, reason: `no chart covers body ${b}` };
    }
    // Neighbours lay a shared run onto their own surfaces, each within its fit
    // error of the points and within the run tolerance of its curve.
    const fit = Math.max(...c.charts.map((x) => (Number.isFinite(x.fitError) ? x.fitError : 0)));
    const sewTolerance = 2 * (fit + opts.runTolerance);
    const solids = new Map<number, Solid>();
    for (const [body, faces] of bodies) {
      if (seg.bodyClosed[body] !== 1) return { ok: false, reason: `body ${body} is open` };
      const built = outwardSolid(faces, owned, sewTolerance);
      if (!built.ok) return { ok: false, reason: `body ${body}: ${built.reason}` };
      solids.set(body, built.value);
    }
    const hollow = cutCavities(solids, seg.bodyParent, owned);
    if (!hollow.ok) return hollow;
    const tops: Solid[] = [];
    for (const [body, s] of solids) {
      if ((seg.bodyParent[body] ?? -1) >= 0) continue;
      if (!isSolid(s) || !isValid(s)) return { ok: false, reason: `body ${body} is not valid` };
      tops.push(s);
    }
    const [first] = tops;
    if (first === undefined) return { ok: false, reason: 'no outer body was rebuilt' };
    const result: Solid | Compound = tops.length === 1 ? first : compound(tops);
    if (result !== first) owned.push(result);
    const dev = deviationOf(result, seg.deviation, opts.triangulation);
    if (!(dev.max <= opts.maxDeviation && dev.reverseMax <= opts.maxDeviation)) {
      return {
        ok: false,
        reason: `the B-spline rebuild deviates ${Math.max(dev.max, dev.reverseMax).toPrecision(3)} mm from the mesh`,
      };
    }
    // `result` is returned to the caller; everything else is released.
    owned.splice(owned.indexOf(result), 1);
    return {
      ok: true,
      value: {
        shape: result,
        stats: { charts: c.charts.length, runs: c.runs.length, faces: getFaces(result).length },
        deviation: dev,
      },
    };
  } finally {
    for (const o of owned) o[Symbol.dispose]();
  }
}
