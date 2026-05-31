/**
 * File I/O operations for the manifold adapter.
 *
 * Mesh formats (STL/OBJ/PLY) are encoded/decoded directly from the Manifold
 * mesh — they never replay onto a B-rep kernel. Imported meshes are raw-mesh
 * origins, so their op-node is `replayable: false`.
 *
 * B-rep formats (STEP/IGES/BREP/XCAF) and GLB/3MF remain stubs; the replay
 * phase implements the former and GLB/3MF have no manifold-3d encoder.
 * @module
 */

import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { KernelIOOps } from '@/kernel/interfaces/ioOps.js';
import type { KernelShape, KernelType, StepAssemblyPart } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { makeNode } from './opGraph.js';
import { type ManifoldShape, nodeOf, occtOrThrow, unwrap, wrap } from './meshHandle.js';
import { replay } from './replay.js';

interface RawMesh {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
  numProp?: number;
}

function meshOf(shape: KernelShape): RawMesh {
  return unwrap(shape as ManifoldShape).getMesh() as RawMesh;
}

function vertexStride(mesh: RawMesh): number {
  return mesh.numProp && mesh.numProp >= 3 ? mesh.numProp : 3;
}

function vertexCount(mesh: RawMesh): number {
  return Math.floor(mesh.vertProperties.length / vertexStride(mesh));
}

function vertexAt(mesh: RawMesh, i: number): [number, number, number] {
  const base = i * vertexStride(mesh);
  return [
    mesh.vertProperties[base] ?? 0,
    mesh.vertProperties[base + 1] ?? 0,
    mesh.vertProperties[base + 2] ?? 0,
  ];
}

function triangleAt(mesh: RawMesh, t: number): [number, number, number] {
  const base = t * 3;
  return [mesh.triVerts[base] ?? 0, mesh.triVerts[base + 1] ?? 0, mesh.triVerts[base + 2] ?? 0];
}

