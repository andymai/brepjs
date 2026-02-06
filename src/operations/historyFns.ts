/**
 * Parametric history — immutable operation log for shape construction.
 *
 * Records a sequence of operation steps. Each step captures the operation
 * type, parameters, and references to input/output shapes by ID. The
 * history is a pure data structure with no OCCT dependency.
 *
 * Also provides an operation registry and replay mechanism for parametric CAD.
 */

import type { AnyShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { computationError } from '../core/errors.js';

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

// ---------------------------------------------------------------------------
// Operation Registry
// ---------------------------------------------------------------------------

/** A function that executes a modelling operation. */
export type OperationFn = (inputs: AnyShape[], params: Record<string, unknown>) => AnyShape;

/** An immutable registry of named operations. */
export interface OperationRegistry {
  readonly operations: ReadonlyMap<string, OperationFn>;
}

/** Create an empty operation registry. */
export function createRegistry(): OperationRegistry {
  return { operations: new Map() };
}

/** Register an operation. Returns a new registry (immutable). */
export function registerOperation(
  registry: OperationRegistry,
  type: string,
  fn: OperationFn
): OperationRegistry {
  const ops = new Map(registry.operations);
  ops.set(type, fn);
  return { operations: ops };
}

// ---------------------------------------------------------------------------
// History Replay
// ---------------------------------------------------------------------------

/**
 * Replay an entire history from scratch using the given registry.
 *
 * All initial shapes (those not produced by any step) must already be in the
 * history's shapes map. Steps are replayed in order. Returns a new history
 * with fresh output shapes.
 */
export function replayHistory(
  history: ModelHistory,
  registry: OperationRegistry
): Result<ModelHistory> {
  // Collect shape IDs that are outputs of steps — anything else is "initial"
  const outputIds = new Set(history.steps.map((s) => s.outputId));
  let current: ModelHistory = { steps: [], shapes: new Map() };

  // Copy initial shapes
  for (const [id, shape] of history.shapes) {
    if (!outputIds.has(id)) {
      current = registerShape(current, id, shape);
    }
  }

  // Replay each step
  for (const step of history.steps) {
    const fn = registry.operations.get(step.type);
    if (!fn) {
      return err(computationError('REPLAY_UNKNOWN_OP', `Unknown operation type: ${step.type}`));
    }

    const inputs: AnyShape[] = [];
    for (const inputId of step.inputIds) {
      const shape = current.shapes.get(inputId);
      if (!shape) {
        return err(
          computationError(
            'REPLAY_MISSING_INPUT',
            `Missing input shape: ${inputId} for step ${step.id}`
          )
        );
      }
      inputs.push(shape);
    }

    try {
      const output = fn(inputs, step.parameters as Record<string, unknown>);
      current = addStep(
        current,
        {
          id: step.id,
          type: step.type,
          parameters: step.parameters,
          inputIds: step.inputIds,
          outputId: step.outputId,
        },
        output
      );
    } catch (e) {
      return err(
        computationError(
          'REPLAY_STEP_FAILED',
          `Step ${step.id} (${step.type}) failed: ${e instanceof Error ? e.message : String(e)}`
        )
      );
    }
  }

  return ok(current);
}

/**
 * Replay history from a specific step onwards.
 *
 * Steps before `stepId` are kept as-is. Steps from `stepId` onwards are
 * re-executed using the registry.
 */
export function replayFrom(
  history: ModelHistory,
  stepId: string,
  registry: OperationRegistry
): Result<ModelHistory> {
  const idx = history.steps.findIndex((s) => s.id === stepId);
  if (idx === -1) {
    return err(computationError('REPLAY_STEP_NOT_FOUND', `Step not found: ${stepId}`));
  }

  // Build a mutable shapes map, removing outputs from steps being replayed
  const shapesMap = new Map(history.shapes);
  for (let i = idx; i < history.steps.length; i++) {
    const step = history.steps[i];
    if (step) {
      shapesMap.delete(step.outputId);
    }
  }

  let current: ModelHistory = {
    steps: history.steps.slice(0, idx),
    shapes: shapesMap,
  };

  // Replay from the target step onwards
  for (let i = idx; i < history.steps.length; i++) {
    const step = history.steps[i];
    if (!step) continue;

    const fn = registry.operations.get(step.type);
    if (!fn) {
      return err(computationError('REPLAY_UNKNOWN_OP', `Unknown operation type: ${step.type}`));
    }

    const inputs: AnyShape[] = [];
    for (const inputId of step.inputIds) {
      const shape = current.shapes.get(inputId);
      if (!shape) {
        return err(
          computationError(
            'REPLAY_MISSING_INPUT',
            `Missing input shape: ${inputId} for step ${step.id}`
          )
        );
      }
      inputs.push(shape);
    }

    try {
      const output = fn(inputs, step.parameters as Record<string, unknown>);
      current = addStep(
        current,
        {
          id: step.id,
          type: step.type,
          parameters: step.parameters,
          inputIds: step.inputIds,
          outputId: step.outputId,
        },
        output
      );
    } catch (e) {
      return err(
        computationError(
          'REPLAY_STEP_FAILED',
          `Step ${step.id} (${step.type}) failed: ${e instanceof Error ? e.message : String(e)}`
        )
      );
    }
  }

  return ok(current);
}

/**
 * Modify a step's parameters and replay from that point.
 *
 * Creates a new history with the updated parameters for the specified step,
 * then replays from that step onwards.
 */
export function modifyStep(
  history: ModelHistory,
  stepId: string,
  newParams: Readonly<Record<string, unknown>>,
  registry: OperationRegistry
): Result<ModelHistory> {
  const idx = history.steps.findIndex((s) => s.id === stepId);
  if (idx === -1) {
    return err(computationError('MODIFY_STEP_NOT_FOUND', `Step not found: ${stepId}`));
  }

  // Create a modified history with updated parameters
  const modifiedSteps = history.steps.map((s) =>
    s.id === stepId ? { ...s, parameters: newParams } : s
  );
  const modifiedHistory: ModelHistory = { steps: modifiedSteps, shapes: history.shapes };

  return replayFrom(modifiedHistory, stepId, registry);
}
