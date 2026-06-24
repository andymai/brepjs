// Each node carries `structuralHash` (Merkle hash) and `freeParams`
// pre-computed by builders, so cache keying is O(1) per node and
// invalidation is scoped to subtrees that actually depend on a changed param.

import type { Expr } from './expressions.js';
import type { Matrix4x4 } from '@/core/types.js';

// ---------------------------------------------------------------------------
// Output kinds
// ---------------------------------------------------------------------------

export type OutputKind = 'Solid' | 'Face' | 'Wire' | 'Edge' | 'Vertex' | 'Compound';

/** Output kinds that have a corresponding empty-shape builder + serializer. */
export type EmptyOutputKind = 'Solid' | 'Face' | 'Wire';

// ---------------------------------------------------------------------------
// Node base
// ---------------------------------------------------------------------------

export interface IRNodeBase {
  readonly structuralHash: bigint;
  readonly freeParams: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Primitives (output kind known from constructor)
// ---------------------------------------------------------------------------

export interface BoxNode extends IRNodeBase {
  readonly kind: 'Box';
  readonly x: Expr;
  readonly y: Expr;
  readonly z: Expr;
}

export interface SphereNode extends IRNodeBase {
  readonly kind: 'Sphere';
  readonly radius: Expr;
}

export interface CylinderNode extends IRNodeBase {
  readonly kind: 'Cylinder';
  readonly radius: Expr;
  readonly height: Expr;
}

export interface ConeNode extends IRNodeBase {
  readonly kind: 'Cone';
  readonly radius1: Expr;
  readonly radius2: Expr;
  readonly height: Expr;
}

export interface TorusNode extends IRNodeBase {
  readonly kind: 'Torus';
  readonly majorRadius: Expr;
  readonly minorRadius: Expr;
}

export interface PolygonNode extends IRNodeBase {
  readonly kind: 'Polygon';
  readonly points: readonly Expr[];
}

export interface CircleNode extends IRNodeBase {
  readonly kind: 'Circle';
  readonly radius: Expr;
}

export interface LineNode extends IRNodeBase {
  readonly kind: 'Line';
  readonly from: Expr;
  readonly to: Expr;
}

export interface VertexLitNode extends IRNodeBase {
  readonly kind: 'Vertex';
  readonly point: Expr;
}

/** A typed empty shape — the identity element for booleans of its output kind. */
export interface EmptyNode extends IRNodeBase {
  readonly kind: 'Empty';
  readonly output: EmptyOutputKind;
}

// ---------------------------------------------------------------------------
// Booleans (output kind = output kind of `a`)
// ---------------------------------------------------------------------------

export interface FuseNode extends IRNodeBase {
  readonly kind: 'Fuse';
  readonly a: IRNode;
  readonly b: IRNode;
  readonly tolerance?: number | undefined;
}

export interface CutNode extends IRNodeBase {
  readonly kind: 'Cut';
  readonly a: IRNode;
  readonly b: IRNode;
  readonly tolerance?: number | undefined;
}

export interface IntersectNode extends IRNodeBase {
  readonly kind: 'Intersect';
  readonly a: IRNode;
  readonly b: IRNode;
  readonly tolerance?: number | undefined;
}

export interface FuseAllNode extends IRNodeBase {
  readonly kind: 'FuseAll';
  readonly shapes: readonly IRNode[];
  readonly tolerance?: number | undefined;
}

export interface CutAllNode extends IRNodeBase {
  readonly kind: 'CutAll';
  readonly base: IRNode;
  readonly tools: readonly IRNode[];
  readonly tolerance?: number | undefined;
}

// ---------------------------------------------------------------------------
// Transforms (output kind = output kind of `target`)
// ---------------------------------------------------------------------------

export interface TranslateNode extends IRNodeBase {
  readonly kind: 'Translate';
  readonly target: IRNode;
  readonly vector: Expr;
}

export interface RotateNode extends IRNodeBase {
  readonly kind: 'Rotate';
  readonly target: IRNode;
  readonly angle: Expr;
  readonly axis?: Expr | undefined;
  readonly at?: Expr | undefined;
}

export interface ScaleNode extends IRNodeBase {
  readonly kind: 'Scale';
  readonly target: IRNode;
  readonly factor: Expr;
  readonly center?: Expr | undefined;
}

export interface MirrorNode extends IRNodeBase {
  readonly kind: 'Mirror';
  readonly target: IRNode;
  readonly normal?: Expr | undefined;
  readonly at?: Expr | undefined;
}

// ---------------------------------------------------------------------------
// Compound
// ---------------------------------------------------------------------------

export interface CompoundNode extends IRNodeBase {
  readonly kind: 'Compound';
  readonly children: readonly IRNode[];
}

export interface InstanceNode extends IRNodeBase {
  readonly kind: 'Instance';
  readonly source: IRNode;
  /** Per-instance world transforms (row-major 4x4 literals). */
  readonly placements: readonly Matrix4x4[];
  /** Fuse the placed copies into one solid; otherwise a Compound. */
  readonly fuse: boolean;
}

// ---------------------------------------------------------------------------
// Unions
// ---------------------------------------------------------------------------

export type PrimitiveNode =
  | BoxNode
  | SphereNode
  | CylinderNode
  | ConeNode
  | TorusNode
  | PolygonNode
  | CircleNode
  | LineNode
  | VertexLitNode
  | EmptyNode;

export type BooleanNode = FuseNode | CutNode | IntersectNode | FuseAllNode | CutAllNode;

export type TransformIRNode = TranslateNode | RotateNode | ScaleNode | MirrorNode;

export type IRNode = PrimitiveNode | BooleanNode | TransformIRNode | CompoundNode | InstanceNode;

export type NodeKind = IRNode['kind'];

// ---------------------------------------------------------------------------
// Output-kind branded aliases.
//
// These are *runtime* discriminations enforced by the builders. The TS-level
// union members listed here are "nodes that *can* produce X". Mixed-kind
// usage is rejected by the builders, not the type system at v1.
// ---------------------------------------------------------------------------

export type AnyNode = IRNode;

/** Nodes that produce a 3D solid. */
export type SolidNode = AnyNode;
/** Nodes that produce a 2D or 3D face. */
export type FaceNode = AnyNode;
/** Nodes that produce an edge. */
export type EdgeNode = AnyNode;
/** Nodes that produce a vertex. */
export type VertexNode = AnyNode;

// ---------------------------------------------------------------------------
// Output-kind dispatch — used by builders to validate boolean/transform
// argument kinds, and by the evaluator to dispatch to the correct kernel
// function.
// ---------------------------------------------------------------------------

export function outputKindOf(node: IRNode): OutputKind {
  switch (node.kind) {
    case 'Box':
    case 'Sphere':
    case 'Cylinder':
    case 'Cone':
    case 'Torus':
      return 'Solid';
    case 'Polygon':
      return 'Face';
    case 'Circle':
    case 'Line':
      return 'Edge';
    case 'Vertex':
      return 'Vertex';
    case 'Empty':
      return node.output;
    case 'Fuse':
    case 'Cut':
    case 'Intersect':
      return outputKindOf(node.a);
    case 'FuseAll':
      return node.shapes[0] ? outputKindOf(node.shapes[0]) : 'Solid';
    case 'CutAll':
      return outputKindOf(node.base);
    case 'Translate':
    case 'Rotate':
    case 'Scale':
    case 'Mirror':
      return outputKindOf(node.target);
    case 'Compound':
      return 'Compound';
    case 'Instance':
      // fuse produces one fused solid; otherwise a Compound of placed copies.
      return node.fuse ? 'Solid' : 'Compound';
  }
}
