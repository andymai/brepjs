/**
 * React-automatic JSX runtime (`jsxImportSource: "brepjs-families"`). No
 * React: `jsx(type, props, key)` constructs a plain Element; children arrive
 * inside props per the automatic-runtime convention. The plain-function API
 * is primary; JSX is sugar over it — a family component is invoked, so schema
 * validation, defaults, and identity-prop capture behave identically on both
 * paths.
 */

import {
  isFamily,
  normalizeChildren,
  type Element as ElementModel,
  type FamilyComponent,
} from './element.js';

type Element = ElementModel;

// The compiler reads this namespace off the module named by `jsxImportSource`;
// it is what makes `.tsx` components, keys, and children type-check. There are
// no lowercase intrinsic tags: Box/Cylinder/Geometry/Group are real exported
// components (see intrinsics.ts), typed by their own signatures.
// eslint-disable-next-line @typescript-eslint/no-namespace -- TS's contract for typed JSX
export namespace JSX {
  export type Element = ElementModel;
  export interface ElementChildrenAttribute {
    children: unknown;
  }
  export interface IntrinsicAttributes {
    readonly key?: string | undefined;
  }
}

export function jsx(
  type: string | FamilyComponent<never>,
  props: Readonly<Record<string, unknown>>,
  key?: string
): Element {
  const rest = { ...props };
  const rawChildren = rest['children'];
  delete rest['children'];
  const children = normalizeChildren(rawChildren);
  if (isFamily(type)) {
    return (type as FamilyComponent<object>)({ ...rest, key, children });
  }
  return { type, key, props: rest, children };
}

export const jsxs = jsx;

/** Development-runtime entry (`jsx: "react-jsxdev"`): same construction, the
 *  extra dev metadata (source/self) is not used. */
export function jsxDEV(
  type: string | FamilyComponent<never>,
  props: Readonly<Record<string, unknown>>,
  key?: string
): Element {
  return jsx(type, props, key);
}

/** Fragment renders nothing itself; resolution inlines its children into the
 *  parent, so it never contributes a key-path segment. */
export const Fragment = 'Fragment';
