/**
 * React-automatic JSX runtime (`jsxImportSource: "brepjs-families"`). No
 * React: `jsx(type, props, key)` constructs a plain Element; children arrive
 * inside props per the automatic-runtime convention. The plain-function API
 * is primary; JSX is sugar over it.
 */

import type { Element, FamilyComponent } from './element.js';

export function jsx(
  type: string | FamilyComponent<never>,
  props: Readonly<Record<string, unknown>>,
  key?: string
): Element {
  const rest = { ...props };
  const rawChildren = rest['children'];
  delete rest['children'];
  const children = Array.isArray(rawChildren)
    ? (rawChildren as Element[])
    : rawChildren !== undefined
      ? [rawChildren as Element]
      : [];
  return { type, key, props: rest, children };
}

export const jsxs = jsx;

/** Fragment renders nothing itself; its children inline into the parent. */
export const Fragment = 'Fragment';
