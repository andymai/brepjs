import {
  type Compound,
  type Edge,
  type Face,
  type Solid,
  type Vec3,
  compound,
  edgeOnFace,
  getFaces,
  isSolid,
  isValid,
} from 'brepjs';
import { type Cutters, type Segmentation, arrange, deviationOf } from './analyticFns.js';
import {
  type FreeformCharts,
  type PackedCharts,
  decodeCharts,
  trimmedFace,
} from './freeformFns.js';
import { type Owned, cutCavities, outwardSolid } from './solidFns.js';
import type { ConversionReport } from './types.js';

/** The engine's packed charts of a mixed part (`FreeformCharts` in the wasm build). */
export interface PackedMixed extends PackedCharts {
  readonly run_surfaces: Int32Array;
  readonly run_smooth: Uint8Array;
  readonly chart_regions: Uint32Array;
}

/** The freeform regions of a mixed part, charted. */
export interface MixedCharts extends FreeformCharts {
  /** Per run: the kept analytic surface on its other side, or -1 for another chart. */
  readonly runSurfaces: readonly number[];
  /** Per run: its two faces meet along it without a crease. */
  readonly runSmooth: readonly boolean[];
  /** Per chart: the freeform region it belongs to. */
  readonly chartRegions: readonly number[];
}

export function decodeMixed(p: PackedMixed): MixedCharts {
  // Each wasm getter copies its whole array, so every one is read once.
  return {
    ...decodeCharts(p),
    runSurfaces: Array.from(p.run_surfaces),
    runSmooth: Array.from(p.run_smooth, (s) => s !== 0),
    chartRegions: Array.from(p.chart_regions),
  };
}

type MixedReport = NonNullable<NonNullable<ConversionReport['tier1']>['mixed']>;

/** One connected freeform region, as the engine measured it. */
export type FreeformRegion = Omit<MixedReport['regions'][number], 'faces'>;

export interface MixedOptions {
  /** The surfaces kept as exact faces. */
  readonly kept: ReadonlySet<number>;
  readonly regions: readonly FreeformRegion[];
  /** Distance from the mesh within which an arrangement sample counts as covered. */
  readonly coverage: number;
  /** How far a boundary curve may stray from its run's points. */
  readonly runTolerance: number;
  /** Largest acceptable fit error or sag of a freeform region's faces. */
  readonly maxFit: number;
  /** Largest acceptable distance between the input mesh and the result. */
  readonly maxDeviation: number;
  /** Chord tolerance for triangulating the result to measure that distance. */
  readonly triangulation: number;
}

export interface MixedOutcome {
  readonly shape: Solid | Compound;
  readonly stats: Omit<MixedReport, 'analyticReason'>;
  readonly deviation: ConversionReport['deviation'];
}

export type MixedResult = { ok: true; value: MixedOutcome } | { ok: false; reason: string };

/** Boundary curves reach this many run tolerances past where their analytic face ends. */
const REACH = 8;

/**
 * Each boundary between a freeform region and a kept surface, laid onto that
 * surface's patch. Where a boundary leaves the surface (the next stretch runs
 * along another one), the mesh corner it ends at sits within the fit of the
 * line the two surfaces really meet along, so the curve goes a little past it
 * and cuts its piece of the arrangement through.
 */
