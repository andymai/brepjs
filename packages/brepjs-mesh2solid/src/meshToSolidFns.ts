import {
  type Compound,
  type Result,
  type Shell,
  type Solid,
  type Vec3,
  err,
  getFaces,
  ioError,
  isSolid,
  moduleInitError,
  ok,
  validationError,
} from 'brepjs';
import { type AnalyticResult, buildAnalytic, decodeSurfaces, deviationOf } from './analyticFns.js';
import { type Tier2Result, buildTier2 } from './tier2Fns.js';
import { buildShape } from './buildFns.js';
import { loadMeshEngine } from './engine.js';
import { type EngineReport, type Tier1EngineReport, finishReport } from './reportFns.js';
import type {
  ConversionReport,
  MeshInput,
  MeshToSolidOptions,
  MeshToSolidResult,
} from './types.js';
import type { Tier0Result, Tier1Session } from '../wasm/index.js';

type Shape = Solid | Shell | Compound;

const UNITS = new Set(['auto', 'um', 'mm', 'cm', 'm', 'in', 'ft']);
const DEFAULT_MAX_TRIANGLES = 200_000;
// The engine takes these as u32 and i32; larger numbers would wrap at the boundary.
const MAX_U32 = 0xffff_ffff;
const MAX_I32 = 0x7fff_ffff;

interface EngineArgs {
  readonly unit: string;
  readonly tolerance: number;
  readonly maxTriangles: number;
  readonly fillHoles: number;
}

function engineArgs(o: MeshToSolidOptions): Result<EngineArgs> {
  const unit = o.units ?? 'auto';
  if (!UNITS.has(unit)) {
    return err(validationError('MESH_BAD_UNIT', `unknown unit '${unit}'`));
  }
  const tol = o.tolerance ?? 'auto';
  if (tol !== 'auto' && !(Number.isFinite(tol) && tol > 0)) {
    return err(
      validationError(
        'MESH_BAD_TOLERANCE',
        `tolerance must be a positive number of millimeters or 'auto', got ${tol}`
      )
    );
  }
  const maxTriangles = o.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  if (!(Number.isInteger(maxTriangles) && maxTriangles >= 4 && maxTriangles <= MAX_U32)) {
    return err(
      validationError(
        'MESH_BAD_BUDGET',
        `maxTriangles must be an integer from 4 to ${MAX_U32}, got ${maxTriangles}`
      )
    );
  }
  const fill = o.fillHoles ?? true;
  if (typeof fill === 'number' && !(Number.isInteger(fill) && fill >= 3 && fill <= MAX_I32)) {
    return err(
      validationError(
        'MESH_BAD_FILL',
        `fillHoles must be a boolean or an edge count from 3 to ${MAX_I32}, got ${fill}`
      )
    );
  }
  return ok({
    unit,
    tolerance: tol === 'auto' ? Number.NaN : tol,
    maxTriangles,
    fillHoles: fill === true ? -1 : fill === false ? 0 : fill,
  });
}

async function toBytes(input: MeshInput): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input))
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

