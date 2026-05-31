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
}
type Importer = (b: Blob) => Promise<{ ok: boolean }>;

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
export async function loadModel(bk: BrepjsForLoad, blob: Blob, ext: string): Promise<MeshData> {
  const result = await importerFor(bk, ext)(blob);
  if (!bk.isOk(result)) {
    const err = (result as { error?: unknown }).error;
    throw new Error(`import failed: ${typeof err === 'string' ? err : JSON.stringify(err)}`);
  }
  const shape = (result as unknown as { value: unknown }).value;
  return shapeMeshToMeshData(bk.mesh(shape), bk.meshEdges(shape).lines);
}
