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

/** What a caller (JSX or direct) may pass as children: single, nested arrays,
 *  and conditional results. Normalized to a flat Element[] before render. */
type FamilyChildren = Element | boolean | null | undefined | readonly FamilyChildren[];

/**
 * Identity-side props accepted by every family invocation, beside the
 * family's own schema. Zod object schemas strip undeclared keys, so these are
 * re-attached after validation — a semantic component carries IFC-facing data
 * without every schema declaring it. `resolve()` captures them into
 * `ResolvedElement.attributes`.
 */
declare const IDENTITY_PROPS: readonly ["name", "psets", "material", "classification"];

interface IdentityProps {
    /** Display name an exporter may adopt (e.g. IfcBuildingStorey.Name). */
    readonly name?: string | undefined;
    /** Property sets keyed by pset name (e.g. `Pset_WallCommon`). */
    readonly psets?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
    /** Material name an exporter may adopt when the family declares none. */
    readonly material?: string | undefined;
    /** Classification reference (system/code/...); the exporter defines the shape. */
    readonly classification?: Readonly<Record<string, unknown>> | undefined;
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
    (props: I & WithKey & IdentityProps & WithChildren): Element;
    readonly familyName: string;
    /** `'fill'` marks a family whose instances fill an opening when placed in a
     *  host's `voids` (doors, windows): resolution synthesizes the Opening. */
    readonly role: 'fill' | undefined;
    /** Domain-neutral kind an adapter dispatches on, decoupled from the display
     *  name so a renamed copy of a registry family keeps its mapping. */
    readonly archetype: string | undefined;
    readonly renderErased: (props: object) => Element;
}

interface FamilyOptions<P = unknown, I = P> {
    readonly role?: 'fill' | undefined;
    /**
     * What kind of thing this family is, independent of what it is called.
     * Adapters route on this instead of `familyName`, so copy-in families
     * survive being renamed (`Storey` -> `Level` -> `Etage`). Values are the
     * adapter's vocabulary, not this layer's: brepjs-families never interprets
     * one, which is what keeps it domain-neutral. The starter registry uses its
     * own manifest names (`'wall'`, `'storey'`, ...).
     */
    readonly archetype?: string | undefined;
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

/** Development-runtime entry (`jsx: "react-jsxdev"`): same construction, the
 *  extra dev metadata (source/self) is not used. */
declare function jsxDEV(type: string | FamilyComponent<never>, props: Readonly<Record<string, unknown>>, key?: string): Element;

/** Fragment renders nothing itself; resolution inlines its children into the
 *  parent, so it never contributes a key-path segment. */
declare const Fragment = "Fragment";

interface IntrinsicProps {
    readonly key?: string | undefined;
    readonly voids?: readonly Element[] | undefined;
    readonly fuse?: readonly Element[] | undefined;
    readonly transform?: readonly TransformOp[] | undefined;
    readonly children?: FamilyChildren;
}

declare function Box(props: IntrinsicProps & {
    readonly size: readonly [number, number, number];
}): Element;

declare function Cylinder(props: IntrinsicProps & {
    readonly radius: number;
    readonly height: number;
}): Element;

declare function Geometry(props: IntrinsicProps & {
    readonly node: csg.IRNode;
}): Element;

declare function Group(props?: IntrinsicProps): Element;

type TransformOp = {
    readonly op: 'translate';
    readonly v: readonly [number, number, number];
} | {
    readonly op: 'rotate';
    readonly angleDeg: number;
    readonly axis?: readonly [number, number, number] | undefined;
    readonly at?: readonly [number, number, number] | undefined;
};

declare function tTranslate(v: readonly [number, number, number]): TransformOp;

/** Rotation in degrees about `axis` (default Z) through `at` (default origin).
 *  Viewport-first: a parametric BIM projection folds only translations into
 *  IfcLocalPlacement and rejects rotated routed elements (walls orient via
 *  `axisX` instead). */
declare function tRotate(angleDeg: number, options?: {
    readonly axis?: readonly [number, number, number] | undefined;
    readonly at?: readonly [number, number, number] | undefined;
}): TransformOp;

interface Relationship {
    readonly kind: 'Voids' | 'Fills' | 'Contains';
    readonly target: string;
}

interface ResolvedElement {
    readonly type: string;
    /** The family's declared `archetype`, or undefined for intrinsics. Adapters
     *  route on this so a renamed family keeps its mapping. */
    readonly archetype: string | undefined;
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
