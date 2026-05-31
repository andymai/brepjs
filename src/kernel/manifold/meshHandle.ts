import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { KernelShape } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import type { OpNode } from './opGraph.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- manifold-3d object type gap
export type ManifoldSolid = any;

export interface ManifoldShape {
  readonly manifold: ManifoldSolid;
  readonly node: OpNode;
}

export function wrap(manifold: ManifoldSolid, node: OpNode): ManifoldShape {
  return { manifold, node };
}

export function unwrap(shape: ManifoldShape): ManifoldSolid {
  return shape.manifold;
}

export function nodeOf(shape: ManifoldShape): OpNode {
  return shape.node;
}

export function asManifoldShape(shape: KernelShape): ManifoldShape | undefined {
  if (shape && typeof shape === 'object' && 'manifold' in shape && 'node' in shape) {
    return shape as ManifoldShape;
  }
  return undefined;
}

export function resolveOcct(): KernelAdapter | undefined {
  try {
    return getKernel('occt');
  } catch {
    return undefined;
  }
}

export function occtOrThrow(method: string): KernelAdapter {
  const occt = resolveOcct();
  if (!occt) {
    throw new Error(
      `manifold: ${method} requires a registered occt kernel; none is available`,
    );
  }
  return occt;
}

export const brepCache = new WeakMap<OpNode>();
export const hashCache = new WeakMap<OpNode, number>();
