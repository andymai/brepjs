/**
 * glTF 2.0 export — converts ShapeMesh data into a glTF JSON document.
 *
 * Produces a self-contained .gltf JSON (with embedded base64 buffer)
 * or raw .glb binary. No external dependencies.
 */

import type { ShapeMesh } from '../topology/meshFns.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** PBR material definition for glTF export. */
export interface GltfMaterial {
  name?: string;
  /** RGBA base color factor, each component 0–1. Default: [0.8, 0.8, 0.8, 1.0] */
  baseColor?: [number, number, number, number];
  /** Metallic factor 0–1. Default: 0 */
  metallic?: number;
  /** Roughness factor 0–1. Default: 0.5 */
  roughness?: number;
}

/** Options for glTF/GLB export. */
export interface GltfExportOptions {
  /** Map of faceId → material. FaceIds come from ShapeMesh.faceGroups[].faceId. */
  materials?: Map<number, GltfMaterial>;
}

// ---------------------------------------------------------------------------
// glTF types (subset of the spec we need)
// ---------------------------------------------------------------------------

interface GltfPrimitive {
  attributes: Record<string, number>;
  indices?: number;
  material?: number;
}

interface GltfMaterialDef {
  name: string;
  pbrMetallicRoughness: {
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor: number;
  };
}

interface GltfDocument {
  asset: { version: string; generator: string };
  scene: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: Array<{ mesh: number }>;
  meshes: Array<{ primitives: GltfPrimitive[] }>;
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
  materials?: GltfMaterialDef[];
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
// Helper: ArrayBuffer → base64 string
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(''));
}

// ---------------------------------------------------------------------------
// Export to glTF JSON (with embedded base64 buffer)
// ---------------------------------------------------------------------------

/**
 * Export a ShapeMesh to a glTF 2.0 JSON string with an embedded base64 buffer.
 * The resulting string is a self-contained .gltf file.
 */
export function exportGltf(mesh: ShapeMesh, options?: GltfExportOptions): string {
  const doc = buildGltfDocument(mesh, 'base64', options);
  return JSON.stringify(doc);
}

/**
 * Export a ShapeMesh to a .glb binary (ArrayBuffer).
 * This is a single binary file containing JSON + binary chunks.
 */
export function exportGlb(mesh: ShapeMesh, options?: GltfExportOptions): ArrayBuffer {
  const { doc, binBuffer } = buildGlbData(mesh, options);
  const jsonStr = JSON.stringify(doc);

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

function buildGltfDocument(
  mesh: ShapeMesh,
  mode: 'base64' | 'glb',
  options?: GltfExportOptions
): GltfDocument {
  const { vertices, normals, triangles } = mesh;
  const materialMap = options?.materials;

  // If materials are provided and face groups exist, create per-material primitives
  if (materialMap && materialMap.size > 0 && mesh.faceGroups.length > 0) {
    return buildGltfDocumentWithMaterials(mesh, mode, materialMap);
  }

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
    const binBuf = buildBinaryBuffer(mesh);
    doc.buffers[0] = {
      byteLength: totalByteLength,
      uri: 'data:application/octet-stream;base64,' + arrayBufferToBase64(binBuf),
    };
  }

  return doc;
}

/**
 * Build both the glTF document (for GLB mode) and the binary buffer.
 * Used by exportGlb to get the binary data alongside the document.
 */
function buildGlbData(
  mesh: ShapeMesh,
  options?: GltfExportOptions
): { doc: GltfDocument; binBuffer: ArrayBuffer } {
  const materialMap = options?.materials;
  if (materialMap && materialMap.size > 0 && mesh.faceGroups.length > 0) {
    const { doc, binBuffer } = buildGltfDocumentAndBufferWithMaterials(mesh, materialMap);
    return { doc, binBuffer };
  }
  const doc = buildGltfDocument(mesh, 'glb');
  return { doc, binBuffer: buildBinaryBuffer(mesh) };
}