function faceNormal(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number]
): [number, number, number] {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function exportSTL(shape: KernelShape, binary?: boolean): string | ArrayBuffer {
  const mesh = meshOf(shape);
  const triCount = Math.floor(mesh.triVerts.length / 3);
  if (binary) {
    const buffer = new ArrayBuffer(84 + triCount * 50);
    const view = new DataView(buffer);
    view.setUint32(80, triCount, true);
    let offset = 84;
    for (let t = 0; t < triCount; t++) {
      const [ia, ib, ic] = triangleAt(mesh, t);
      const a = vertexAt(mesh, ia);
      const b = vertexAt(mesh, ib);
      const c = vertexAt(mesh, ic);
      const n = faceNormal(a, b, c);
      view.setFloat32(offset, n[0], true);
      view.setFloat32(offset + 4, n[1], true);
      view.setFloat32(offset + 8, n[2], true);
      offset += 12;
      for (const v of [a, b, c]) {
        view.setFloat32(offset, v[0], true);
        view.setFloat32(offset + 4, v[1], true);
        view.setFloat32(offset + 8, v[2], true);
        offset += 12;
      }
      view.setUint16(offset, 0, true);
      offset += 2;
    }
    return buffer;
  }

  const lines: string[] = ['solid manifold'];
  for (let t = 0; t < triCount; t++) {
    const [ia, ib, ic] = triangleAt(mesh, t);
    const a = vertexAt(mesh, ia);
    const b = vertexAt(mesh, ib);
    const c = vertexAt(mesh, ic);
    const n = faceNormal(a, b, c);
    lines.push(`  facet normal ${n[0]} ${n[1]} ${n[2]}`);
    lines.push('    outer loop');
    for (const v of [a, b, c]) {
      lines.push(`      vertex ${v[0]} ${v[1]} ${v[2]}`);
    }
    lines.push('    endloop');
    lines.push('  endfacet');
  }
  lines.push('endsolid manifold');
  return lines.join('\n');
}

function exportOBJ(shape: KernelShape): ArrayBuffer {
  const mesh = meshOf(shape);
  const vertCount = vertexCount(mesh);
  const triCount = Math.floor(mesh.triVerts.length / 3);
  const lines: string[] = ['# exported by brepjs manifold kernel'];
  for (let i = 0; i < vertCount; i++) {
    const v = vertexAt(mesh, i);
    lines.push(`v ${v[0]} ${v[1]} ${v[2]}`);
  }
  for (let t = 0; t < triCount; t++) {
    const [ia, ib, ic] = triangleAt(mesh, t);
    lines.push(`f ${ia + 1} ${ib + 1} ${ic + 1}`);
  }
  return new TextEncoder().encode(lines.join('\n')).buffer;
}

function exportPLY(shape: KernelShape): ArrayBuffer {
  const mesh = meshOf(shape);
  const vertCount = vertexCount(mesh);
  const triCount = Math.floor(mesh.triVerts.length / 3);

  const header =
    `ply\nformat binary_little_endian 1.0\n` +
    `element vertex ${vertCount}\n` +
    `property float x\nproperty float y\nproperty float z\n` +
    `element face ${triCount}\n` +
    `property list uchar uint vertex_indices\n` +
    `end_header\n`;
  const headerBytes = new TextEncoder().encode(header);

  const body = new ArrayBuffer(vertCount * 12 + triCount * (1 + 12));
  const view = new DataView(body);
  let offset = 0;
  for (let i = 0; i < vertCount; i++) {
    const v = vertexAt(mesh, i);
    view.setFloat32(offset, v[0], true);
    view.setFloat32(offset + 4, v[1], true);
    view.setFloat32(offset + 8, v[2], true);
    offset += 12;
  }
  for (let t = 0; t < triCount; t++) {
    const [ia, ib, ic] = triangleAt(mesh, t);
    view.setUint8(offset, 3);
    offset += 1;
    view.setUint32(offset, ia, true);
    view.setUint32(offset + 4, ib, true);
    view.setUint32(offset + 8, ic, true);
    offset += 12;
  }

  const out = new Uint8Array(headerBytes.length + body.byteLength);
  out.set(headerBytes, 0);
  out.set(new Uint8Array(body), headerBytes.length);
  return out.buffer;
}

function meshToManifold(module: ManifoldModule, mesh: RawMesh, op = 'importMesh'): ManifoldShape {
  const built = new module.Mesh({
    numProp: 3,
    vertProperties: mesh.vertProperties,
    triVerts: mesh.triVerts,
  });
  const solid = new module.Manifold(built);
  return wrap(solid, makeNode(op, {}, []));
}

function parseOBJ(module: ManifoldModule, data: ArrayBufferLike): ManifoldShape {
  const text = new TextDecoder().decode(new Uint8Array(data));
  const verts: number[] = [];
  const tris: number[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('v ')) {
      const parts = line.slice(2).trim().split(/\s+/);
      verts.push(Number(parts[0]), Number(parts[1]), Number(parts[2]));
    } else if (line.startsWith('f ')) {
      const idx = line
        .slice(2)
        .trim()
        .split(/\s+/)
        .map((tok) => {
          const first = tok.split('/')[0] ?? '';
          const n = Number(first);
          return n > 0 ? n - 1 : verts.length / 3 + n;
        });
      for (let i = 1; i + 1 < idx.length; i++) {
        tris.push(idx[0] ?? 0, idx[i] ?? 0, idx[i + 1] ?? 0);
      }
    }
  }
  return meshToManifold(module, {
    vertProperties: Float32Array.from(verts),
    triVerts: Uint32Array.from(tris),
  });
}

function parseSTL(module: ManifoldModule, data: ArrayBufferLike): ManifoldShape {
  const bytes = new Uint8Array(data);
  const ascii = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 80)));
  const isAscii = ascii.trimStart().toLowerCase().startsWith('solid') && looksLikeAsciiStl(bytes);

  const verts: number[] = [];

  if (isAscii) {
    const text = new TextDecoder().decode(bytes);
    const nums = text.match(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g) ?? [];
    for (const match of nums) {
      const parts = match.trim().split(/\s+/);
      verts.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
    }
  } else {
    const view = new DataView(data);
    const triCount = view.getUint32(80, true);
    let offset = 84;
    for (let t = 0; t < triCount; t++) {
      offset += 12;
      for (let v = 0; v < 3; v++) {
        verts.push(
          view.getFloat32(offset, true),
          view.getFloat32(offset + 4, true),
          view.getFloat32(offset + 8, true)
        );
        offset += 12;
      }
      offset += 2;
    }
  }

  // STL stores per-facet vertex soup; weld coincident vertices so Manifold sees
  // a watertight indexed mesh instead of disconnected triangles.
  const welded = weldVertices(verts);
  return meshToManifold(module, {
    vertProperties: Float32Array.from(welded.vertices),
    triVerts: Uint32Array.from(welded.indices),
  });
}

const WELD_QUANTUM = 1e6;

