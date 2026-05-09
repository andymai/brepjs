/**
 * File I/O operations for the brepkit adapter.
 * @module
 */

import type { BrepkitKernel } from './brepkitWasmTypes.js';
import type { KernelShape, KernelType, StepAssemblyPart } from '@/kernel/types.js';
import {
  type BrepkitHandle,
  solidHandle,
  unwrapSolidOrThrow,
  unwrapSolidsForExport,
  toArray,
  copyWasmBytes,
  noop,
  warnOnce,
  DEFAULT_DEFLECTION,
} from './helpers.js';
import { wasmIndex } from '@/utils/vec3.js';

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
  binary?: boolean
): string | ArrayBuffer {
  const solidIds = unwrapSolidsForExport(bk, shape, 'exportSTL');
  // Use the first solid; STL format doesn't natively support multi-solid
  if (binary) {
    const bytes: Uint8Array = bk.exportStl(wasmIndex(solidIds, 0), DEFAULT_DEFLECTION);
    return bytes.buffer as ArrayBuffer;
  }
  const bytes: Uint8Array = bk.exportStlAscii(wasmIndex(solidIds, 0), DEFAULT_DEFLECTION);
  return new TextDecoder().decode(bytes);
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
  shapes: Array<{ shape: KernelShape; name: string; color?: [number, number, number, number] }>
): KernelType {
  // brepkit doesn't have XCAF -- store as plain object for writeXCAFToSTEP
  return { __brepkit_xcaf: true, shapes, delete: noop };
}

export function writeXCAFToSTEP(
  bk: BrepkitKernel,
  doc: KernelType,
  _options?: { unit?: string; modelUnit?: string }
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
  shapes: Array<{ shape: KernelShape; name?: string; color?: [number, number, number, number] }>,
  _options?: { unit?: string; modelUnit?: string; schema?: number }
): string {
  // Fall back to basic STEP export (no names/colors)
  return exportSTEP(
    bk,
    shapes.map((s) => s.shape)
  );
}
