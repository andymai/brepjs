/**
 * brepjs/operations — Extrusion, loft, sweep, patterns, assemblies, and history.
 *
 * @example
 * ```typescript
 * import { sweep, linearPattern } from 'brepjs/operations';
 * ```
 */

// ── Extrude / revolve / sweep ──

export {
  sweep,
  supportExtrude,
  complexExtrude,
  twistExtrude,
  type SweepConfig,
  type ExtrusionProfile,
} from './operations/extrudeFns.js';

// ── Patterns ──

export { linearPattern, circularPattern } from './operations/patternFns.js';

// ── Assembly ──

export {
  createAssemblyNode,
  addChild,
  removeChild,
  updateNode,
  findNode,
  walkAssembly,
  countNodes,
  collectShapes,
  type AssemblyNode,
  type AssemblyNodeOptions,
} from './operations/assemblyFns.js';

export {
  exportAssemblySTEP,
  type ShapeConfig,
  type SupportedUnit,
} from './operations/exporterFns.js';

// ── History ──

export {
  createHistory,
  addStep,
  undoLast,
  findStep,
  getShape as getHistoryShape,
  stepCount,
  stepsFrom,
  registerShape,
  createRegistry,
  registerOperation,
  replayHistory,
  replayFrom,
  modifyStep,
  type OperationStep,
  type ModelHistory,
  type OperationFn,
  type OperationRegistry as HistoryOperationRegistry,
} from './operations/historyFns.js';

// ── Low-level ──

export {
  basicFaceExtrusion,
  revolution,
  genericSweep,
  type GenericSweepConfig,
} from './operations/extrude.js';

export { loft } from './operations/loft.js';

export { type AssemblyExporter, createAssembly } from './operations/exporters.js';
