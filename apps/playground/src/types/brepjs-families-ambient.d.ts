/**
 * AUTO-GENERATED — do not edit manually.
 * Run `npm run generate-types` to regenerate from brepjs-families package types.
 *
 * Ambient type declarations for brepjs-families available in the playground editor.
 */

import type { AnyShape, Dimension, MeshOptions, Result, ShapeMesh, csg } from 'brepjs';

interface Element {
    readonly type: string | FamilyComponent<never>;
    readonly key: string | undefined;
    readonly props: Readonly<Record<string, unknown>>;
    readonly children: readonly Element[];
}

/**
 * A family component: a callable that constructs Elements, carrying its
 * declared name and render function. The component REFERENCE is the identity
 * (copy-in files make name lookup collide); the declared name serves key-path
 * fallbacks and display only.
 *
 * `I` is the INVOCATION props type: with a schema carrying defaults or
 * transforms, callers pass the schema's input while render receives its
 * output `P`. Schema-less families use one type for both.
 */
interface FamilyComponent<P, I = P> {
    (props: I & WithKey): Element;
    readonly familyName: string;
    /** `'fill'` marks a family whose instances fill an opening when placed in a
     *  host's `voids` (doors, windows): resolution synthesizes the Opening. */
    readonly role: 'fill' | undefined;
    readonly renderErased: (props: object) => Element;
}

interface FamilyOptions<P = unknown, I = P> {
    readonly role?: 'fill' | undefined;
    /** Optional Zod schema validated at element construction (the earliest
     *  point with a useful stack). Schema output replaces the props, so
     *  defaults and transforms apply before render — the output type must be
     *  assignable to the render props `P`, enforced by this parameter.
     *  `key` is not validated. */
    readonly props?: ZodType<P, I> | undefined;
}

declare function family<P extends object, I extends object = P>(name: string, render: (props: P) => Element, options?: FamilyOptions<P, I>): FamilyComponent<P, I>;

/** Construct an intrinsic element (`'Box'`, `'Group'`, ...). */
declare function el(type: string, props: Readonly<Record<string, unknown>>, children?: readonly Element[]): Element;

declare function jsx(type: string | FamilyComponent<never>, props: Readonly<Record<string, unknown>>, key?: string): Element;

declare const jsxs: typeof jsx;

/** Fragment renders nothing itself; its children inline into the parent. */
declare const Fragment = "Fragment";

interface TransformOp {
    readonly op: 'translate';
    readonly v: readonly [number, number, number];
}

declare function tTranslate(v: readonly [number, number, number]): TransformOp;

interface Relationship {
    readonly kind: 'Voids' | 'Fills' | 'Contains';
    readonly target: string;
}

interface ResolvedElement {
    readonly type: string;
    /** Ancestor chain joined with '/'; prop-embedded elements use
     *  `${hostPath}/${propName}:${slotKey}`. */
    readonly keyPath: string;
    /** True when the element (or, for synthesized openings/fills, its void
     *  slot) carried an explicit key. Index-fallback paths are order-dependent,
     *  so identity consumers reject unkeyed elements. */
    readonly keyed: boolean;
    readonly geometry: csg.IRNode;
    /** The element's own pre-desugared props (dimensions, placement, ...) — an
     *  adapter feeds these into parametric spec paths (e.g. IFC) that cannot
     *  recover parameters from baked geometry. */
    readonly props: Readonly<Record<string, unknown>>;
    /** Identity-side data (psets, ...) — beside the geometry, never inside it. */
    readonly attributes: Readonly<Record<string, unknown>>;
    readonly relationships: readonly Relationship[];
    readonly children: readonly ResolvedElement[];
}

declare function resolve(root: Element): ResolvedElement;

interface EvaluatedNode {
    readonly keyPath: string;
    readonly type: string;
    readonly attributes: Readonly<Record<string, unknown>>;
    readonly relationships: readonly Relationship[];
    /** Borrowed from the Evaluator's mesh cache — do not mutate. */
    readonly mesh: Result<ShapeMesh>;
    /** Present only with `shapes: true`. Borrowed from the Evaluator — do not
     *  dispose; valid per its cache contract. */
    readonly shape?: Result<AnyShape<Dimension>> | undefined;
}

interface EvaluateModelOptions {
    /** Also materialize a B-rep handle per element (export paths). Off by
     *  default so viewport consumers never pin kernel lifetimes. */
    readonly shapes?: boolean | undefined;
    readonly mesh?: MeshOptions | undefined;
}

interface EvaluatedModel {
    readonly root: ResolvedElement;
    /** Geometry-bearing elements only: pure containers (Empty geometry) exist
     *  for identity/containment and have no entry. */
    readonly byKeyPath: ReadonlyMap<string, EvaluatedNode>;
}

declare function evaluateModel(root: ResolvedElement, evaluator: csg.Evaluator, env?: csg.Env, options?: EvaluateModelOptions): EvaluatedModel;