/** Deduplicate coincident vertices (quantized to ~1e-6) and remap triangle indices. */
function weldVertices(flat: readonly number[]): {
  vertices: number[];
  indices: number[];
} {
  const vertices: number[] = [];
  const indices: number[] = [];
  const lookup = new Map<string, number>();
  for (let i = 0; i + 2 < flat.length; i += 3) {
    const x = flat[i] ?? 0;
    const y = flat[i + 1] ?? 0;
    const z = flat[i + 2] ?? 0;
    const key = `${Math.round(x * WELD_QUANTUM)},${Math.round(y * WELD_QUANTUM)},${Math.round(z * WELD_QUANTUM)}`;
    let index = lookup.get(key);
    if (index === undefined) {
      index = vertices.length / 3;
      lookup.set(key, index);
      vertices.push(x, y, z);
    }
    indices.push(index);
  }
  return { vertices, indices };
}

function looksLikeAsciiStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return true;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triCount = view.getUint32(80, true);
  return 84 + triCount * 50 !== bytes.length;
}

const FACET_SEW_TOLERANCE = 1e-6;

function brepFromReplay(occt: KernelAdapter, shape: KernelShape): KernelShape | undefined {
  const node = nodeOf(shape as ManifoldShape);
  if (!node.replayable) return undefined;
  return replay(node, occt);
}

/**
 * Facet a manifold mesh into an occt solid: build a triangular face per triangle
 * and sew them into a shell/solid. Used when exact B-rep is unavailable.
 */
function faceted(occt: KernelAdapter, shape: KernelShape): KernelShape {
  const mesh = meshOf(shape);
  const triCount = Math.floor(mesh.triVerts.length / 3);
  const faces: KernelShape[] = [];
  for (let t = 0; t < triCount; t++) {
    const [ia, ib, ic] = triangleAt(mesh, t);
    const face = occt.buildTriFace(vertexAt(mesh, ia), vertexAt(mesh, ib), vertexAt(mesh, ic));
    if (face) faces.push(face);
  }
  if (faces.length === 0) {
    throw new Error('manifold: cannot export — shape has no triangles to facet');
  }
  return occt.sewAndSolidify(faces, FACET_SEW_TOLERANCE);
}

/**
 * Produce a B-rep shape for export: replay the exact op-graph when possible,
 * otherwise facet the mesh and warn. Throws if no B-rep kernel is registered.
 */
function brepForExport(shape: KernelShape): { occt: KernelAdapter; brep: KernelShape } {
  const occt = occtOrThrow('B-rep export');
  const exact = brepFromReplay(occt, shape);
  if (exact !== undefined) return { occt, brep: exact };

  console.warn(
    'manifold: exact B-rep unavailable (non-replayable op-graph); exporting faceted approximation'
  );
  return { occt, brep: faceted(occt, shape) };
}

/**
 * Wrap a B-rep shape imported via occt back onto a manifold solid by tessellating
 * it. The resulting handle is a raw-mesh origin (`replayable: false`).
 */
function brepToManifold(
  module: ManifoldModule,
  occt: KernelAdapter,
  brep: KernelShape,
  op: string
): ManifoldShape {
  const meshResult = occt.mesh(brep, { tolerance: 0.01, angularTolerance: 0.5 });
  const vertProperties = Float32Array.from(meshResult.vertices);
  const triVerts = Uint32Array.from(meshResult.triangles);
  return meshToManifold(module, { vertProperties, triVerts }, op);
}

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_CHUNK_JSON = 0x4e4f534a;
const GLB_CHUNK_BIN = 0x004e4942;
const GLTF_FLOAT = 5126;
const GLTF_UNSIGNED_INT = 5125;
const GLTF_UNSIGNED_SHORT = 5123;
const GLTF_UNSIGNED_BYTE = 5121;
const GLTF_ARRAY_BUFFER = 34962;
const GLTF_ELEMENT_ARRAY_BUFFER = 34963;
const GLTF_TRIANGLES = 4;

function pad4(n: number): number {
  return (n + 3) & ~3;
}