function boundaryCutters(c: MixedCharts, tolerance: number): Cutters {
  return (patches, owned) => {
    const key = (s: number, p: Vec3): string => `${s}:${p[0]},${p[1]},${p[2]}`;
    const ends = new Map<string, number>();
    c.runs.forEach((run, r) => {
      const s = c.runSurfaces[r] ?? -1;
      const [first, last] = [run.points[0], run.points.at(-1)];
      if (s < 0 || first === undefined || last === undefined) return;
      for (const p of [first, last]) ends.set(key(s, p), (ends.get(key(s, p)) ?? 0) + 1);
    });
    const tools: Edge[] = [];
    for (const [r, run] of c.runs.entries()) {
      const s = c.runSurfaces[r] ?? -1;
      if (s < 0) continue;
      const patch = patches.get(s);
      if (patch === undefined)
        return { ok: false, reason: `a freeform region borders surface ${s}, which was not kept` };
      const pts = [...run.points];
      const past = (end: Vec3 | undefined, inner: Vec3 | undefined): Vec3 | null => {
        if (end === undefined || inner === undefined || ends.get(key(s, end)) !== 1) return null;
        const d: Vec3 = [end[0] - inner[0], end[1] - inner[1], end[2] - inner[2]];
        const l = Math.hypot(d[0], d[1], d[2]);
        if (!(l > 0)) return null;
        const k = (REACH * tolerance) / l;
        return [end[0] + k * d[0], end[1] + k * d[1], end[2] + k * d[2]];
      };
      // A few points back, so one zigzag of the mesh doesn't set the direction.
      const before = past(pts[0], pts[Math.min(3, pts.length - 1)]);
      const after = past(pts.at(-1), pts[Math.max(pts.length - 4, 0)]);
      if (before !== null) pts.unshift(before);
      if (after !== null) pts.push(after);
      const e = edgeOnFace(patch, pts, { tolerance });
      if (!e.ok) {
        return {
          ok: false,
          reason: `a freeform boundary could not be laid on surface ${s}: ${e.error.message}`,
        };
      }
      owned.push(e.value);
      tools.push(e.value);
    }
    return { ok: true, value: tools };
  };
}

/**
 * Rebuild a part that has freeform regions between analytic faces: the kept
 * surfaces are arranged as in the analytic rebuild and cut along the regions'
 * boundaries, each chart of a region becomes a B-spline face trimmed along the
 * same boundaries, and each body's faces are sewn into a solid.
 */
export function buildMixed(seg: Segmentation, c: MixedCharts, opts: MixedOptions): MixedResult {
  for (const [i, region] of opts.regions.entries()) {
    const worst = Math.max(region.fitError, region.sag);
    if (!(worst <= opts.maxFit)) {
      return {
        ok: false,
        reason: `freeform region ${i} fits its points only within ${worst.toPrecision(3)} mm`,
      };
    }
  }
  const skip = new Set<number>();
  for (let i = 0; i < seg.surfaces.length; i++) if (!opts.kept.has(i)) skip.add(i);
  const owned: Owned[] = [];
  try {
    const arranged = arrange(
      seg,
      { coverage: opts.coverage, maxUnfitArea: Infinity, skip },
      owned,
      boundaryCutters(c, opts.runTolerance)
    );
    if (!arranged.ok) return arranged;
    const bodies = new Map<number, Face[]>();
    for (const [body, g] of arranged.groups) bodies.set(body, [...g.faces]);
    const regionFaces = opts.regions.map(() => 0);
    for (const [i, chart] of c.charts.entries()) {
      const face = trimmedFace(chart, c.runs, opts.runTolerance, owned);
      if (face === null) return { ok: false, reason: `freeform chart ${i} could not be trimmed` };
      owned.push(face);
      const list = bodies.get(chart.body) ?? [];
      list.push(face);
      bodies.set(chart.body, list);
      const region = c.chartRegions[i] ?? -1;
      if (regionFaces[region] !== undefined) regionFaces[region]++;
    }
    for (let b = 0; b < seg.bodyClosed.length; b++) {
      if (!bodies.has(b)) return { ok: false, reason: `no face covers body ${b}` };
    }
    // A chart's boundary lies on its own surface within its fit error, and on
    // the analytic face across it within the run tolerance.
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
        reason: `the rebuild with freeform regions deviates ${Math.max(dev.max, dev.reverseMax).toPrecision(3)} mm from the mesh`,
      };
    }
    // `result` is returned to the caller; everything else is released.
    owned.splice(owned.indexOf(result), 1);
    const faces = getFaces(result).length;
    return {
      ok: true,
      value: {
        shape: result,
        stats: {
          regions: opts.regions.map((r, i) => ({ ...r, faces: regionFaces[i] ?? 0 })),
          analyticFaces: faces - c.charts.length,
          freeformFaces: c.charts.length,
          runs: c.runs.length,
          sewTolerance,
          arrangement: arranged.stats,
        },
        deviation: dev,
      },
    };
  } finally {
    for (const o of owned) o[Symbol.dispose]();
  }
}
