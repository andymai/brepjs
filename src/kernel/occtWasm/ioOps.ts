/**
 * Import / export operations for the occt-wasm adapter.
 *
 * @module
 */

import type { KernelShape, KernelType, StepAssemblyPart } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmHandle, OcctWasmModule } from './occtWasmTypes.js';
import { handle, needsOcctWasm59, unwrap, wrapResult } from './helpers.js';
import { UnsupportedKernelOperationError } from '@/kernel/unsupported.js';
import {
  buildAsciiSTL,
  buildBinarySTL,
  DEFAULT_STL_ANGULAR_TOLERANCE,
  DEFAULT_STL_TOLERANCE,
} from '@/kernel/stlBuilder.js';

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

// Millimeters per unit, for every length unit occt-wasm's STEP writer accepts.
const MM_PER_UNIT: Readonly<Record<string, number>> = {
  mm: 1,
  millimeter: 1,
  millimetre: 1,
  cm: 10,
  centimeter: 10,
  centimetre: 10,
  m: 1000,
  meter: 1000,
  metre: 1000,
  km: 1e6,
  kilometer: 1e6,
  kilometre: 1e6,
  in: 25.4,
  inch: 25.4,
  ft: 304.8,
  foot: 304.8,
  feet: 304.8,
  mi: 1609344,
  mile: 1609344,
  mil: 0.0254,
  thou: 0.0254,
  um: 1e-3,
  micron: 1e-3,
  micrometer: 1e-3,
  micrometre: 1e-3,
  uin: 2.54e-5,
  microinch: 2.54e-5,
};

interface StepUnitOptions {
  unit?: string | undefined;
  modelUnit?: string | undefined;
}

interface StepUnits {
  /** The unit the file's lengths are written in. */
  readonly write: string;
  /** Factor taking the shapes' numbers to millimeters. */
  readonly modelScale: number;
}

function mmPerUnit(unit: string): number {
  const mm = MM_PER_UNIT[unit.toLowerCase()];
  if (mm === undefined) throw new Error(`occt-wasm: unknown STEP length unit '${unit}'`);
  return mm;
}

/**
 * brepjs writes lengths in `unit` and reads the shapes as `modelUnit`, which
 * defaults to `unit` (so `unit` alone relabels and does not scale). occt-wasm
 * reads shapes as millimeters and scales them into the unit written, so a
 * model in another unit is scaled to millimeters first.
 */
function resolveStepUnits(options: StepUnitOptions | undefined): StepUnits {
  const write = options?.unit ?? options?.modelUnit ?? 'mm';
  return { write, modelScale: mmPerUnit(options?.modelUnit ?? write) };
}

/**
 * The writer for `units`: the 5.9 unit-aware one, else the millimeter-only
 * one when the file is in millimeters anyway.
 */
function stepWriter(
  withUnit: ((id: number, unit: string) => string) | undefined,
  inMillimeters: (id: number) => string,
  units: StepUnits
): (id: number) => string {
  if (withUnit) return (id) => withUnit(id, units.write);
  if (mmPerUnit(units.write) === 1) return inMillimeters;
  throw needsOcctWasm59(`STEP export in '${units.write}'`);
}

/** Run `use` on `id` scaled by `factor` about the origin, releasing the scaled copy. */
function withScaled<T>(k: OcctKernelWasm, id: number, factor: number, use: (id: number) => T): T {
  if (factor === 1) return use(id);
  const scaled = k.scale(id, 0, 0, 0, factor);
  try {
    return use(scaled);
  } finally {
    k.release(scaled);
  }
}

/** One STEP file holding every shape (as a compound when there are several). */
function writeStepShapes(
  k: OcctKernelWasm,
  makeCompound: CompoundFn,
  shapes: KernelShape[],
  units: StepUnits
): string {
  const write = stepWriter(k.exportStepWithUnit?.bind(k), (id) => k.exportStep(id), units);
  if (shapes.length === 1) return withScaled(k, unwrap(shapes[0]), units.modelScale, write);
  const compoundId = unwrap(makeCompound(shapes));
  try {
    return withScaled(k, compoundId, units.modelScale, write);
  } finally {
    k.release(compoundId);
  }
}