/** Internal layout info for material-based primitives. */
interface MaterialPrimitiveLayout {
  primitiveData: Array<{ indices: Uint32Array; materialIdx: number }>;
  indexBufferInfos: Array<{ byteOffset: number; byteLength: number }>;
  verticesOffset: number;
  totalByteLength: number;
  uniqueMaterials: GltfMaterialDef[];
}

/**
 * Compute buffer layout and material grouping from mesh + materialMap.
 */
function computeMaterialLayout(
  mesh: ShapeMesh,
  materialMap: Map<number, GltfMaterial>
): MaterialPrimitiveLayout {
  const { vertices, normals, triangles, faceGroups } = mesh;

  // Build unique material list and assign indices using property-based dedup
  const uniqueMaterials: GltfMaterialDef[] = [];
  const materialKeyMap = new Map<string, number>();
  const materialRefMap = new Map<GltfMaterial, number>();
  for (const mat of materialMap.values()) {
    if (materialRefMap.has(mat)) continue;
    const key = JSON.stringify([mat.baseColor, mat.metallic, mat.roughness, mat.name]);
    const existing = materialKeyMap.get(key);
    if (existing !== undefined) {
      materialRefMap.set(mat, existing);
    } else {
      const idx = uniqueMaterials.length;
      materialKeyMap.set(key, idx);
      materialRefMap.set(mat, idx);
      uniqueMaterials.push({
        name: mat.name ?? `material_${idx}`,
        pbrMetallicRoughness: {
          baseColorFactor: mat.baseColor ?? [0.8, 0.8, 0.8, 1.0],
          metallicFactor: mat.metallic ?? 0,
          roughnessFactor: mat.roughness ?? 0.5,
        },
      });
    }
  }

  // Group face groups by material index (or -1 for no material)
  const groupsByMaterial = new Map<number, number[]>();
  for (let gi = 0; gi < faceGroups.length; gi++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- gi < length
    const fg = faceGroups[gi]!;
    const mat = materialMap.get(fg.faceId);
    const matIdx = mat !== undefined ? (materialRefMap.get(mat) ?? -1) : -1;
    const group = groupsByMaterial.get(matIdx);
    if (group) group.push(gi);
    else groupsByMaterial.set(matIdx, [gi]);
  }

  // Build per-primitive index arrays
  const primitiveData: Array<{ indices: Uint32Array; materialIdx: number }> = [];
  for (const [matIdx, groupIndices] of groupsByMaterial) {
    const allIndices: number[] = [];
    for (const gi of groupIndices) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- gi from groupIndices
      const fg = faceGroups[gi]!;
      for (let i = fg.start; i < fg.start + fg.count; i++) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- i within triangles bounds
        allIndices.push(triangles[i]!);
      }
    }
    primitiveData.push({
      indices: new Uint32Array(allIndices),
      materialIdx: matIdx,
    });
  }

  // Buffer layout: [indices_0][pad][indices_1][pad]...[vertices][normals]
  let indicesOffset = 0;
  const indexBufferInfos: Array<{ byteOffset: number; byteLength: number }> = [];
  for (const pd of primitiveData) {
    const byteLen = pd.indices.byteLength;
    indexBufferInfos.push({ byteOffset: indicesOffset, byteLength: byteLen });
    indicesOffset = align4(indicesOffset + byteLen);
  }
  const verticesOffset = indicesOffset;
  const normalsOffset = verticesOffset + vertices.byteLength;
  const totalByteLength = normalsOffset + normals.byteLength;

  return { primitiveData, indexBufferInfos, verticesOffset, totalByteLength, uniqueMaterials };
}

/**
 * Build a glTF document from material layout.
 */
