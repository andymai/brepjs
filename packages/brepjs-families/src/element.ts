/**
 * Element model — a pure description tree. Calling a family component builds
 * an Element (no render, no kernel); `render` functions run inside `resolve()`
 * and must stay pure: they return Elements, never touch kernel handles.
 */

import type { ZodType } from 'zod';

export interface Element {
  readonly type: string | FamilyComponent<never>;
  readonly key: string | undefined;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly Element[];
}

interface WithKey {
  readonly key?: string | undefined;
}

interface WithChildren {
  readonly children?: Element | readonly Element[] | undefined;
}

/** Flatten nested child arrays and drop null/undefined/boolean, so JSX idioms
 *  like `{cond && <X/>}` and `.map(...)` compose. */
export function normalizeChildren(value: unknown): Element[] {
  const out: Element[] = [];
  const visit = (v: unknown): void => {
    if (v === null || v === undefined || typeof v === 'boolean') return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    out.push(v as Element);
  };
  visit(value);
  return out;
}

/**
 * Identity-side props accepted by every family invocation, beside the
 * family's own schema. Zod object schemas strip undeclared keys, so these are
 * re-attached after validation — a semantic component carries IFC-facing data
 * without every schema declaring it. `resolve()` captures them into
 * `ResolvedElement.attributes`.
 */
export const IDENTITY_PROPS = ['name', 'psets', 'material', 'classification'] as const;

export interface IdentityProps {
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
export interface FamilyComponent<P, I = P> {
  (props: I & WithKey & IdentityProps & WithChildren): Element;
  readonly familyName: string;
  /** `'fill'` marks a family whose instances fill an opening when placed in a
   *  host's `voids` (doors, windows): resolution synthesizes the Opening. */
  readonly role: 'fill' | undefined;
  readonly renderErased: (props: object) => Element;
}

export interface FamilyOptions<P = unknown, I = P> {
  readonly role?: 'fill' | undefined;
  /** Optional Zod schema validated at element construction (the earliest
   *  point with a useful stack). Schema output replaces the props, so
   *  defaults and transforms apply before render — the output type must be
   *  assignable to the render props `P`, enforced by this parameter.
   *  `key` is not validated. */
  readonly props?: ZodType<P, I> | undefined;
}

export function family<P extends object, I extends object = P>(
  name: string,
  render: (props: P) => Element,
  options?: FamilyOptions<P, I>
): FamilyComponent<P, I> {
  const schema = options?.props;
  const make = (props: I & WithKey & IdentityProps & WithChildren): Element => {
    const { key, children, ...rest } = props;
    let validated: Readonly<Record<string, unknown>> = rest;
    if (schema) {
      const parsed = schema.safeParse(rest);
      if (!parsed.success) {
        throw new Error(
          `brepjs-families: invalid props for family '${name}': ${parsed.error.message}`
        );
      }
      const out = { ...(parsed.data as Record<string, unknown>) };
      // Zod strips undeclared keys; identity props are contract, not schema
      // surface, so they ride past validation (a schema that declares one
      // keeps its own validated value).
      const raw = rest as Record<string, unknown>;
      for (const k of IDENTITY_PROPS) {
        if (raw[k] !== undefined && out[k] === undefined) out[k] = raw[k];
      }
      validated = out;
    }
    // Children are structure, not schema surface: they bypass validation and
    // reach the render function as `props.children` during resolution.
    return { type: component, key, props: validated, children: normalizeChildren(children) };
  };
  const component: FamilyComponent<P, I> = Object.assign(make, {
    familyName: name,
    role: options?.role,
    renderErased: (props: object) => render(props as P),
  });
  return component;
}

/** Construct an intrinsic element (`'Box'`, `'Group'`, ...). */
export function el(
  type: string,
  props: Readonly<Record<string, unknown>>,
  children: readonly Element[] = []
): Element {
  const key = props['key'];
  const rest = { ...props };
  delete rest['key'];
  return { type, key: typeof key === 'string' ? key : undefined, props: rest, children };
}

export function isFamily(t: Element['type']): t is FamilyComponent<never> {
  return typeof t === 'function';
}

export function typeNameOf(e: Element): string {
  return isFamily(e.type) ? e.type.familyName : e.type;
}
