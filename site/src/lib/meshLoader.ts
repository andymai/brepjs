import type { SerializedMesh } from '../components/landing/LiveViewer3D';

/**
 * Load a precomputed mesh from a binary .bin file.
 * Binary format: [4x uint32 counts] [position f32] [normal f32] [index u32] [edges f32]
 */
export async function loadPrecomputedMesh(exampleId: string): Promise<SerializedMesh | null> {
  try {
    const resp = await fetch(`/gallery-meshes/${exampleId}.bin`);
    if (!resp.ok) return null;

    const buffer = await resp.arrayBuffer();
    const header = new Uint32Array(buffer, 0, 4);
    const posCount = header[0];
    const normCount = header[1];
    const idxCount = header[2];
    const edgeCount = header[3];

    let offset = 16; // 4 * 4 bytes header

    const position = new Float32Array(buffer, offset, posCount);
    offset += posCount * 4;

    const normal = new Float32Array(buffer, offset, normCount);
    offset += normCount * 4;

    const index = new Uint32Array(buffer, offset, idxCount);
    offset += idxCount * 4;

    const edges = new Float32Array(buffer, offset, edgeCount);

    return { position, normal, index, edges };
  } catch {
    return null;
  }
}