export function exportSTEP(
  k: OcctKernelWasm,
  makeCompound: CompoundFn,
  shapes: KernelShape[]
): string {
  return writeStepShapes(k, makeCompound, shapes, resolveStepUnits(undefined));
}

export function exportSTL(
  mesh: MeshFn,
  shape: KernelShape,
  binary?: boolean,
  tolerance = DEFAULT_STL_TOLERANCE,
  angularTolerance = DEFAULT_STL_ANGULAR_TOLERANCE
): string | ArrayBuffer {
  // Build STL in JS from the triangulation for both formats. The native
  // exportStl returns its payload as a JS string (lossy for binary bytes via
  // WASM string marshalling) and only takes linear deflection, so building from
  // the mesh both sidesteps the marshalling bug and honours angularTolerance —
  // mirroring exportGLB/OBJ/PLY.
  const { vertices, triangles } = mesh(shape, { tolerance, angularTolerance, skipNormals: true });
  return binary ? buildBinarySTL(vertices, triangles) : buildAsciiSTL(vertices, triangles);
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
  const exportIges = k.exportIges?.bind(k);
  if (!exportIges)
    throw new UnsupportedKernelOperationError('occt-wasm: exportIGES is unsupported');
  if (shapes.length === 1) {
    return exportIges(unwrap(shapes[0]));
  }
  const compound = makeCompound(shapes);
  return exportIges(unwrap(compound));
}

export function importIGES(k: OcctKernelWasm, data: string | ArrayBuffer): KernelShape[] {
  const importIges = k.importIges?.bind(k);
  if (!importIges)
    throw new UnsupportedKernelOperationError('occt-wasm: importIGES is unsupported');
  const str = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const id = importIges(str);
  return [wrapResult(k, id)];
}

export function exportSTEPAssembly(
  k: OcctKernelWasm,
  parts: StepAssemblyPart[],
  options?: { unit?: string }
): string {
  if (parts.length === 0) return '';
  return writeXcafParts(k, parts, resolveStepUnits(options));
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
  return new TextEncoder().encode(lines.join('\n') + '\n').buffer;
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
  return new TextEncoder().encode(lines.join('\n') + '\n').buffer;
}

export function toBREP(k: OcctKernelWasm, shape: KernelShape): string {
  return k.toBREP(unwrap(shape));
}

export function fromBREP(k: OcctKernelWasm, data: string): KernelShape {
  return wrapResult(k, k.fromBREP(data));
}

interface XcafPart {
  readonly shape: KernelShape;
  readonly name?: string | undefined;
  readonly color?: [number, number, number, number] | undefined;
}

/**
 * A document handle that can rebuild its parts scaled for a model unit. The
 * document's geometry can't be read back, so `retainedId` holds a compound of
 * the parts (sharing their geometry, so it outlives the caller's handles) and
 * `labels` their names and colors, in the same order.
 */
interface XcafDocHandle extends OcctWasmHandle {
  readonly retainedId: number;
  readonly labels: ReadonlyArray<Omit<XcafPart, 'shape'>>;
}

function addXcafParts(k: OcctKernelWasm, parts: readonly XcafPart[]): number {
  // occt-wasm exposes the XCAF document API as discrete xcaf* kernel methods
  // (there is no single createXCAFDocument binding). Build the document by
  // adding each shape as a free part, then tagging its name and color.
  const docId = k.xcafNewDocument();
  for (const entry of parts) {
    const labelId = k.xcafAddShape(docId, unwrap(entry.shape));
    if (entry.name) k.xcafSetName(docId, labelId, entry.name);
    if (entry.color) {
      // Colors arrive 0-255 (see exporterFns); xcafSetColor wants 0-1.
      const [r, g, b] = entry.color;
      k.xcafSetColor(docId, labelId, r / 255, g / 255, b / 255);
    }
  }
  return docId;
}

