/**
 * Boolean operations for the manifold adapter.
 *
 * Native CSG runs on manifold-3d (`add`/`subtract`/`intersect`); every result
 * carries an op-node recording exact intent so a B-rep kernel can replay it.
 * Mesh-level booleans and plane operations are marked non-replayable — they
 * consume or produce raw triangle data with no exact B-rep counterpart.
 * @module
 */

import type {
  BooleanIssue,
  BooleanOpType,
  BooleanOptions,
  CheckBooleanResult,
  KernelMeshResult,
  KernelShape,
} from '@/kernel/types.js';
import type { KernelBooleanOps } from '@/kernel/interfaces/booleanOps.js';
import type { ManifoldModule } from './helpers.js';
import { makeNode } from './opGraph.js';
import { type ManifoldShape, type ManifoldSolid, nodeOf, unwrap, wrap } from './meshHandle.js';

function asShape(shape: KernelShape): ManifoldShape {
  return shape as ManifoldShape;
}

function applyMeshOp(a: ManifoldSolid, b: ManifoldSolid, op: string): ManifoldSolid {
  switch (op) {
    case 'cut':
    case 'subtract':
    case 'difference':
      return a.subtract(b);
    case 'intersect':
    case 'common':
    case 'intersection':
      return a.intersect(b);
    default:
      return a.add(b);
  }
}

function planeFromShape(plane: KernelShape): { normal: [number, number, number]; offset: number } {
  const node = nodeOf(asShape(plane));
  const params = node.params;
  const normal = params['normal'] as [number, number, number] | undefined;
  const origin = params['origin'] as [number, number, number] | undefined;
  if (!normal || !origin) {
    throw new Error('manifold: section/split plane must carry normal+origin params');
  }
  const offset = normal[0] * origin[0] + normal[1] * origin[1] + normal[2] * origin[2];
  return { normal, offset };
}

function meshToResult(mesh: {
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}): KernelMeshResult {
  const triangles = new Uint32Array(mesh.triVerts);
  const vertCount = mesh.vertProperties.length / 3;
  const vertices = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    vertices[i * 3] = mesh.vertProperties[i * 3] ?? 0;
    vertices[i * 3 + 1] = mesh.vertProperties[i * 3 + 1] ?? 0;
    vertices[i * 3 + 2] = mesh.vertProperties[i * 3 + 2] ?? 0;
  }
  return {
    vertices,
    normals: new Float32Array(0),
    triangles,
    uvs: new Float32Array(0),
    faceGroups: [{ start: 0, count: triangles.length, faceHash: 0 }],
  };
}

export function makeBooleanOps(module: ManifoldModule): KernelBooleanOps {
  const Manifold = module.Manifold;

  function fuse(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    const a = asShape(shape);
    const b = asShape(tool);
    const result = unwrap(a).add(unwrap(b));
    return wrap(result, makeNode('makeFuse', {}, [nodeOf(a), nodeOf(b)]));
  }

  function cut(shape: KernelShape, tool: KernelShape, _options?: BooleanOptions): KernelShape {
    const a = asShape(shape);
    const b = asShape(tool);
    const result = unwrap(a).subtract(unwrap(b));
    return wrap(result, makeNode('makeCut', {}, [nodeOf(a), nodeOf(b)]));
  }

  function intersect(
    shape: KernelShape,
    tool: KernelShape,
    _options?: BooleanOptions
  ): KernelShape {
    const a = asShape(shape);
    const b = asShape(tool);
    const result = unwrap(a).intersect(unwrap(b));
    return wrap(result, makeNode('makeCommon', {}, [nodeOf(a), nodeOf(b)]));
  }

  function fuseAll(shapes: KernelShape[], _options?: BooleanOptions): KernelShape {
    if (shapes.length === 0) throw new Error('manifold: fuseAll requires at least one shape');
    const handles = shapes.map(asShape);
    const [first] = handles;
    if (first === undefined) throw new Error('manifold: fuseAll requires at least one shape');
    if (handles.length === 1) return first;
    const result = Manifold.union(handles.map(unwrap));
    return wrap(result, makeNode('makeFuse', {}, handles.map(nodeOf)));
  }

  function cutAll(
    shape: KernelShape,
    tools: KernelShape[],
    _options?: BooleanOptions
  ): KernelShape {
    const base = asShape(shape);
    if (tools.length === 0) return base;
    const toolHandles = tools.map(asShape);
    const result = Manifold.difference([unwrap(base), ...toolHandles.map(unwrap)]);
    return wrap(result, makeNode('makeCut', {}, [nodeOf(base), ...toolHandles.map(nodeOf)]));
  }

  function section(shape: KernelShape, plane: KernelShape, _approximation?: boolean): KernelShape {
    const solid = asShape(shape);
    const { normal, offset } = planeFromShape(plane);
    const [below] = unwrap(solid).splitByPlane(normal, offset);
    return wrap(
      below,
      makeNode('section', { normal, offset }, [nodeOf(solid), nodeOf(asShape(plane))])
    );
  }

  function split(shape: KernelShape, tools: KernelShape[]): KernelShape {
    const solid = asShape(shape);
    const [first] = tools;
    if (first === undefined) throw new Error('manifold: split requires at least one tool');
    const planeShape = asShape(first);
    const { normal, offset } = planeFromShape(first);
    const [below, above] = unwrap(solid).splitByPlane(normal, offset);
    const result = Manifold.union([below, above]);
    return wrap(result, makeNode('split', { normal, offset }, [nodeOf(solid), nodeOf(planeShape)]));
  }

  function checkBoolean(
    shape: KernelShape,
    tool: KernelShape,
    _op: BooleanOpType
  ): CheckBooleanResult {
    const issues: BooleanIssue[] = [];
    const base = asShape(shape);
    const toolShape = asShape(tool);
    if (unwrap(base) === undefined || unwrap(base).isEmpty()) {
      issues.push({ operand: 'base', issue: 'null-shape', message: 'Base shape is empty' });
    }
    if (unwrap(toolShape) === undefined || unwrap(toolShape).isEmpty()) {
      issues.push({ operand: 'tool', issue: 'null-shape', message: 'Tool shape is empty' });
    }
    return { valid: issues.length === 0, issues };
  }

  function meshBoolean(
    positionsA: number[],
    indicesA: number[],
    positionsB: number[],
    indicesB: number[],
    op: string,
    _tolerance: number
  ): KernelMeshResult {
    const meshA = new module.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(positionsA),
      triVerts: new Uint32Array(indicesA),
    });
    const meshB = new module.Mesh({
      numProp: 3,
      vertProperties: new Float32Array(positionsB),
      triVerts: new Uint32Array(indicesB),
    });
    const a = Manifold.ofMesh(meshA);
    const b = Manifold.ofMesh(meshB);
    const result = applyMeshOp(a, b, op);
    return meshToResult(result.getMesh());
  }

  return {
    fuse,
    cut,
    intersect,
    section,
    fuseAll,
    cutAll,
    split,
    checkBoolean,
    meshBoolean,
  };
}
