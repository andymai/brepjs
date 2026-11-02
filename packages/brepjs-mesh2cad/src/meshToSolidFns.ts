import { type Result, err, ioError, moduleInitError, ok, validationError } from 'brepjs';
import { buildShape } from './buildFns.js';
import { loadMeshEngine } from './engine.js';
import { type EngineReport, finishReport } from './reportFns.js';
import type { MeshInput, MeshToSolidOptions, MeshToSolidResult } from './types.js';

const UNITS = new Set(['auto', 'um', 'mm', 'cm', 'm', 'in', 'ft']);
const DEFAULT_MAX_TRIANGLES = 200_000;

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
  if (!(Number.isInteger(maxTriangles) && maxTriangles >= 4)) {
    return err(
      validationError('MESH_BAD_BUDGET', `maxTriangles must be an integer ≥ 4, got ${maxTriangles}`)
    );
  }
  const fill = o.fillHoles ?? true;
  if (typeof fill === 'number' && !(Number.isInteger(fill) && fill >= 3)) {
    return err(
      validationError(
        'MESH_BAD_FILL',
        `fillHoles must be a boolean or an edge count ≥ 3, got ${fill}`
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
 * @example
 * ```ts
 * const res = await meshToSolid(file);
 * if (res.ok && res.value.solid) {
 *   const step = exportSTEP(res.value.shape);
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
      moduleInitError(
        'MESH_ENGINE_LOAD_FAILED',
        `could not load brepjs-mesh2cad-wasm: ${message(e)}`,
        e
      )
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = await toBytes(input);
  } catch (e) {
    return err(ioError('MESH_READ_FAILED', `could not read the mesh input: ${message(e)}`, e));
  }
  const engineStart = performance.now();
  let raw;
  try {
    raw = engine.convert_tier0(
      bytes,
      hintFor(input, options),
      args.value.unit,
      args.value.tolerance,
      args.value.maxTriangles,
      args.value.fillHoles,
      options.heatmap === true
    );
  } catch (e) {
    return err(ioError('MESH_CONVERT_FAILED', message(e), e));
  }
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
  const built = await buildShape(positions, triangles);
  if (!built.ok) return built;
  const timings = { engineMs, buildMs: performance.now() - buildStart };
  const report = finishReport(engineReport, built.value.faces, timings, built.value.warnings);
  return ok({ shape: built.value.shape, solid: built.value.solid, report, heatmap });
}
