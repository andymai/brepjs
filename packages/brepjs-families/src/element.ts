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

/**
 * A family component: a callable that constructs Elements, carrying its
 * declared name and render function. The component REFERENCE is the identity
 * (copy-in files make name lookup collide); the declared name serves key-path
 * fallbacks and display only.
 */
export interface FamilyComponent<P> {
  (props: P & WithKey): Element;
  readonly familyName: string;
  /** `'fill'` marks a family whose instances fill an opening when placed in a
   *  host's `voids` (doors, windows): resolution synthesizes the Opening. */
  readonly role: 'fill' | undefined;
  readonly renderErased: (props: object) => Element;
}

export interface FamilyOptions<P = unknown> {
  readonly role?: 'fill' | undefined;
  /** Optional Zod schema validated at element construction (the earliest
   *  point with a useful stack). Schema output replaces the props, so
   *  defaults and transforms apply before render — the output type must be
   *  assignable to the render props `P`, enforced by this parameter.
   *  `key` is not validated. */
  readonly props?: ZodType<P> | undefined;
}

export function family<P extends object>(
  name: string,
  render: (props: P) => Element,
  options?: FamilyOptions<P>
): FamilyComponent<P> {
  const schema = options?.props;
  const make = (props: P & WithKey): Element => {
    const { key, ...rest } = props;
    let validated: Readonly<Record<string, unknown>> = rest;
    if (schema) {
      const parsed = schema.safeParse(rest);
      if (!parsed.success) {
        throw new Error(
          `brepjs-families: invalid props for family '${name}': ${parsed.error.message}`
        );
      }
      validated = parsed.data as Readonly<Record<string, unknown>>;
    }
    return { type: component, key, props: validated, children: [] };
  };
  const component: FamilyComponent<P> = Object.assign(make, {
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
