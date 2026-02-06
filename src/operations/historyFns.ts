/**
 * Parametric history — immutable operation log for shape construction.
 *
 * Records a sequence of operation steps. Each step captures the operation
 * type, parameters, and references to input/output shapes by ID. The
 * history is a pure data structure with no OCCT dependency.
 */

import type { AnyShape } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OperationStep {
  readonly id: string;
  readonly type: string; // e.g. 'extrude', 'fuse', 'fillet', etc.
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly inputIds: ReadonlyArray<string>;
  readonly outputId: string;
  readonly timestamp: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ModelHistory {
  readonly steps: ReadonlyArray<OperationStep>;
  readonly shapes: ReadonlyMap<string, AnyShape>;
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

/** Create a new empty history. */
export function createHistory(): ModelHistory {
  return { steps: [], shapes: new Map() };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/** Add a step and its output shape. Returns a new history. */
export function addStep(
  history: ModelHistory,
  step: Omit<OperationStep, 'timestamp'>,
  outputShape: AnyShape
): ModelHistory {
  const fullStep: OperationStep = { ...step, timestamp: Date.now() };
  const shapes = new Map(history.shapes);
  shapes.set(step.outputId, outputShape);
  return { steps: [...history.steps, fullStep], shapes };
}

/** Remove the last step and clean up orphaned shapes. Returns a new history. */
export function undoLast(history: ModelHistory): ModelHistory {
  if (history.steps.length === 0) return history;
  const steps = history.steps.slice(0, -1);
  // Rebuild shapes map from remaining steps
  const usedIds = new Set<string>();
  for (const s of steps) {
    usedIds.add(s.outputId);
    for (const id of s.inputIds) usedIds.add(id);
  }
  const shapes = new Map<string, AnyShape>();
  for (const [id, shape] of history.shapes) {
    if (usedIds.has(id)) shapes.set(id, shape);
  }
  return { steps, shapes };
}

/** Find a step by its ID. */
export function findStep(history: ModelHistory, stepId: string): OperationStep | undefined {
  return history.steps.find((s) => s.id === stepId);
}

/** Retrieve a shape by its ID. */
export function getShape(history: ModelHistory, shapeId: string): AnyShape | undefined {
  return history.shapes.get(shapeId);
}

/** Return the number of steps in the history. */
export function stepCount(history: ModelHistory): number {
  return history.steps.length;
}

/** Return all steps from a given step ID onwards (inclusive). */
export function stepsFrom(history: ModelHistory, stepId: string): ReadonlyArray<OperationStep> {
  const idx = history.steps.findIndex((s) => s.id === stepId);
  if (idx === -1) return [];
  return history.steps.slice(idx);
}

/** Register an initial shape without an operation step. Returns a new history. */
export function registerShape(history: ModelHistory, id: string, shape: AnyShape): ModelHistory {
  const shapes = new Map(history.shapes);
  shapes.set(id, shape);
  return { ...history, shapes };
}
