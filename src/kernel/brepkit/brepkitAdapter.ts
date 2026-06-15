/* v8 ignore file -- brepkit WASM kernel not available in OCCT test suite */
/**
 * BrepkitAdapter — `KernelAdapter` implementation backed by brepkit's WASM `BrepKernel`.
 *
 * brepkit is an arena-based B-Rep kernel compiled to WASM via wasm-bindgen.
 * All geometry is identified by u32 handles into the arena. This adapter wraps
 * those handles in {@link BrepkitHandle} objects so they can flow through
 * brepjs's kernel-agnostic API as opaque `KernelShape` / `KernelType` values.
 *
 * Composed by spreading per-domain factory objects (`make*Ops(bk)`) into the
 * class instance via `Object.assign`, mirroring the {@link DefaultAdapter}
 * shape. Declaration merging tells TypeScript about the runtime-attached
 * methods; a compile-time guard at the bottom of this file asserts the
 * assembled instance satisfies the full `KernelAdapter`.
 *
 * ## Lifecycle
 *
 * ```ts
 * import { BrepKernel } from 'brepkit-wasm';
 * import { BrepkitAdapter } from './brepkitAdapter.js';
 * import { registerKernel } from './index.js';
 *
 * const kernel = new BrepKernel();
 * registerKernel('brepkit', new BrepkitAdapter(kernel));
 * ```
 *
 * ## Memory model
 *
 * brepkit uses arena allocation — entities are never individually freed.
 * `dispose()` is intentionally a no-op on individual handles. Call
 * `BrepKernel.free()` (wasm-bindgen destructor) to release the entire arena.
 *
 * @see docs/decisions/0007-kernel-interface-segregation.md
 * @module
 */

import type { KernelCapabilities } from '@/kernel/capabilities.js';
import { EXACT_BREP_CAPABILITIES } from '@/kernel/capabilities.js';
import type {
  ConstraintSketchCapability,
  KernelAdapter,
  KernelInstance,
  KernelShape,
} from '@/kernel/types.js';
import type { BrepkitKernel } from './brepkitWasmTypes.js';

import { makeBooleanOps } from './booleanOps.js';
import { makeConstructionOps } from './constructionOps.js';
import { makeEvolutionOps } from './evolutionOps.js';
import { makeGeometryOps } from './geometryOps.js';
import { makeIoOps } from './ioOps.js';
import { makeKernel2dOps } from './kernel2dOps.js';
import { makeMeasureOps } from './measureOps.js';
import { makeMeshOps } from './meshOps.js';
import { makeModifierOps } from './modifierOps.js';
import { makeRepairOps } from './repairOps.js';
import { makeSketchOps } from './sketchOps.js';
import { makeSweepOps } from './sweepOps.js';
import { makeTopologyOps } from './topologyOps.js';
import { makeTransformOps } from './transformOps.js';

/**
 * Kernel-lifecycle ops that call directly into the brepkit WASM instance
 * without delegating through a `*Ops.ts` module. These are too thin to
 * justify their own file: arena-based dispose is a no-op, and checkpoint
 * helpers are 1-line trampolines on `bk.*`.
 */
function makeCoreOps(
  bk: BrepkitKernel
): Pick<
  KernelAdapter,
  | 'dispose'
  | 'executeBatch'
  | 'checkpoint'
  | 'checkpointCount'
  | 'restoreCheckpoint'
  | 'discardCheckpoint'
> {
  return {
    // Arena-based: individual handles are not freed.
    // Call brepkitKernel.free() to release the entire arena.
    dispose: () => {},
    executeBatch: (json) => bk.executeBatch(json),
    checkpoint: () => bk.checkpoint(),
    checkpointCount: () => bk.checkpointCount(),
    restoreCheckpoint: (cp) => {
      bk.restore(cp);
    },
    discardCheckpoint: (cp) => {
      bk.discardCheckpoint(cp);
    },
  };
}

/**
 * brepkit-only extensions that live outside `KernelAdapter` and
 * {@link ConstraintSketchCapability}. Currently just `validationDetails`,
 * which surfaces the kernel's diagnostic JSON for callers that need the
 * fine-grained "why is this shape invalid?" trace.
 */
interface BrepkitExtensions {
  validationDetails(shape: KernelShape): string | null;
}

// Declaration merge: tells TS the class instance has every KernelAdapter +
// ConstraintSketchCapability + brepkit-extension method, even though they're
// attached at runtime by Object.assign.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional mixin composition
export interface BrepkitAdapter
  extends KernelAdapter, ConstraintSketchCapability, BrepkitExtensions {}

/**
 * `KernelAdapter` backed by brepkit's WASM kernel.
 *
 * All methods are composed from per-domain factories at construction time.
 * To find a method's implementation, grep for `function <name>` in
 * `src/kernel/brepkit/*Ops.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional mixin composition
export class BrepkitAdapter {
  readonly oc: KernelInstance;
  readonly kernelId = 'brepkit';
  readonly capabilities: KernelCapabilities = EXACT_BREP_CAPABILITIES;

  /** The underlying brepkit WASM kernel instance (typed). */
  private readonly bk: BrepkitKernel;

  constructor(brepkitKernel: KernelInstance) {
    this.bk = brepkitKernel as BrepkitKernel;
    // `oc` is the escape hatch — expose the raw kernel for advanced usage
    this.oc = brepkitKernel;
    const bk = this.bk;
    Object.assign(
      this,
      makeBooleanOps(bk),
      makeConstructionOps(bk),
      makeSweepOps(bk),
      makeModifierOps(bk),
      makeTransformOps(bk),
      makeMeshOps(bk),
      makeIoOps(bk),
      makeMeasureOps(bk),
      makeTopologyOps(bk),
      makeGeometryOps(bk),
      makeRepairOps(bk),
      makeEvolutionOps(bk),
      makeSketchOps(bk),
      makeKernel2dOps(bk),
      makeCoreOps(bk)
    );
  }
}

// --- Compile-time guard --------------------------------------------------
// If any method is missing across every factory, `new BrepkitAdapter(...)`
// won't satisfy `KernelAdapter` and TS errors here with a precise list of
// missing properties. (No runtime cost — strictly compile-time.)
type _AssertSatisfiesKernelAdapter = (
  ...args: ConstructorParameters<typeof BrepkitAdapter>
) => KernelAdapter & ConstraintSketchCapability & BrepkitExtensions;
const _check: _AssertSatisfiesKernelAdapter = (k) => new BrepkitAdapter(k);
void _check;