function buildGltfDocFromLayout(mesh: ShapeMesh, layout: MaterialPrimitiveLayout): GltfDocument {
  const { vertices, normals } = mesh;
  const { primitiveData, indexBufferInfos, verticesOffset, totalByteLength, uniqueMaterials } =
    layout;
  const { min, max } = computeMinMax(vertices);

  const accessors: GltfDocument['accessors'] = [];
  const bufferViews: GltfDocument['bufferViews'] = [];
  const primitives: GltfPrimitive[] = [];

  // Vertices buffer view + accessor
  const verticesBvIdx = 0;
  bufferViews.push({
    buffer: 0,
    byteOffset: verticesOffset,
    byteLength: vertices.byteLength,
    target: ARRAY_BUFFER,
  });
  const verticesAccIdx = 0;
  accessors.push({
    bufferView: verticesBvIdx,
    componentType: FLOAT,
    count: vertices.length / 3,
    type: 'VEC3',
    min,
    max,
  });

  // Normals buffer view + accessor
  const normalsBvIdx = 1;
  bufferViews.push({
    buffer: 0,
    byteOffset: verticesOffset + vertices.byteLength,
    byteLength: normals.byteLength,
    target: ARRAY_BUFFER,
  });
  const normalsAccIdx = 1;
  accessors.push({
    bufferView: normalsBvIdx,
    componentType: FLOAT,
    count: normals.length / 3,
    type: 'VEC3',
  });

  // Per-primitive index buffer views + accessors
  for (let pi = 0; pi < primitiveData.length; pi++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- pi < length
    const pd = primitiveData[pi]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- pi < length
    const info = indexBufferInfos[pi]!;
    const bvIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: info.byteOffset,
      byteLength: info.byteLength,
      target: ELEMENT_ARRAY_BUFFER,
    });
    const accIdx = accessors.length;
    accessors.push({
      bufferView: bvIdx,
      componentType: UNSIGNED_INT,
      count: pd.indices.length,
      type: 'SCALAR',
    });

    const prim: GltfPrimitive = {
      attributes: { POSITION: verticesAccIdx, NORMAL: normalsAccIdx },
      indices: accIdx,
    };
    if (pd.materialIdx >= 0) prim.material = pd.materialIdx;
    primitives.push(prim);
  }

  return {
    asset: { version: '2.0', generator: 'brepjs' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: totalByteLength }],
    materials: uniqueMaterials,
  };
}

/**
 * Build binary buffer from material layout.
 */
function buildBinaryBufferFromLayout(
  mesh: ShapeMesh,
  layout: MaterialPrimitiveLayout
): ArrayBuffer {
  const { vertices, normals } = mesh;
  const { primitiveData, indexBufferInfos, verticesOffset, totalByteLength } = layout;
  const buffer = new ArrayBuffer(totalByteLength);
  const output = new Uint8Array(buffer);

  // Write index buffers
  for (let i = 0; i < primitiveData.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- i < length
    const pd = primitiveData[i]!;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- i < length
    const info = indexBufferInfos[i]!;
    output.set(
      new Uint8Array(pd.indices.buffer, pd.indices.byteOffset, pd.indices.byteLength),
      info.byteOffset
    );
  }

  // Write vertices and normals
  output.set(
    new Uint8Array(vertices.buffer, vertices.byteOffset, vertices.byteLength),
    verticesOffset
  );
  output.set(
    new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength),
    verticesOffset + vertices.byteLength
  );

  return buffer;
}

/**
 * Build a glTF document with per-material primitives (base64 mode).
 */
function buildGltfDocumentWithMaterials(
  mesh: ShapeMesh,
  _mode: 'base64' | 'glb',
  materialMap: Map<number, GltfMaterial>
): GltfDocument {
  const layout = computeMaterialLayout(mesh, materialMap);
  const doc = buildGltfDocFromLayout(mesh, layout);

  if (_mode === 'base64') {
    const buffer = buildBinaryBufferFromLayout(mesh, layout);
    doc.buffers[0] = {
      byteLength: layout.totalByteLength,
      uri: 'data:application/octet-stream;base64,' + arrayBufferToBase64(buffer),
    };
  }

  return doc;
}

/**
 * Build both glTF document and binary buffer for GLB with materials.
 */
function buildGltfDocumentAndBufferWithMaterials(
  mesh: ShapeMesh,
  materialMap: Map<number, GltfMaterial>
): { doc: GltfDocument; binBuffer: ArrayBuffer } {
  const layout = computeMaterialLayout(mesh, materialMap);
  const doc = buildGltfDocFromLayout(mesh, layout);
  const binBuffer = buildBinaryBufferFromLayout(mesh, layout);
  return { doc, binBuffer };
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