function exportGLB(shape: KernelShape): ArrayBuffer {
  const mesh = meshOf(shape);
  const stride = mesh.numProp && mesh.numProp >= 3 ? mesh.numProp : 3;
  const vertCount = Math.floor(mesh.vertProperties.length / stride);
  const indexCount = mesh.triVerts.length;

  const positions = new Float32Array(vertCount * 3);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < vertCount; i++) {
    const x = mesh.vertProperties[i * stride] ?? 0;
    const y = mesh.vertProperties[i * stride + 1] ?? 0;
    const z = mesh.vertProperties[i * stride + 2] ?? 0;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (vertCount === 0) {
    minX = minY = minZ = maxX = maxY = maxZ = 0;
  }
  const indices = Uint32Array.from(mesh.triVerts);

  const posBytes = positions.byteLength;
  const idxByteOffset = pad4(posBytes);
  const binLength = idxByteOffset + indices.byteLength;

  const gltf = {
    asset: { version: '2.0', generator: 'brepjs manifold kernel' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: GLTF_TRIANGLES }],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: GLTF_FLOAT,
        count: vertCount,
        type: 'VEC3',
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
      },
      {
        bufferView: 1,
        componentType: GLTF_UNSIGNED_INT,
        count: indexCount,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: GLTF_ARRAY_BUFFER },
      {
        buffer: 0,
        byteOffset: idxByteOffset,
        byteLength: indices.byteLength,
        target: GLTF_ELEMENT_ARRAY_BUFFER,
      },
    ],
    buffers: [{ byteLength: binLength }],
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonChunkLength = pad4(jsonBytes.length);
  const binChunkLength = pad4(binLength);

  const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;
  const out = new ArrayBuffer(totalLength);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);

  let offset = 12;
  view.setUint32(offset, jsonChunkLength, true);
  view.setUint32(offset + 4, GLB_CHUNK_JSON, true);
  offset += 8;
  bytes.set(jsonBytes, offset);
  for (let i = jsonBytes.length; i < jsonChunkLength; i++) bytes[offset + i] = 0x20;
  offset += jsonChunkLength;

  view.setUint32(offset, binChunkLength, true);
  view.setUint32(offset + 4, GLB_CHUNK_BIN, true);
  offset += 8;
  bytes.set(new Uint8Array(positions.buffer, positions.byteOffset, posBytes), offset);
  bytes.set(
    new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength),
    offset + idxByteOffset
  );

  return out;
}

function parseGLB(module: ManifoldModule, data: ArrayBuffer): ManifoldShape {
  const view = new DataView(data);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('manifold: importGLB — not a binary glTF (bad magic)');
  }
  const totalLength = view.getUint32(8, true);

  let json: unknown;
  let bin: Uint8Array | undefined;
  let offset = 12;
  while (offset < totalLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const body = new Uint8Array(data, offset + 8, chunkLength);
    if (chunkType === GLB_CHUNK_JSON) {
      json = JSON.parse(new TextDecoder().decode(body));
    } else if (chunkType === GLB_CHUNK_BIN) {
      bin = body;
    }
    offset += 8 + chunkLength;
  }

  if (!json || typeof json !== 'object' || !bin) {
    throw new Error('manifold: importGLB — missing JSON or BIN chunk');
  }

  interface GltfAccessor {
    bufferView: number;
    componentType: number;
    count: number;
    type: string;
  }
  interface GltfBufferView {
    byteOffset?: number;
    byteLength: number;
  }
  const gltf = json as {
    accessors?: GltfAccessor[];
    bufferViews?: GltfBufferView[];
    meshes?: Array<{
      primitives: Array<{ attributes: { POSITION?: number }; indices?: number }>;
    }>;
  };

  const primitive = gltf.meshes?.[0]?.primitives[0];
  const accessors = gltf.accessors ?? [];
  const bufferViews = gltf.bufferViews ?? [];
  if (!primitive || primitive.attributes.POSITION === undefined) {
    throw new Error('manifold: importGLB — no POSITION attribute');
  }

  const posAccessor = accessors[primitive.attributes.POSITION];
  if (!posAccessor) {
    throw new Error('manifold: importGLB — invalid POSITION accessor');
  }
  const posView = bufferViews[posAccessor.bufferView];
  if (!posView) {
    throw new Error('manifold: importGLB — invalid POSITION bufferView');
  }
  const vertProperties = new Float32Array(
    bin.buffer.slice(
      bin.byteOffset + (posView.byteOffset ?? 0),
      bin.byteOffset + (posView.byteOffset ?? 0) + posAccessor.count * 3 * 4
    )
  );

  let triVerts: Uint32Array;
  if (primitive.indices !== undefined) {
    const idxAccessor = accessors[primitive.indices];
    if (!idxAccessor) {
      throw new Error('manifold: importGLB — invalid indices accessor');
    }
    const idxView = bufferViews[idxAccessor.bufferView];
    if (!idxView) {
      throw new Error('manifold: importGLB — invalid indices bufferView');
    }
    const stride =
      idxAccessor.componentType === GLTF_UNSIGNED_INT
        ? 4
        : idxAccessor.componentType === GLTF_UNSIGNED_SHORT
          ? 2
          : idxAccessor.componentType === GLTF_UNSIGNED_BYTE
            ? 1
            : 0;
    if (stride === 0) {
      throw new Error(
        `manifold: importGLB — unsupported index component type ${idxAccessor.componentType}`
      );
    }
    const base = bin.byteOffset + (idxView.byteOffset ?? 0);
    const idxDataView = new DataView(bin.buffer, base, idxAccessor.count * stride);
    triVerts = new Uint32Array(idxAccessor.count);
    for (let i = 0; i < idxAccessor.count; i++) {
      const off = i * stride;
      triVerts[i] =
        stride === 4
          ? idxDataView.getUint32(off, true)
          : stride === 2
            ? idxDataView.getUint16(off, true)
            : idxDataView.getUint8(off);
    }
  } else {
    triVerts = Uint32Array.from({ length: posAccessor.count }, (_v, i) => i);
  }

  return meshToManifold(module, { vertProperties, triVerts }, 'importGLB');
}