function writeXcafDoc(k: OcctKernelWasm, docId: number, units: StepUnits): string {
  const roots = k.xcafGetRootLabels(docId);
  try {
    if (roots.size() === 0) return '';
  } finally {
    roots.delete();
  }
  return stepWriter(k.xcafExportSTEPWithUnit?.bind(k), (id) => k.xcafExportSTEP(id), units)(docId);
}

/** Write `parts` as one XCAF STEP file, scaling each into millimeters first if needed. */
function writeXcafParts(k: OcctKernelWasm, parts: readonly XcafPart[], units: StepUnits): string {
  const scaled: number[] = [];
  try {
    const placed = parts.map((part) => {
      if (units.modelScale === 1) return part;
      const id = k.scale(unwrap(part.shape), 0, 0, 0, units.modelScale);
      scaled.push(id);
      return { ...part, shape: id };
    });
    const docId = addXcafParts(k, placed);
    try {
      return writeXcafDoc(k, docId, units);
    } finally {
      k.xcafClose(docId);
    }
  } finally {
    for (const id of scaled) k.release(id);
  }
}

export function createXCAFDocument(
  k: OcctKernelWasm,
  makeCompound: CompoundFn,
  shapes: Array<{
    shape: KernelShape;
    name: string;
    color?: [number, number, number, number] | undefined;
  }>
): KernelType {
  // The doc id is carried in a handle; delete() is a noop for occt-wasm, so
  // writeXCAFToSTEP closes the document and releases the retained compound.
  const retainedId = unwrap(makeCompound(shapes.map((s) => s.shape)));
  try {
    const doc: XcafDocHandle = {
      ...handle('compound', addXcafParts(k, shapes)),
      retainedId,
      labels: shapes.map(({ name, color }) => ({ name, color })),
    };
    return doc;
  } catch (e) {
    k.release(retainedId);
    throw e;
  }
}

export function writeXCAFToSTEP(
  k: OcctKernelWasm,
  doc: KernelType,
  options?: StepUnitOptions
): string {
  const docId = unwrap(doc);
  const { retainedId, labels } = doc as Partial<XcafDocHandle>;
  try {
    const units = resolveStepUnits(options);
    if (units.modelScale === 1) return writeXcafDoc(k, docId, units);
    // The document holds the shapes at model scale; rebuild it from the retained
    // parts, scaled into millimeters.
    if (retainedId === undefined || labels === undefined) {
      throw new Error('occt-wasm: this XCAF document does not record its parts');
    }
    return writeScaledXcafParts(k, retainedId, labels, units);
  } finally {
    k.xcafClose(docId);
    if (retainedId !== undefined) k.release(retainedId);
  }
}

/** Scale the retained compound once and write its children as the labeled parts. */
function writeScaledXcafParts(
  k: OcctKernelWasm,
  retainedId: number,
  labels: ReadonlyArray<Omit<XcafPart, 'shape'>>,
  units: StepUnits
): string {
  const scaledId = k.scale(retainedId, 0, 0, 0, units.modelScale);
  const children = k.iterShapes(scaledId);
  const childIds: number[] = [];
  try {
    for (let i = 0; i < children.size(); i++) childIds.push(children.get(i));
    const parts = labels.map((label, i) => ({
      ...label,
      shape: handle('compound', childIds[i] ?? 0),
    }));
    return writeXcafParts(k, parts, { ...units, modelScale: 1 });
  } finally {
    children.delete();
    for (const id of childIds) k.release(id);
    k.release(scaledId);
  }
}

export function exportSTEPConfigured(
  k: OcctKernelWasm,
  makeCompound: CompoundFn,
  shapes: XcafPart[],
  options?: StepUnitOptions & { schema?: number | undefined }
): string {
  if (shapes.length === 0) return '';
  const units = resolveStepUnits(options);
  // Like the opencascade adapter: plain STEP unless a part carries a name or color.
  if (!shapes.some((s) => s.name || s.color)) {
    return writeStepShapes(
      k,
      makeCompound,
      shapes.map((s) => s.shape),
      units
    );
  }
  return writeXcafParts(k, shapes, units);
}
