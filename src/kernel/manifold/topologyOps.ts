import type { KernelTopologyOps } from '@/kernel/interfaces/topologyOps.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { KernelShape, ShapeOrientation, ShapeType } from '@/kernel/types.js';
import { getKernel } from '@/kernel/index.js';
import type { ManifoldModule } from './helpers.js';
import type { ManifoldShape } from './meshHandle.js';
import { unwrap } from './meshHandle.js';
import type { OpNode } from './opGraph.js';
import { replay } from './replay.js';

function asManifoldShape(shape: KernelShape): ManifoldShape | undefined {
  if (shape && typeof shape === 'object' && 'manifold' in shape && 'node' in shape) {
    return shape as ManifoldShape;
  }
  return undefined;
}

function resolveOcct(): KernelAdapter | undefined {
  try {
    return getKernel('occt');
  } catch {
    return undefined;
  }
}

function occtOrThrow(method: string): KernelAdapter {
  const occt = resolveOcct();
  if (!occt) {
    throw new Error(
      `manifold: ${method} requires a registered occt kernel; none is available`,
    );
  }
  return occt;
}

function brepOf(shape: KernelShape, method: string): { occt: KernelAdapter; brep: KernelShape } {
  const ms = asManifoldShape(shape);
  if (!ms) {
    throw new Error(`manifold: ${method} requires a manifold shape handle`);
  }
  if (!ms.node.replayable) {
    throw new Error(
      `manifold: ${method} unsupported; shape originates from a non-replayable op (raw mesh import or mesh boolean)`,
    );
  }
  const occt = occtOrThrow(method);
  const node = ms.node as OpNode & { _brep?: KernelShape };
  const cached = node._brep;
  if (cached !== undefined) {
    return { occt, brep: cached };
  }
  const brep = replay(node, occt);
  node._brep = brep;
  return { occt, brep };
}

export function makeTopologyOps(_module: ManifoldModule): KernelTopologyOps {
  function shapeType(shape: KernelShape): ShapeType {
    const { occt, brep } = brepOf(shape, 'shapeType');
    return occt.shapeType(brep);
  }

  function isSame(a: KernelShape, b: KernelShape): boolean {
    const sa = asManifoldShape(a);
    const sb = asManifoldShape(b);
    if (!sa || !sb) return false;
    return sa.manifold === sb.manifold;
  }

  function isEqual(a: KernelShape, b: KernelShape): boolean {
    return isSame(a, b);
  }

  function hashCode(shape: KernelShape, upperBound: number): number {
    const ms = asManifoldShape(shape);
    if (!ms) return 0;
    const node = ms.node as OpNode & { _hash?: number };
    if (node._hash === undefined) {
      const { occt, brep } = brepOf(shape, 'hashCode');
      node._hash = occt.hashCode(brep, upperBound);
    }
    return node._hash;
  }

  function isNull(shape: KernelShape): boolean {
    const s = asManifoldShape(shape);
    if (!s) return true;
    const solid = unwrap(s);
    return !solid || (typeof solid.isEmpty === 'function' && solid.isEmpty());
  }

  function shapeOrientation(_shape: KernelShape): ShapeOrientation {
    return 'forward';
  }

  function iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
    const s = asManifoldShape(shape);
    if (!s) return [];
    return type === 'solid' ? [shape] : [];
  }

  function iterShapeList(list: KernelShape, callback: (item: KernelShape) => void): void {
    occtOrThrow('iterShapeList').iterShapeList(list, callback);
  }

  function edgeToFaceMap(shape: KernelShape): string {
    const { occt, brep } = brepOf(shape, 'edgeToFaceMap');
    return occt.edgeToFaceMap(brep);
  }

  function sharedEdges(faceA: KernelShape, faceB: KernelShape): KernelShape[] {
    const occt = occtOrThrow('sharedEdges');
    return occt.sharedEdges(faceA, faceB);
  }

  function adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[] {
    const { occt, brep } = brepOf(shape, 'adjacentFaces');
    return occt.adjacentFaces(brep, face);
  }

  return {
    iterShapes,
    iterShapeList,
    shapeType,
    isSame,
    isEqual,
    downcast: (shape) => shape,
    hashCode,
    isNull,
    shapeOrientation,
    edgeToFaceMap,
    sharedEdges,
    adjacentFaces,
    sew: () => {
      throw new Error('manifold: sew is unsupported on the mesh kernel; use a B-rep kernel');
    },
  };
}
