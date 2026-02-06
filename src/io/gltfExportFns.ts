/**
 * glTF 2.0 export — converts ShapeMesh data into a glTF JSON document.
 *
 * Produces a self-contained .gltf JSON (with embedded base64 buffer)
 * or raw .glb binary. No external dependencies.
 */

import type { ShapeMesh } from '../topology/meshFns.js';

// ---------------------------------------------------------------------------
// glTF types (subset of the spec we need)
// ---------------------------------------------------------------------------

interface GltfDocument {
  asset: { version: string; generator: string };
  scene: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: Array<{ mesh: number }>;
  meshes: Array<{
    primitives: Array<{
      attributes: Record<string, number>;
      indices?: number;
    }>;
  }>;
  accessors: Array<{
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
    max?: number[];
    min?: number[];
  }>;
  bufferViews: Array<{
    buffer: number;
    byteOffset: number;
    byteLength: number;
    target?: number;
  }>;
  buffers: Array<{
    byteLength: number;
    uri?: string;
  }>;
}

// glTF constants
const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

// ---------------------------------------------------------------------------
// Helper: compute min/max of a Float32Array in groups of 3
// ---------------------------------------------------------------------------

function computeMinMax(data: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < data.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const v = data[i + j]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (v < min[j]!) min[j] = v;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (v > max[j]!) max[j] = v;
    }
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// Helper: pad byte length to 4-byte alignment
// ---------------------------------------------------------------------------

function align4(n: number): number {
  return (n + 3) & ~3;
}

// ---------------------------------------------------------------------------
// Export to glTF JSON (with embedded base64 buffer)
// ---------------------------------------------------------------------------

/**
 * Export a ShapeMesh to a glTF 2.0 JSON string with an embedded base64 buffer.
 * The resulting string is a self-contained .gltf file.
 */
export function exportGltf(mesh: ShapeMesh): string {
  const doc = buildGltfDocument(mesh, 'base64');
  return JSON.stringify(doc);
}

/**
 * Export a ShapeMesh to a .glb binary (ArrayBuffer).
 * This is a single binary file containing JSON + binary chunks.
 */
export function exportGlb(mesh: ShapeMesh): ArrayBuffer {
  const doc = buildGltfDocument(mesh, 'glb');
  const jsonStr = JSON.stringify(doc);

  // Build the binary buffer
  const binBuffer = buildBinaryBuffer(mesh);

  // Encode JSON chunk (pad with spaces to 4-byte alignment)
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(jsonStr);
  const jsonPadded = align4(jsonBytes.length);
  const jsonChunk = new Uint8Array(jsonPadded);
  jsonChunk.set(jsonBytes);
  for (let i = jsonBytes.length; i < jsonPadded; i++) jsonChunk[i] = 0x20; // space

  // Binary chunk (pad with zeros)
  const binPadded = align4(binBuffer.byteLength);
  const binChunk = new Uint8Array(binPadded);
  binChunk.set(new Uint8Array(binBuffer));

  // GLB header: magic + version + total length
  const totalLength = 12 + 8 + jsonPadded + 8 + binPadded;
  const glb = new ArrayBuffer(totalLength);
  const view = new DataView(glb);
  const output = new Uint8Array(glb);

  // Header
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true); // version 2
  view.setUint32(8, totalLength, true);

  // JSON chunk
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  output.set(jsonChunk, 20);

  // Binary chunk
  const binOffset = 20 + jsonPadded;
  view.setUint32(binOffset, binPadded, true);
  view.setUint32(binOffset + 4, 0x004e4942, true); // "BIN\0"
  output.set(binChunk, binOffset + 8);

  return glb;
}

// ---------------------------------------------------------------------------
// Internal: build the glTF document
// ---------------------------------------------------------------------------

function buildGltfDocument(mesh: ShapeMesh, mode: 'base64' | 'glb'): GltfDocument {
  const { vertices, normals, triangles } = mesh;

  const indicesByteLength = triangles.byteLength;
  const verticesByteLength = vertices.byteLength;
  const normalsByteLength = normals.byteLength;
  const totalByteLength = align4(indicesByteLength) + verticesByteLength + normalsByteLength;

  const { min, max } = computeMinMax(vertices);

  const doc: GltfDocument = {
    asset: { version: '2.0', generator: 'brepjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 1, NORMAL: 2 },
            indices: 0,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: UNSIGNED_INT,
        count: triangles.length,
        type: 'SCALAR',
      },
      {
        bufferView: 1,
        componentType: FLOAT,
        count: vertices.length / 3,
        type: 'VEC3',
        min,
        max,
      },
      {
        bufferView: 2,
        componentType: FLOAT,
        count: normals.length / 3,
        type: 'VEC3',
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: indicesByteLength,
        target: ELEMENT_ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: align4(indicesByteLength),
        byteLength: verticesByteLength,
        target: ARRAY_BUFFER,
      },
      {
        buffer: 0,
        byteOffset: align4(indicesByteLength) + verticesByteLength,
        byteLength: normalsByteLength,
        target: ARRAY_BUFFER,
      },
    ],
    buffers: [
      {
        byteLength: totalByteLength,
      },
    ],
  };

  if (mode === 'base64') {
    const buffer = buildBinaryBuffer(mesh);
    const bytes = new Uint8Array(buffer);
    const CHUNK = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const binary = chunks.join('');
    doc.buffers[0] = {
      byteLength: totalByteLength,
      uri: 'data:application/octet-stream;base64,' + btoa(binary),
    };
  }

  return doc;
}

function buildBinaryBuffer(mesh: ShapeMesh): ArrayBuffer {
  const { vertices, normals, triangles } = mesh;
  const indicesByteLength = triangles.byteLength;
  const verticesByteLength = vertices.byteLength;
  const normalsByteLength = normals.byteLength;
  const totalByteLength = align4(indicesByteLength) + verticesByteLength + normalsByteLength;

  const buffer = new ArrayBuffer(totalByteLength);
  const output = new Uint8Array(buffer);

  output.set(new Uint8Array(triangles.buffer, triangles.byteOffset, indicesByteLength), 0);
  output.set(
    new Uint8Array(vertices.buffer, vertices.byteOffset, verticesByteLength),
    align4(indicesByteLength)
  );
  output.set(
    new Uint8Array(normals.buffer, normals.byteOffset, normalsByteLength),
    align4(indicesByteLength) + verticesByteLength
  );

  return buffer;
}
