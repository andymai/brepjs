import { type Result, type Vec3, err, ioError, moduleInitError, ok } from 'brepjs';
import { loadMeshEngine } from './engine.js';
import { hintFor, message, toBytes } from './inputFns.js';
import { unitSuggestions } from './reportFns.js';
import type { MeshFormat, MeshInput, MeshInspection, MeshUnit } from './types.js';

const MM_PER: Record<MeshUnit, number> = { um: 0.001, mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

interface EngineInspection {
  readonly format: MeshFormat;
  readonly unit: MeshUnit | null;
  readonly triangles: number;
  readonly bboxMin: Vec3;
  readonly bboxMax: Vec3;
}

/**
 * Read a mesh only far enough to confirm its units before converting it: its
 * format, the unit it declares (3MF), its triangle count, and its size in its
 * own units, with the units worth offering when it declares none and its size
 * as millimeters looks implausible. Much faster than `meshToSolid`, which also
 * repairs, measures, and decimates.
 */
export async function inspectMesh(
  input: MeshInput,
  options: { readonly fileName?: string | undefined } = {}
): Promise<Result<MeshInspection>> {
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
  let raw: EngineInspection;
  try {
    raw = JSON.parse(engine.inspect(bytes, hintFor(input, options))) as EngineInspection;
  } catch (e) {
    return err(ioError('MESH_READ_FAILED', message(e), e));
  }
  const size: [number, number, number] = [
    raw.bboxMax[0] - raw.bboxMin[0],
    raw.bboxMax[1] - raw.bboxMin[1],
    raw.bboxMax[2] - raw.bboxMin[2],
  ];
  const largestMm = Math.max(...size) * MM_PER[raw.unit ?? 'mm'];
  return ok({
    format: raw.format,
    unit: raw.unit,
    triangles: raw.triangles,
    size,
    suggestions: unitSuggestions(largestMm, raw.unit === null ? 'assumed' : 'file'),
  });
}
