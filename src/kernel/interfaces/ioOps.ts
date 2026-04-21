/**
 * KernelIOOps — file import/export and serialization.
 *
 * Covers STEP, STL, IGES, 3MF, GLB, OBJ, PLY import/export, BREP
 * serialization, XCAF document handling, and STEP writer configuration.
 * Analogous to OCCT's STEPControl, IGESControl, and XCAF packages.
 */

import type { KernelShape, KernelType, StepAssemblyPart } from '@/kernel/types.js';

export interface KernelIOOps {
  // --- Standard formats ---
  exportSTEP(shapes: KernelShape[]): string;
  exportSTL(shape: KernelShape, binary?: boolean): string | ArrayBuffer;
  importSTEP(data: string | ArrayBuffer): KernelShape[];
  importSTL(data: string | ArrayBuffer): KernelShape;
  exportIGES(shapes: KernelShape[]): string;
  importIGES(data: string | ArrayBuffer): KernelShape[];
  exportSTEPAssembly(parts: StepAssemblyPart[], options?: { unit?: string }): string;

  // --- Extended formats ---
  /** Export shape to 3MF format. Returns binary data. */
  export3MF(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Export shape to GLB format. Returns binary data. */
  exportGLB(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Export shape to OBJ format. Returns binary data. */
  exportOBJ(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Export shape to PLY format (binary). Returns binary data. */
  exportPLY(shape: KernelShape, tolerance: number): ArrayBuffer;
  /** Import from 3MF format. Returns solid shapes. */
  import3MF(data: ArrayBuffer): KernelShape[];
  /** Import from OBJ format. Returns a solid shape. */
  importOBJ(data: ArrayBuffer): KernelShape;
  /** Import from GLB format. Returns a solid shape. */
  importGLB(data: ArrayBuffer): KernelShape;

  // --- Serialization ---
  /**
   * Serialize a shape to a string format for persistence.
   *
   * **Cross-kernel warning**: The serialization format is kernel-specific.
   * OCCT uses its native BREP text format; brepkit proxies to STEP.
   * Data produced by one kernel cannot be deserialized by the other.
   */
  toBREP(shape: KernelShape): string;
  /** @see {@link toBREP} for cross-kernel compatibility notes. */
  fromBREP(data: string): KernelShape;

  // --- XCAF document handling ---
  /** Create an XCAF document with named, colored shape nodes. Caller must delete the returned handle. */
  createXCAFDocument(
    shapes: Array<{
      shape: KernelShape;
      name: string;
      color?: [number, number, number, number] | undefined;
    }>
  ): KernelType;
  /** Write an XCAF document to STEP format and return the string. */
  writeXCAFToSTEP(
    doc: KernelType,
    options?: { unit?: string | undefined; modelUnit?: string | undefined }
  ): string;
  /** Export shapes to STEP with full configuration (units, assembly mode). */
  exportSTEPConfigured(
    shapes: Array<{
      shape: KernelShape;
      name?: string | undefined;
      color?: [number, number, number, number] | undefined;
    }>,
    options?: {
      unit?: string | undefined;
      modelUnit?: string | undefined;
      schema?: number | undefined;
    }
  ): string;
}