function hintFor(input: MeshInput, o: MeshToSolidOptions): string {
  if (o.fileName !== undefined) return o.fileName;
  if (typeof File !== 'undefined' && input instanceof File) return input.name;
  return '';
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Convert a triangle mesh (STL, OBJ, PLY or 3MF; CAD export or 3D scan) into a
 * B-Rep shape.
 *
 * Tier 0 repairs the mesh (welds vertices, removes degenerate and duplicate
 * triangles, fixes winding, fills holes), decimates scans and over-budget meshes
 * within the tolerance, merges coplanar triangles into planar polygon faces and
 * sews each body. Closed bodies become solids; internal cavities are subtracted
 * from the body around them. The report measures how far the result is from the
 * input in both directions.
 *
 * Tier 1 goes further: it segments the mesh into planes,
 * cylinders, cones, spheres and tori, makes fillets exactly tangent, and
 * rebuilds the solid from those exact surfaces, trimmed by their intersections.
 * When a region fits no analytic surface or the rebuild misses the mesh, the
 * result falls back to Tier 0 and the report says why.
 *
 * Tier 2 (the default) then writes that solid as a feature program, returned in
 * `code`: fillets, cavities, extruded slabs with holes, or a revolved profile,
 * with dimensions snapped to round values. The program's own solid is returned
 * when it still matches the mesh; otherwise the result stays at Tier 1.
 *
 * @example
 * ```ts
 * const res = await meshToSolid(file);
 * if (res.ok && res.value.solid) {
 *   const step = exportSTEP(res.value.shape);
 *   const source = res.value.code; // `.brep.ts`, when tier 2 succeeded
 * }
 * ```
 */
export async function meshToSolid(
  input: MeshInput,
  options: MeshToSolidOptions = {}
): Promise<Result<MeshToSolidResult>> {
  const args = engineArgs(options);
  if (!args.ok) return args;
  let engine;
  try {
    engine = await loadMeshEngine();
  } catch (e) {
    return err(
      moduleInitError('MESH_ENGINE_LOAD_FAILED', `could not load the mesh engine: ${message(e)}`, e)
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = await toBytes(input);
  } catch (e) {
    return err(ioError('MESH_READ_FAILED', `could not read the mesh input: ${message(e)}`, e));
  }
  const tier = options.tier ?? 2;
  const engineStart = performance.now();
  let session: Tier1Session | undefined;
  let raw: Tier0Result;
  try {
    const call = [
      bytes,
      hintFor(input, options),
      args.value.unit,
      args.value.tolerance,
      args.value.maxTriangles,
      args.value.fillHoles,
      options.heatmap === true,
    ] as const;
    if (tier >= 1) {
      session = engine.convert_tier1(...call);
      raw = session.tier0();
    } else {
      raw = engine.convert_tier0(...call);
    }
  } catch (e) {
    session?.free();
    return err(ioError('MESH_CONVERT_FAILED', message(e), e));
  }
  try {
    let positions: Float64Array;
    let triangles: Uint32Array;
    let engineReport: EngineReport;
    let heatmap: MeshToSolidResult['heatmap'];
    try {
      positions = raw.positions;
      triangles = raw.triangles;
      engineReport = JSON.parse(raw.report) as EngineReport;
      heatmap =
        options.heatmap === true
          ? {
              positions: raw.input_positions,
              indices: raw.input_indices,
              deviation: raw.input_deviation,
            }
          : undefined;
    } finally {
      raw.free();
    }
    const buildStart = performance.now();
    const engineMs = buildStart - engineStart;

    let fallback: { note: string; tier1: ConversionReport['tier1'] } | undefined;
    if (session !== undefined) {
      const tier1Report = JSON.parse(session.tier1_report) as Tier1EngineReport;
      const gates = gatesFor(session, engineReport);
      let analytic: AnalyticResult;
      try {
        analytic = runTier1(session, engineReport, gates);
      } catch (e) {
        analytic = { ok: false, reason: `the rebuild failed: ${message(e)}` };
      }
      if (analytic.ok) {
        let shape: Shape = analytic.value.shape;
        let deviation = analytic.value.deviation;
        let tierReached: 1 | 2 = 1;
        let code: string | undefined;
        let tier2: ConversionReport['tier2'];
        const warnings: string[] = [];
        if (tier >= 2) {
          const program = runTier2(shape, session, gates);
          if (program.ok) {
            shape[Symbol.dispose]();
            ({ shape, deviation, code } = program.value);
            tierReached = 2;
            tier2 = { features: program.value.features };
          } else {
            tier2 = { features: [], fallbackReason: program.reason };
            warnings.push(`tier 2 stopped at tier 1: ${program.reason}`);
            // The program may have been measured last; re-measure the tier 1 shape for the heatmap.
            if (heatmap !== undefined) {
              deviationOf(shape, (p, i) => session.deviation(p, i), gates.triangulation);
            }
          }
        }
        const faces = {
          triangles: triangles.length / 3,
          faces: getFaces(shape).length,
          unified: true,
        };
        const timings = { engineMs, buildMs: performance.now() - buildStart };
        const report = finishReport({ ...engineReport, deviation }, faces, timings, warnings, {
          tierReached,
          tier1: { ...tier1Report, arrangement: analytic.value.stats },
          tier2,
        });
        // The heatmap measures the shape actually returned (the last one measured).
        const measured =
          heatmap === undefined ? undefined : { ...heatmap, deviation: session.measured_deviation };
        return ok({ shape, solid: isSolid(shape), report, heatmap: measured, code });
      }
      fallback = {
        note: `tier 1 fell back to tier 0: ${analytic.reason}`,
        tier1: { ...tier1Report, fallbackReason: analytic.reason },
      };
    }
    const built = await buildShape(positions, triangles);
    if (!built.ok) return built;
    const timings = { engineMs, buildMs: performance.now() - buildStart };
    const warnings =
      fallback === undefined ? built.value.warnings : [...built.value.warnings, fallback.note];
    const report = finishReport(engineReport, built.value.faces, timings, warnings, {
      tierReached: 0,
      tier1: fallback?.tier1,
    });
    return ok({ shape: built.value.shape, solid: built.value.solid, report, heatmap });
  } finally {
    session?.free();
  }
}

/** Rebuild from the session's fitted surfaces, with gates scaled to the mesh's own sag. */
interface Gates {
  readonly tolerance: number;
  readonly coverage: number;
  readonly maxDeviation: number;
  readonly triangulation: number;
}

/** How close exact surfaces must come to the mesh, scaled to the mesh's own sag. */
function gatesFor(session: Tier1Session, engineReport: EngineReport): Gates {
  // Exact surfaces sit up to the mesh's sag away from it; our own
  // triangulation of the result adds its chord on the forward side.
  const sag = session.sag;
  const tol = session.tolerance;
  const { bboxMin, bboxMax } = engineReport.input;
  const diag = Math.hypot(...bboxMax.map((v, i) => v - (bboxMin[i] ?? 0)));
  // The mesher rejects a deflection near float precision; planar results are exact at any.
  const triangulation = Math.max(sag / 2, 2 * tol, 1e-6 * diag);
  return {
    tolerance: tol,
    coverage: 1.25 * sag + 10 * tol,
    maxDeviation: 1.25 * Math.max(sag, triangulation) + 20 * tol,
    triangulation,
  };
}

function runTier1(session: Tier1Session, engineReport: EngineReport, gates: Gates): AnalyticResult {
  if (engineReport.estimate.kind === 'scan') {
    return { ok: false, reason: 'the mesh looks like a scan; tier 1 rebuilds CAD exports' };
  }
  return buildAnalytic(
    {
      surfaces: decodeSurfaces(session.surface_kinds, session.surface_params),
      bounds: boundsOf(session.surface_bounds),
      tolerance: gates.tolerance,
      unfitTriangles: session.unfit_triangles,
      nearest: (pts) => session.nearest(pts),
      bodiesOf: (pts) => session.bodies_of(pts),
      bodyParent: session.body_parent,
      bodyClosed: session.body_closed,
      deviation: (p, i) => session.deviation(p, i),
    },
    gates
  );
}

function runTier2(shape: Shape, session: Tier1Session, gates: Gates): Tier2Result {
  try {
    return buildTier2(
      shape,
      { deviation: (p, i) => session.deviation(p, i) },
      decodeSurfaces(session.surface_kinds, session.surface_params),
      gates
    );
  } catch (e) {
    return { ok: false, reason: `the feature program failed: ${message(e)}` };
  }
}

function boundsOf(flat: Float64Array): Array<readonly [Vec3, Vec3]> {
  const out: Array<readonly [Vec3, Vec3]> = [];
  for (let i = 0; i + 5 < flat.length; i += 6) {
    const v = (k: number): number => flat[i + k] ?? 0;
    out.push([
      [v(0), v(1), v(2)],
      [v(3), v(4), v(5)],
    ]);
  }
  return out;
}
