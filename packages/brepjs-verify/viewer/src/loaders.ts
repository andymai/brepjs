import type { MeshData } from 'brepjs-viewer';
import { shapeMeshToMeshData, type ShapeMeshLike } from './convert.js';

// Structural view of the brepjs namespace this module uses; injected by the worker
// (so we never hold a second kernel instance). The test fake implements the same surface.
export interface BrepjsForLoad {
  isOk: (r: { ok: boolean }) => boolean;
  importSTEP: (b: Blob) => Promise<{ ok: boolean }>;
  importSTL: (b: Blob) => Promise<{ ok: boolean }>;
  importIGES: (b: Blob) => Promise<{ ok: boolean }>;
  importThreeMF: (b: Blob) => Promise<{ ok: boolean }>;
  importGLB: (b: Blob) => Promise<{ ok: boolean }>;
  importOBJ: (b: Blob) => Promise<{ ok: boolean }>;
  mesh: (s: unknown) => ShapeMeshLike;
  meshEdges: (s: unknown) => { lines: Float32Array };
  measureVolume: (s: unknown) => { ok: boolean; value?: number };
  measureArea: (s: unknown) => { ok: boolean; value?: number };
  isValid: (s: unknown) => boolean;
}
type Importer = (b: Blob) => Promise<{ ok: boolean }>;

export interface ModelMeasurements {
  volume?: number;
  area?: number;
  valid: boolean;
}
export interface LoadedModel {
  meshData: MeshData;
  measurements: ModelMeasurements;
}

// Best-effort measurements: a non-solid import has no volume, so guard each call and
// only surface what the kernel returns cleanly. Validity always resolves to a boolean.
function measureModel(bk: BrepjsForLoad, shape: unknown): ModelMeasurements {
  const m: ModelMeasurements = { valid: safe(() => bk.isValid(shape)) ?? false };
  const vol = safe(() => bk.measureVolume(shape));
  if (vol && bk.isOk(vol) && typeof vol.value === 'number' && vol.value > 0) m.volume = vol.value;
  const area = safe(() => bk.measureArea(shape));
  if (area && bk.isOk(area) && typeof area.value === 'number' && area.value > 0) m.area = area.value;
  return m;
}
function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function importerFor(bk: BrepjsForLoad, ext: string): Importer {
  switch (ext.replace(/^\./, '').toLowerCase()) {
    case 'step':
    case 'stp':
      return bk.importSTEP;
    case 'stl':
      return bk.importSTL;
    case 'iges':
    case 'igs':
      return bk.importIGES;
    case '3mf':
      return bk.importThreeMF;
    case 'glb':
    case 'gltf':
      return bk.importGLB;
    case 'obj':
      return bk.importOBJ;
    default:
      throw new Error(`unsupported file extension: ${ext}`);
  }
}
export async function loadModel(bk: BrepjsForLoad, blob: Blob, ext: string): Promise<LoadedModel> {
  const result = await importerFor(bk, ext)(blob);
  if (!bk.isOk(result)) {
    const err = (result as { error?: unknown }).error;
    throw new Error(`import failed: ${typeof err === 'string' ? err : JSON.stringify(err)}`);
  }
  const shape = (result as unknown as { value: unknown }).value;
  const meshData = shapeMeshToMeshData(bk.mesh(shape), bk.meshEdges(shape).lines);
  return { meshData, measurements: measureModel(bk, shape) };
}
