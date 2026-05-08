/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Import / export operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, KernelType, StepAssemblyPart } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmModule } from './occtWasmTypes.js';
import { handle, unwrap, wrapResult } from './helpers.js';

interface Vec3Bounds {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
}

function computePositionBounds(positions: Float32Array, vCount: number): Vec3Bounds {
  if (vCount === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < vCount; i++) {
    const o = i * 3;
    const x = positions[o] ?? 0;
    const y = positions[o + 1] ?? 0;
    const z = positions[o + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

function buildGltfManifest(
  vCount: number,
  nCount: number,
  iCount: number,
  posBytes: number,
  nrmBytes: number,
  idxBytes: number,
  bufferLength: number,
  bounds: Vec3Bounds
): object {
  return {
    asset: { version: '2.0', generator: 'brepjs occt-wasm' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, mode: 4 }],
      },
    ],
    buffers: [{ byteLength: bufferLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: nrmBytes, target: 34962 },
      {
        buffer: 0,
        byteOffset: posBytes + nrmBytes,
        byteLength: idxBytes,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: vCount,
        type: 'VEC3',
        min: bounds.min,
        max: bounds.max,
      },
      { bufferView: 1, componentType: 5126, count: nCount, type: 'VEC3' },
      { bufferView: 2, componentType: 5125, count: iCount, type: 'SCALAR' },
    ],
  };
}

/** Adapter forms a compound from a list of shapes (delegates to constructionOps). */
type CompoundFn = (shapes: KernelShape[]) => KernelShape;

/** Adapter mesh callback for GLB/OBJ/PLY exports. */
type MeshFn = (
  shape: KernelShape,
  options: { tolerance: number; angularTolerance: number; skipNormals: boolean }
) => {
  vertices: Float32Array;
  normals: Float32Array;
  triangles: Uint32Array;
  faceGroups: ReadonlyArray<{ start: number; count: number; faceHash: number }>;
};

export function exportSTEP(
  k: OcctKernelWasm,
  makeCompound: CompoundFn,
  shapes: KernelShape[]
): string {
  if (shapes.length === 1) {
    return k.exportStep(unwrap(shapes[0] as KernelShape));
  }
  const compound = makeCompound(shapes);
  return k.exportStep(unwrap(compound));
}

export function exportSTL(
  k: OcctKernelWasm,
  shape: KernelShape,
  binary?: boolean
): string | ArrayBuffer {
  const ascii = !binary;
  const result = k.exportStl(unwrap(shape), 0.1, ascii);
  if (binary) {
    const buf = new ArrayBuffer(result.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < result.length; i++) view[i] = result.charCodeAt(i);
    return buf;
  }
  return result;
}

export function importSTEP(k: OcctKernelWasm, data: string | ArrayBuffer): KernelShape[] {
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const id = k.importStep(str);
  return [wrapResult(k, id)];
}

export function importSTL(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  data: string | ArrayBuffer
): KernelShape {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const mod = Module as OcctWasmModule & {
    FS?: { writeFile(path: string, data: Uint8Array): void };
  };
  if (mod.FS) {
    mod.FS.writeFile('/tmp/import.stl', bytes);
  } else {
    // Fallback: pass as Latin-1 string (works for ASCII STL only)
    const str = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    const id = k.importStl(str);
    return wrapResult(k, id);
  }
  // Empty string sentinel — the C++ side reads from /tmp/import.stl
  const id = k.importStl('');
  return wrapResult(k, id);
}

export function exportIGES(
  k: OcctKernelWasm,
  makeCompound: CompoundFn,
  shapes: KernelShape[]
): string {
  if (shapes.length === 1) {
    return k.exportIges(unwrap(shapes[0] as KernelShape));
  }
  const compound = makeCompound(shapes);
  return k.exportIges(unwrap(compound));
}

export function importIGES(k: OcctKernelWasm, data: string | ArrayBuffer): KernelShape[] {
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const id = k.importIges(str);
  return [wrapResult(k, id)];
}

export function exportSTEPAssembly(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  parts: StepAssemblyPart[],
  _options?: { unit?: string }
): string {
  if (parts.length === 0) return '';
  const doc = createXCAFDocument(k, Module, parts);
  try {
    return writeXCAFToSTEP(k, doc);
  } finally {
    doc.delete();
  }
}

