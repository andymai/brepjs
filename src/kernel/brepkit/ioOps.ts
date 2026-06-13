/**
 * File I/O operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, KernelType, StepAssemblyPart } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import {
  type BrepkitHandle,
  solidHandle,
  unwrapSolidOrThrow,
  unwrapSolidsForExport,
  toArray,
  copyWasmBytes,
  noop,
  warnOnce,
} from './helpers.js';
import { wasmIndex } from '@/utils/vec3.js';
import {
  buildAsciiSTL,
  buildBinarySTL,
  DEFAULT_STL_ANGULAR_TOLERANCE,
  DEFAULT_STL_TOLERANCE,
} from '@/kernel/stlBuilder.js';
import { mesh } from './meshOps.js';

export function exportSTEP(bk: BrepkitKernel, shapes: KernelShape[]): string {
  if (shapes.length === 0) return '';
  // brepkit exports one solid at a time -- concatenate for multi-shape
  const parts: string[] = [];
  for (const shape of shapes) {
    const solidIds = unwrapSolidsForExport(bk, shape, 'exportSTEP');
    for (const sid of solidIds) {
      const bytes: Uint8Array = bk.exportStep(sid);
      parts.push(new TextDecoder().decode(bytes));
    }
  }
  return parts.join('\n');
}

export function exportSTL(
  bk: BrepkitKernel,
  shape: KernelShape,
  binary?: boolean,
  tolerance = DEFAULT_STL_TOLERANCE,
  angularTolerance = DEFAULT_STL_ANGULAR_TOLERANCE
): string | ArrayBuffer {
  const solidIds = unwrapSolidsForExport(bk, shape, 'exportSTL');
  // Use the first solid; STL format doesn't natively support multi-solid.
  // Build STL from the mesh rather than native exportStl so that both tolerance
  // and angularTolerance are threaded through (native exportStl takes only a
  // fixed linear deflection) — mirroring the occt-wasm adapter.
  const { vertices, triangles } = mesh(bk, solidHandle(wasmIndex(solidIds, 0)), {
    tolerance,
    angularTolerance,
    skipNormals: true,
  });
  return binary ? buildBinarySTL(vertices, triangles) : buildAsciiSTL(vertices, triangles);
}

export function importSTEP(bk: BrepkitKernel, data: string | ArrayBuffer): KernelShape[] {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return toArray(bk.importStep(bytes)).map(solidHandle);
}

export function importSTL(bk: BrepkitKernel, data: string | ArrayBuffer): KernelShape {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const id: number = bk.importStl(bytes);
  return solidHandle(id);
}

export function exportIGES(bk: BrepkitKernel, shapes: KernelShape[]): string {
  if (shapes.length === 0) return '';
  const parts: string[] = [];
  for (const shape of shapes) {
    const solidIds = unwrapSolidsForExport(bk, shape, 'exportIGES');
    for (const sid of solidIds) {
      const bytes: Uint8Array = bk.exportIges(sid);
      parts.push(new TextDecoder().decode(bytes));
    }
  }
  return parts.join('\n');
}

export function importIGES(bk: BrepkitKernel, data: string | ArrayBuffer): KernelShape[] {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return toArray(bk.importIges(bytes)).map(solidHandle);
}

export function exportSTEPAssembly(
  bk: BrepkitKernel,
  parts: StepAssemblyPart[],
  _options?: { unit?: string }
): string {
  // brepkit doesn't support named/colored assembly export yet.
  // Fall back to exporting all shapes concatenated.
  if (parts.length === 0) return '';
  const shapes = parts.map((p) => p.shape);
  return exportSTEP(bk, shapes);
}

export function export3MF(bk: BrepkitKernel, shape: KernelShape, tolerance: number): ArrayBuffer {
  const solidId = unwrapSolidOrThrow(shape, 'export3MF');
  return copyWasmBytes(bk.export3mf(solidId, tolerance));
}

export function exportGLB(bk: BrepkitKernel, shape: KernelShape, tolerance: number): ArrayBuffer {
  const solidId = unwrapSolidOrThrow(shape, 'exportGLB');
  return copyWasmBytes(bk.exportGlb(solidId, tolerance));
}

export function exportOBJ(bk: BrepkitKernel, shape: KernelShape, tolerance: number): ArrayBuffer {
  const solidId = unwrapSolidOrThrow(shape, 'exportOBJ');
  return copyWasmBytes(bk.exportObj(solidId, tolerance));
}

export function exportPLY(bk: BrepkitKernel, shape: KernelShape, tolerance: number): ArrayBuffer {
  const solidId = unwrapSolidOrThrow(shape, 'exportPLY');
  return copyWasmBytes(bk.exportPly(solidId, tolerance));
}

export function import3MF(bk: BrepkitKernel, data: ArrayBuffer): KernelShape[] {
  const result = toArray(bk.import3mf(new Uint8Array(data)));
  return result.map((id) => solidHandle(id));
}

export function importOBJ(bk: BrepkitKernel, data: ArrayBuffer): KernelShape {
  const result = bk.importObj(new Uint8Array(data));
  return solidHandle(result);
}

export function importGLB(bk: BrepkitKernel, data: ArrayBuffer): KernelShape {
  const result = bk.importGlb(new Uint8Array(data));
  return solidHandle(result);
}

export function toBREP(bk: BrepkitKernel, shape: KernelShape): string {
  const h = shape as BrepkitHandle;
  if (h.type === 'solid') {
    return bk.toBREP(h.id);
  }
  // Non-solid shapes: fall back to STEP serialization
  warnOnce('brep-non-solid', 'toBREP for non-solid shapes uses STEP format.');
  return exportSTEP(bk, [shape]);
}

export function fromBREP(bk: BrepkitKernel, data: string): KernelShape {
  // Try native JSON round-trip if available and data is JSON
  if (typeof bk.fromBREP === 'function' && data.trimStart().startsWith('{')) {
    const id = bk.fromBREP(data);
    return solidHandle(id);
  }
  // Fallback to STEP import
  const shapes = importSTEP(bk, data);
  const first = shapes[0];
  if (!first) throw new Error('brepkit: fromBREP produced no shapes');
  return first;
}

export function createXCAFDocument(
  _bk: BrepkitKernel,
  shapes: Array<{
    shape: KernelShape;
    name: string;
    color?: [number, number, number, number] | undefined;
  }>
): KernelType {
  // brepkit doesn't have XCAF -- store as plain object for writeXCAFToSTEP
  return { __brepkit_xcaf: true, shapes, delete: noop };
}

export function writeXCAFToSTEP(
  bk: BrepkitKernel,
  doc: KernelType,
  _options?: { unit?: string | undefined; modelUnit?: string | undefined }
): string {
  // Extract shapes from the XCAF document object and export as STEP
  if (doc && doc.__brepkit_xcaf && Array.isArray(doc.shapes)) {
    return exportSTEP(
      bk,
      doc.shapes.map((s: { shape: KernelShape }) => s.shape)
    );
  }
  return '';
}

export function exportSTEPConfigured(
  bk: BrepkitKernel,
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
  // Fall back to basic STEP export (no names/colors)
  return exportSTEP(
    bk,
    shapes.map((s) => s.shape)
  );
}

/** Co-located factory: returns the file-I/O slice of {@link KernelAdapter} bound to `bk`. */
// brepjs-patterns-disable: max-function-lines
export function makeIoOps(bk: BrepkitKernel) {
  return {
    exportSTEP: (shapes) => exportSTEP(bk, shapes),
    exportSTL: (shape, binary, tolerance, angularTolerance) =>
      exportSTL(bk, shape, binary, tolerance, angularTolerance),
    importSTEP: (data) => importSTEP(bk, data),
    importSTL: (data) => importSTL(bk, data),
    exportIGES: (shapes) => exportIGES(bk, shapes),
    importIGES: (data) => importIGES(bk, data),
    exportSTEPAssembly: (parts, options) => exportSTEPAssembly(bk, parts, options),
    export3MF: (shape, tolerance) => export3MF(bk, shape, tolerance),
    exportGLB: (shape, tolerance) => exportGLB(bk, shape, tolerance),
    exportOBJ: (shape, tolerance) => exportOBJ(bk, shape, tolerance),
    exportPLY: (shape, tolerance) => exportPLY(bk, shape, tolerance),
    import3MF: (data) => import3MF(bk, data),
    importOBJ: (data) => importOBJ(bk, data),
    importGLB: (data) => importGLB(bk, data),
    toBREP: (shape) => toBREP(bk, shape),
    fromBREP: (data) => fromBREP(bk, data),
    createXCAFDocument: (shapes) => createXCAFDocument(bk, shapes),
    writeXCAFToSTEP: (doc, options) => writeXCAFToSTEP(bk, doc, options),
    exportSTEPConfigured: (shapes, options) => exportSTEPConfigured(bk, shapes, options),
  } satisfies Pick<
    KernelAdapter,
    | 'exportSTEP'
    | 'exportSTL'
    | 'importSTEP'
    | 'importSTL'
    | 'exportIGES'
    | 'importIGES'
    | 'exportSTEPAssembly'
    | 'export3MF'
    | 'exportGLB'
    | 'exportOBJ'
    | 'exportPLY'
    | 'import3MF'
    | 'importOBJ'
    | 'importGLB'
    | 'toBREP'
    | 'fromBREP'
    | 'createXCAFDocument'
    | 'writeXCAFToSTEP'
    | 'exportSTEPConfigured'
  >;
}