export function makeIoOps(module: ManifoldModule): KernelIOOps {
  return {
    exportSTL: (shape, binary) => exportSTL(shape, binary),
    exportOBJ: (shape) => exportOBJ(shape),
    exportPLY: (shape) => exportPLY(shape),
    importSTL: (data) =>
      parseSTL(module, typeof data === 'string' ? new TextEncoder().encode(data).buffer : data),
    importOBJ: (data) => parseOBJ(module, data),

    // B-rep formats: replay the exact op-graph onto occt, else facet + warn.
    exportSTEP: (shapes) => {
      const occt = occtOrThrow('exportSTEP');
      return occt.exportSTEP(shapes.map((shape) => brepForExport(shape).brep));
    },
    exportIGES: (shapes) => {
      const occt = occtOrThrow('exportIGES');
      return occt.exportIGES(shapes.map((shape) => brepForExport(shape).brep));
    },
    toBREP: (shape) => {
      const { occt, brep } = brepForExport(shape);
      return occt.toBREP(brep);
    },
    exportSTEPAssembly: (parts: StepAssemblyPart[], options) => {
      const occt = occtOrThrow('exportSTEPAssembly');
      const mapped = parts.map((part): StepAssemblyPart => {
        const base: StepAssemblyPart = {
          shape: brepForExport(part.shape).brep,
          name: part.name,
        };
        return part.color === undefined ? base : { ...base, color: part.color };
      });
      return occt.exportSTEPAssembly(mapped, options);
    },
    createXCAFDocument: (shapes): KernelType => {
      const occt = occtOrThrow('createXCAFDocument');
      const mapped = shapes.map((entry) => {
        const base: { shape: KernelShape; name: string; color?: [number, number, number, number] } =
          {
            shape: brepForExport(entry.shape).brep,
            name: entry.name,
          };
        return entry.color === undefined ? base : { ...base, color: entry.color };
      });
      return occt.createXCAFDocument(mapped);
    },
    writeXCAFToSTEP: (doc: KernelType, options) =>
      occtOrThrow('writeXCAFToSTEP').writeXCAFToSTEP(doc, options),
    exportSTEPConfigured: (shapes, options) => {
      const occt = occtOrThrow('exportSTEPConfigured');
      const mapped = shapes.map((entry) => {
        const base: {
          shape: KernelShape;
          name?: string;
          color?: [number, number, number, number];
        } = { shape: brepForExport(entry.shape).brep };
        const withName = entry.name === undefined ? base : { ...base, name: entry.name };
        return entry.color === undefined ? withName : { ...withName, color: entry.color };
      });
      return occt.exportSTEPConfigured(mapped, options);
    },

    importSTEP: (data) => {
      const occt = occtOrThrow('importSTEP');
      return occt.importSTEP(data).map((brep) => brepToManifold(module, occt, brep, 'importSTEP'));
    },
    importIGES: (data) => {
      const occt = occtOrThrow('importIGES');
      return occt.importIGES(data).map((brep) => brepToManifold(module, occt, brep, 'importIGES'));
    },
    fromBREP: (data) => {
      const occt = occtOrThrow('fromBREP');
      return brepToManifold(module, occt, occt.fromBREP(data), 'fromBREP');
    },

    exportGLB: (shape) => exportGLB(shape),
    importGLB: (data) => parseGLB(module, data),

    // 3MF is an OPC (ZIP) container; no zip dependency is available and adding one
    // is out of scope for the mesh kernel — export GLB/STL/OBJ or use a B-rep kernel.
    export3MF: () => {
      throw new Error(
        'manifold: 3MF IO is unsupported on the mesh kernel; export GLB/STL/OBJ or use a B-rep kernel'
      );
    },
    import3MF: () => {
      throw new Error(
        'manifold: 3MF IO is unsupported on the mesh kernel; export GLB/STL/OBJ or use a B-rep kernel'
      );
    },
  };
}
