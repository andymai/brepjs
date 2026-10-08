// Each node carries `structuralHash` (Merkle hash) and `freeParams`
// pre-computed by builders, so cache keying is O(1) per node and
// invalidation is scoped to subtrees that actually depend on a changed param.

import type { Expr } from './expressions.js';
import type { Contour, Segment2D } from './segments.js';
import type { EdgeRef, ShapeRef } from '@/topology/shapeRef/shapeRefTypes.js';
import type { Matrix4x4 } from '@/core/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import type { Result } from '@/core/result.js';

// ---------------------------------------------------------------------------
// Output kinds
// ---------------------------------------------------------------------------

export type OutputKind = 'Solid' | 'Face' | 'Wire' | 'Edge' | 'Vertex' | 'Compound';

const OUTPUT_KINDS: Readonly<Record<OutputKind, true>> = {
  Solid: true,
  Face: true,
  Wire: true,
  Edge: true,
  Vertex: true,
  Compound: true,
};

export function isOutputKind(v: unknown): v is OutputKind {
  return typeof v === 'string' && Object.hasOwn(OUTPUT_KINDS, v);
}

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
// Feature nodes
// ---------------------------------------------------------------------------

export interface ExtrudeNode extends IRNodeBase {
  readonly kind: 'Extrude';
  /** Must produce OutputKind 'Face'. */
  readonly profile: IRNode;
  readonly vector: Expr;
}

export interface RevolveNode extends IRNodeBase {
  readonly kind: 'Revolve';
  /** Must produce OutputKind 'Face'. */
  readonly profile: IRNode;
  /** Degrees, matching Rotate. */
  readonly angle: Expr;
  readonly axis?: Expr | undefined;
  readonly at?: Expr | undefined;
}

export interface FilletNode extends IRNodeBase {
  readonly kind: 'Fillet';
  readonly target: IRNode;
  /** Serializable lineage ref naming the edge by its two adjacent face roles.
   *  Pure data, so it hashes like any other field; resolution against the
   *  materialized target happens inside evaluation. */
  readonly ref: EdgeRef;
  readonly radius: Expr;
}

export interface ChamferNode extends IRNodeBase {
  readonly kind: 'Chamfer';
  readonly target: IRNode;
  /** Serializable lineage ref naming the edge by its two adjacent face roles. */
  readonly ref: EdgeRef;
  readonly distance: Expr;
}

export interface ShellNode extends IRNodeBase {
  readonly kind: 'Shell';
  readonly target: IRNode;
  /** Faces left open, named by serializable role refs. Order is
   *  content-significant (it enters the structural hash). */
  readonly refs: readonly ShapeRef[];
  readonly thickness: Expr;
}

export interface ColorNode extends IRNodeBase {
  readonly kind: 'Color';
  readonly target: IRNode;
  /** Canonical RGBA, each component in [0, 1]. */
  readonly color: readonly [number, number, number, number];
}

export interface ProfileNode extends IRNodeBase {
  readonly kind: 'Profile';
  /** Closed outline in the XY plane (auto-closed at evaluation). */
  readonly outline: Contour;
  /** First-class holes — closed contours inside the outline. */
  readonly holes: readonly Contour[];
}

export interface SweepNode extends IRNodeBase {
  readonly kind: 'Sweep';
  /** Must produce OutputKind 'Face'. */
  readonly profile: IRNode;
  /** Must produce OutputKind 'Wire' or 'Edge' (Line, Circle, Path). */
  readonly spine: IRNode;
  /** Canonicalized by the builder (default false). */
  readonly frenet: boolean;
}

export interface PathNode extends IRNodeBase {
  readonly kind: 'Path';
  /** Vec2 start point; the path lies in the XY plane (z = 0) and is lifted
   *  into 3D by transform nodes. */
  readonly start: Expr;
  readonly segments: readonly Segment2D[];
}

export interface LoftNode extends IRNodeBase {
  readonly kind: 'Loft';
  /** Each section must produce OutputKind 'Face'; at least two required. */
  readonly sections: readonly IRNode[];
  /** Canonicalized by the builder (default true) so the default and the
   *  explicit form share one content address. */
  readonly ruled: boolean;
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
// Extension (caller-defined operation)
// ---------------------------------------------------------------------------

/** A value `JSON.stringify` / `JSON.parse` round-trips exactly. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** An operation the IR has no built-in kind for, materialized by the
 *  {@link ExtensionEvaluator} registered under `name` in
 *  `EvaluatorOptions.extensions`. `optimize` treats it as opaque: its
 *  children and params are optimized, the node itself is never folded. */
export interface ExtensionNode extends IRNodeBase {
  readonly kind: 'Extension';
  readonly name: string;
  /** Declared at build time for `outputKindOf`; evaluation does not check the
   *  materialized shape against it. */
  readonly output: OutputKind;
  readonly children: readonly IRNode[];
  /** Scalar inputs, resolved to numbers against the env before the evaluator
   *  runs, so they take part in param invalidation. */
  readonly params: Readonly<Record<string, Expr>>;
  /** Frozen canonical copy of the builder input; neither key order nor `-0`
   *  changes the hash. */
  readonly data: JsonValue;
}

export interface ExtensionInput {
  readonly params: Readonly<Record<string, number>>;
  readonly data: JsonValue;
  /** The node's children, materialized in order. */
  readonly children: readonly AnyShape<Dimension>[];
}

/**
 * Materializes an {@link ExtensionNode}; registered by name through
 * `EvaluatorOptions.extensions` and called under the Evaluator's kernel.
 *
 * The Evaluator caches the result by the node's content address, so it must
 * depend only on `input`.
 *
 * Ownership: `children` are borrowed from the Evaluator's cache. Do not
 * dispose them or keep them past the call (a bounded cache may evict them).
 * Return either a fresh shape or one of `children` unchanged; the Evaluator
 * owns and disposes the result, and reference-counts handles so a returned
 * child is freed once. Never return a handle owned elsewhere, such as a
 * borrowed sub-shape from `getFaces`.
 *
 * Return an `Err` for expected failures; a throw escapes `evaluate()` like a
 * throw from any built-in evaluator.
 */
export type ExtensionEvaluator = (input: ExtensionInput) => Result<AnyShape<Dimension>>;

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

export type IRNode =
  | PrimitiveNode
  | BooleanNode
  | TransformIRNode
  | ExtrudeNode
  | RevolveNode
  | LoftNode
  | SweepNode
  | ProfileNode
  | PathNode
  | ColorNode
  | FilletNode
  | ChamferNode
  | ShellNode
  | CompoundNode
  | InstanceNode
  | ExtensionNode;

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
    case 'Color':
      return outputKindOf(node.target);
    case 'Extrude':
    case 'Revolve':
    case 'Loft':
    case 'Sweep':
    case 'Fillet':
    case 'Chamfer':
    case 'Shell':
      return 'Solid';
    case 'Profile':
      return 'Face';
    case 'Path':
      return 'Wire';
    case 'Compound':
      return 'Compound';
    case 'Instance':
      // fuse produces one fused solid; otherwise a Compound of placed copies.
      return node.fuse ? 'Solid' : 'Compound';
    case 'Extension':
      return node.output;
  }
}
