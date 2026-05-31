import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { KernelCore } from '@/kernel/interfaces/core.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import { makePrimitiveOps } from './primitiveOps.js';
import { makeBooleanOps } from './booleanOps.js';
import { makeTransformOps } from './transformOps.js';
import { makeBuilderOps } from './builderOps.js';
import { makeSweepOps } from './sweepOps.js';
import { makeModifierOps } from './modifierOps.js';
import { makeMeshOps } from './meshOps.js';
import { makeMeasureOps } from './measureOps.js';
import { makeTopologyOps } from './topologyOps.js';
import { makeIoOps } from './ioOps.js';
import { makeGeometryOps } from './geometryOps.js';
import { makeEvolutionOps } from './evolutionOps.js';
import { makeRepairOps } from './repairOps.js';
import { makeKernel2DOps } from './kernel2dOps.js';
import { makeConstraintSketchOps } from './constraintSketchOps.js';
import { makeProjectionOps } from './projectionOps.js';
import { asManifoldShape, brepCache, resolveOcct } from './meshHandle.js';

function makeCoreOps(
  _module: ManifoldModule
): Pick<
  KernelCore,
  | 'dispose'
  | 'executeBatch'
  | 'checkpoint'
  | 'checkpointCount'
  | 'restoreCheckpoint'
  | 'discardCheckpoint'
> {
  return {
    dispose(handle: unknown): void {
      const ms = asManifoldShape(handle);
      if (ms) {
        // A replayed OCCT B-rep is a WASM-heap object whose lifetime follows the
        // manifold handle that triggered the replay; free it here so brepCache (a
        // WeakMap that never disposes evicted values) can't strand it until GC.
        const replayed = brepCache.get(ms.node);
        if (replayed !== undefined) {
          resolveOcct()?.dispose(replayed);
          brepCache.delete(ms.node);
        }
      }
      const solid = (handle as { manifold?: { delete?: () => void } } | null)?.manifold;
      solid?.delete?.();
    },
    executeBatch: () => notImplemented('executeBatch'),
    checkpoint: () => notImplemented('checkpoint'),
    checkpointCount: () => 0,
    restoreCheckpoint: () => notImplemented('restoreCheckpoint'),
    discardCheckpoint: () => notImplemented('discardCheckpoint'),
  };
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- declaration-merge target: the class gains all KernelAdapter members via Object.assign */
export interface ManifoldAdapter extends KernelAdapter {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional mixin composition
export class ManifoldAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- manifold module type gap
  readonly oc: any;
  readonly kernelId = 'manifold';

  constructor(module: ManifoldModule) {
    this.oc = module;
    Object.assign(
      this,
      makePrimitiveOps(module),
      makeBooleanOps(module),
      makeTransformOps(module),
      makeBuilderOps(module),
      makeSweepOps(module),
      makeModifierOps(module),
      makeMeshOps(module),
      makeMeasureOps(module),
      makeTopologyOps(module),
      makeIoOps(module),
      makeGeometryOps(module),
      makeEvolutionOps(module),
      makeRepairOps(module),
      makeKernel2DOps(module),
      makeConstraintSketchOps(module),
      makeProjectionOps(module),
      makeCoreOps(module)
    );
  }
}

type _AssertSatisfiesKernelAdapter = (
  ...args: ConstructorParameters<typeof ManifoldAdapter>
) => KernelAdapter;
const _check: _AssertSatisfiesKernelAdapter = (m) => new ManifoldAdapter(m);
void _check;
