/**
 * Typed intrinsic components. JSX resolves capitalized tags to in-scope
 * identifiers, so `<Box size={...}/>` needs a real export — these wrap `el()`
 * with the intrinsic vocabulary's prop types, and work identically as plain
 * function calls. `el(type, props)` stays the untyped low-level form.
 */

import type { csg } from 'brepjs';
import { el, normalizeChildren, type Element, type FamilyChildren } from './element.js';
import type { TransformOp } from './resolve.js';

export interface IntrinsicProps {
  readonly key?: string | undefined;
  readonly voids?: readonly Element[] | undefined;
  readonly fuse?: readonly Element[] | undefined;
  readonly transform?: readonly TransformOp[] | undefined;
  readonly children?: FamilyChildren;
}

function intrinsic(type: string, props: IntrinsicProps): Element {
  const { children, ...rest } = props;
  return el(type, rest, normalizeChildren(children));
}

export function Box(
  props: IntrinsicProps & { readonly size: readonly [number, number, number] }
): Element {
  return intrinsic('Box', props);
}

export function Cylinder(
  props: IntrinsicProps & { readonly radius: number; readonly height: number }
): Element {
  return intrinsic('Cylinder', props);
}

export function Geometry(props: IntrinsicProps & { readonly node: csg.IRNode }): Element {
  return intrinsic('Geometry', props);
}

export function Group(props: IntrinsicProps = {}): Element {
  return intrinsic('Group', props);
}