export function exportGLB(mesh: MeshFn, shape: KernelShape, tolerance: number): ArrayBuffer {
  const result = mesh(shape, { tolerance, angularTolerance: 0.5, skipNormals: false });
  const positions = result.vertices;
  const normals = result.normals;
  const indices = result.triangles;
  const vCount = positions.length / 3;
  const nCount = normals.length / 3;
  const iCount = indices.length;

  const posBytes = positions.byteLength;
  const nrmBytes = normals.byteLength;
  const idxBytes = indices.byteLength;
  const binLength = posBytes + nrmBytes + idxBytes;
  const paddedBinLength = binLength + ((4 - (binLength % 4)) % 4);

  const manifest = buildGltfManifest(
    vCount,
    nCount,
    iCount,
    posBytes,
    nrmBytes,
    idxBytes,
    paddedBinLength,
    computePositionBounds(positions, vCount)
  );
  const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const paddedJsonLength = jsonBytes.byteLength + ((4 - (jsonBytes.byteLength % 4)) % 4);

  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinLength;
  const glb = new ArrayBuffer(totalLength);
  const view = new DataView(glb);

  view.setUint32(0, 0x46546c67, true); // 'glTF' magic
  view.setUint32(4, 2, true); // version
  view.setUint32(8, totalLength, true);
  view.setUint32(12, paddedJsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  const jsonDst = new Uint8Array(glb, 20, paddedJsonLength);
  jsonDst.set(jsonBytes);
  for (let i = jsonBytes.byteLength; i < paddedJsonLength; i++) jsonDst[i] = 0x20;

  const binHeaderOffset = 20 + paddedJsonLength;
  view.setUint32(binHeaderOffset, paddedBinLength, true);
  view.setUint32(binHeaderOffset + 4, 0x004e4942, true); // 'BIN\0'
  const binDataOffset = binHeaderOffset + 8;
  new Uint8Array(glb, binDataOffset, posBytes).set(
    new Uint8Array(positions.buffer, positions.byteOffset, posBytes)
  );
  new Uint8Array(glb, binDataOffset + posBytes, nrmBytes).set(
    new Uint8Array(normals.buffer, normals.byteOffset, nrmBytes)
  );
  new Uint8Array(glb, binDataOffset + posBytes + nrmBytes, idxBytes).set(
    new Uint8Array(indices.buffer, indices.byteOffset, idxBytes)
  );
  return glb;
}

export function exportOBJ(mesh: MeshFn, shape: KernelShape, tolerance: number): ArrayBuffer {
  const result = mesh(shape, { tolerance, angularTolerance: 0.5, skipNormals: false });
  const v = result.vertices;
  const n = result.normals;
  const t = result.triangles;

  const lines: string[] = ['# brepjs OBJ export'];
  const vCount = v.length / 3;
  for (let i = 0; i < vCount; i++) {
    const o = i * 3;
    lines.push(`v ${v[o] ?? 0} ${v[o + 1] ?? 0} ${v[o + 2] ?? 0}`);
  }
  const nCount = n.length / 3;
  for (let i = 0; i < nCount; i++) {
    const o = i * 3;
    lines.push(`vn ${n[o] ?? 0} ${n[o + 1] ?? 0} ${n[o + 2] ?? 0}`);
  }
  const pushTri = (offset: number) => {
    const a = (t[offset] ?? 0) + 1;
    const b = (t[offset + 1] ?? 0) + 1;
    const c = (t[offset + 2] ?? 0) + 1;
    lines.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
  };
  if (result.faceGroups.length > 0) {
    for (const group of result.faceGroups) {
      lines.push(`g face_${group.faceHash}`);
      const count = group.count / 3;
      for (let i = 0; i < count; i++) pushTri(group.start + i * 3);
    }
  } else {
    const triCount = t.length / 3;
    for (let i = 0; i < triCount; i++) pushTri(i * 3);
  }
  return new TextEncoder().encode(lines.join('\n') + '\n').buffer as ArrayBuffer;
}

export function exportPLY(mesh: MeshFn, shape: KernelShape, tolerance: number): ArrayBuffer {
  const result = mesh(shape, { tolerance, angularTolerance: 0.5, skipNormals: false });
  const v = result.vertices;
  const n = result.normals;
  const t = result.triangles;
  const vCount = v.length / 3;
  const triCount = t.length / 3;
  const hasNormals = n.length === v.length;

  const lines: string[] = [
    'ply',
    'format ascii 1.0',
    'comment brepjs PLY export',
    `element vertex ${vCount}`,
    'property float x',
    'property float y',
    'property float z',
  ];
  if (hasNormals) {
    lines.push('property float nx', 'property float ny', 'property float nz');
  }
  lines.push(`element face ${triCount}`, 'property list uchar int vertex_index', 'end_header');
  for (let i = 0; i < vCount; i++) {
    const o = i * 3;
    const x = v[o] ?? 0;
    const y = v[o + 1] ?? 0;
    const z = v[o + 2] ?? 0;
    if (hasNormals) {
      const nx = n[o] ?? 0;
      const ny = n[o + 1] ?? 0;
      const nz = n[o + 2] ?? 0;
      lines.push(`${x} ${y} ${z} ${nx} ${ny} ${nz}`);
    } else {
      lines.push(`${x} ${y} ${z}`);
    }
  }
  for (let i = 0; i < triCount; i++) {
    const a = t[i * 3] ?? 0;
    const b = t[i * 3 + 1] ?? 0;
    const c = t[i * 3 + 2] ?? 0;
    lines.push(`3 ${a} ${b} ${c}`);
  }
  return new TextEncoder().encode(lines.join('\n') + '\n').buffer as ArrayBuffer;
}

export function toBREP(k: OcctKernelWasm, shape: KernelShape): string {
  return k.toBREP(unwrap(shape));
}

export function fromBREP(k: OcctKernelWasm, data: string): KernelShape {
  return wrapResult(k, k.fromBREP(data));
}

export function createXCAFDocument(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: Array<{
    shape: KernelShape;
    name: string;
    color?: [number, number, number, number] | undefined;
  }>
): KernelType {
  const ids = new Module.VectorUint32();
  const colors = new Module.VectorDouble();
  const nameParts: string[] = [];
  for (const entry of shapes) {
    ids.push_back(unwrap(entry.shape));
    nameParts.push(entry.name);
    const [r, g, b, a] = entry.color ?? [0.5, 0.5, 0.5, 1];
    colors.push_back(r);
    colors.push_back(g);
    colors.push_back(b);
    colors.push_back(a);
  }
  try {
    const joinedNames = nameParts.join('\0');
    const docId = k.createXCAFDocument(ids, joinedNames, colors);
    // brepjs-patterns-disable: no-double-cast
    return handle('compound', docId);
  } finally {
    ids.delete();
    colors.delete();
  }
}

export function writeXCAFToSTEP(
  k: OcctKernelWasm,
  doc: KernelType,
  _options?: { unit?: string | undefined; modelUnit?: string | undefined }
): string {
  // brepjs-patterns-disable: no-double-cast
  const id = unwrap(doc);
  const subs = k.getSubShapes(id, 'solid');
  let hasSolids = false;
  try {
    hasSolids = subs.size() > 0;
  } finally {
    subs.delete();
  }
  if (!hasSolids) {
    const faces = k.getSubShapes(id, 'face');
    let hasFaces = false;
    try {
      hasFaces = faces.size() > 0;
    } finally {
      faces.delete();
    }
    if (!hasFaces) return '';
  }
  return k.writeXCAFToSTEP(id);
}

export function exportSTEPConfigured(
  k: OcctKernelWasm,
  Module: OcctWasmModule,
  shapes: Array<{
    shape: KernelShape;
    name?: string | undefined;
    color?: [number, number, number, number] | undefined;
  }>,
  _options?: {
    unit?: string | undefined;
    modelUnit?: string | undefined;
    schema?: number | undefined;
  }
): string {
  if (shapes.length === 0) return '';
  const named = shapes.map((s) => ({ shape: s.shape, name: s.name ?? '', color: s.color }));
  const doc = createXCAFDocument(k, Module, named);
  try {
    return writeXCAFToSTEP(k, doc);
  } finally {
    doc.delete();
  }
}
