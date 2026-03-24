/**
 * Sweep operations for OCCT shapes.
 *
 * Provides extrusion, revolution, loft, and pipe sweep operations
 * for creating 3D solids from 2D profiles.
 *
 * Used by DefaultAdapter.
 */

import type { KernelInstance, KernelShape, KernelType } from '@/kernel/types.js';
import { perfTimer } from '../perfStats.js';

/**
 * Extrudes a face along a direction.
 */
export function extrude(
  oc: KernelInstance,
  face: KernelShape,
  direction: [number, number, number],
  length: number
): KernelShape {
  const end = perfTimer('extrude');
  try {
    const vec = new oc.gp_Vec_4(
      direction[0] * length,
      direction[1] * length,
      direction[2] * length
    );
    const maker = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true);
    const result = maker.Shape();
    maker.delete();
    vec.delete();
    return result;
  } finally {
    end();
  }
}

/**
 * Revolves a shape around an axis.
 */
export function revolve(
  oc: KernelInstance,
  shape: KernelShape,
  axis: KernelType,
  angle: number
): KernelShape {
  const maker = new oc.BRepPrimAPI_MakeRevol_1(shape, axis, angle, false);
  const result = maker.Shape();
  maker.delete();
  return result;
}

/**
 * Creates a loft through multiple wires.
 */
export function loft(
  oc: KernelInstance,
  wires: KernelShape[],
  ruled = false,
  startShape?: KernelShape,
  endShape?: KernelShape
): KernelShape {
  const end = perfTimer('loft');
  try {
    const loftBuilder = new oc.BRepOffsetAPI_ThruSections(true, ruled, 1e-6);
    if (startShape) loftBuilder.AddVertex(startShape);
    for (const wire of wires) {
      loftBuilder.AddWire(wire);
    }
    if (endShape) loftBuilder.AddVertex(endShape);
    const progress = new oc.Message_ProgressRange_1();
    loftBuilder.Build(progress);
    const result = loftBuilder.Shape();
    loftBuilder.delete();
    progress.delete();
    return result;
  } finally {
    end();
  }
}

/**
 * Sweeps a wire along a spine.
 */
export function sweep(
  oc: KernelInstance,
  wire: KernelShape,
  spine: KernelShape,
  options: { transitionMode?: number } = {}
): KernelShape {
  const { transitionMode } = options;
  const sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spine);
  if (transitionMode !== undefined) {
    sweepBuilder.SetTransitionMode(transitionMode);
  }
  sweepBuilder.Add_1(wire, false, false);
  const progress = new oc.Message_ProgressRange_1();
  sweepBuilder.Build(progress);
  progress.delete();
  sweepBuilder.MakeSolid();
  const result = sweepBuilder.Shape();
  sweepBuilder.delete();
  return result;
}

/**
 * Simple pipe sweep using BRepOffsetAPI_MakePipe.
 *
 * Faster than MakePipeShell for constant cross-section profiles (especially
 * rotationally symmetric ones like circles) because it skips Frenet frame
 * computation and profile orientation interpolation.
 */
export function simplePipe(
  oc: KernelInstance,
  profile: KernelShape,
  spine: KernelShape
): KernelShape {
  const maker = new oc.BRepOffsetAPI_MakePipe_1(spine, profile);
  const progress = new oc.Message_ProgressRange_1();
  maker.Build(progress);
  progress.delete();

  // MakePipe produces a shell by default — solidify it
  const shellShape = maker.Shape();
  const solidMaker = new oc.BRepBuilderAPI_MakeSolid_1();
  const shellDowncast = oc.TopoDS_Cast.Shell(shellShape);
  solidMaker.Add(shellDowncast);
  const solidProgress = new oc.Message_ProgressRange_1();
  solidMaker.Build(solidProgress);
  solidProgress.delete();

  const result = solidMaker.IsDone() ? solidMaker.Solid() : shellShape;

  shellDowncast.delete();
  solidMaker.delete();
  maker.delete();
  return result;
}

// ---------------------------------------------------------------------------
// Batch operations — C++ detection + JS fallback
// ---------------------------------------------------------------------------

let hasCppLoftBatch: boolean | undefined;
let hasCppExtrudeBatch: boolean | undefined;

export function resetLoftBatchDetectionCache(): void {
  hasCppLoftBatch = undefined;
}

export function resetExtrudeBatchDetectionCache(): void {
  hasCppExtrudeBatch = undefined;
}

function detectCppLoftBatch(oc: KernelInstance): boolean {
  hasCppLoftBatch ??= typeof oc.LoftBatch === 'function';
  return hasCppLoftBatch;
}

function detectCppExtrudeBatch(oc: KernelInstance): boolean {
  hasCppExtrudeBatch ??= typeof oc.ExtrudeBatch === 'function';
  return hasCppExtrudeBatch;
}

export interface LoftBatchEntry {
  wires: KernelShape[];
  solid?: boolean | undefined;
  ruled?: boolean | undefined;
  tolerance?: number | undefined;
  startVertex?: KernelShape | undefined;
  endVertex?: KernelShape | undefined;
}

export function loftBatch(oc: KernelInstance, entries: readonly LoftBatchEntry[]): KernelShape[] {
  if (entries.length === 0) return [];

  /* v8 ignore start -- C++ extractor not available in test WASM build */
  if (detectCppLoftBatch(oc)) {
    const end = perfTimer('loft');
    const batch = new oc.LoftBatch();
    try {
      for (const e of entries) {
        const idx = batch.beginLoft(
          e.solid ?? true,
          e.ruled ?? false,
          e.tolerance ?? 1e-6
        ) as number;
        // brepjs-patterns-disable: max-nesting-depth
        if (e.startVertex) batch.setStartVertex(idx, e.startVertex);
        // brepjs-patterns-disable: max-nesting-depth
        for (const wire of e.wires) {
          batch.addWire(idx, wire);
        }
        // brepjs-patterns-disable: max-nesting-depth
        if (e.endVertex) batch.setEndVertex(idx, e.endVertex);
      }

      const result = batch.execute();
      try {
        const count = result.getShapesCount() as number;
        return Array.from({ length: count }, (_, i) => result.getShape(i));
      } finally {
        result.delete();
      }
    } finally {
      batch.delete();
      end();
    }
  }
  /* v8 ignore stop */

  // JS fallback — individual lofts (loft() has its own perfTimer)
  return entries.map((e) => loft(oc, e.wires, e.ruled ?? false, e.startVertex, e.endVertex));
}

export interface ExtrudeBatchEntry {
  face: KernelShape;
  direction: [number, number, number];
  length: number;
}

export function extrudeBatch(
  oc: KernelInstance,
  entries: readonly ExtrudeBatchEntry[]
): KernelShape[] {
  if (entries.length === 0) return [];

  /* v8 ignore start -- C++ extractor not available in test WASM build */
  if (detectCppExtrudeBatch(oc)) {
    const end = perfTimer('extrude');
    const batch = new oc.ExtrudeBatch();
    try {
      for (const e of entries) {
        batch.addExtrude(
          e.face,
          e.direction[0] * e.length,
          e.direction[1] * e.length,
          e.direction[2] * e.length
        );
      }

      const result = batch.execute();
      try {
        const count = result.getShapesCount() as number;
        return Array.from({ length: count }, (_, i) => result.getShape(i));
      } finally {
        result.delete();
      }
    } finally {
      batch.delete();
      end();
    }
  }
  /* v8 ignore stop */

  // JS fallback — extrude() has its own perfTimer
  return entries.map((e) => extrude(oc, e.face, e.direction, e.length));
}
