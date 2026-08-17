/**
 * Spike E prototype — a minimal family layer projected onto the existing CSG IR.
 * Test-local on purpose: this is evidence for brepjs-families, not shipping code.
 *
 * Decisions demonstrated here (recorded in the vault):
 *  - Prop-embedded key paths: `${hostPath}/voids:${slotKey}` — the void slot owns
 *    the synthesized opening's identity; the fill element is its child at `/fill`.
 *  - Opening synthesis: a fill-role family in `voids` auto-wraps in an Opening
 *    resolved element; plain geometry voids stay anonymous (cut only, no identity).
 *  - Desugaring order (normative): voids -> fuse -> transform (voids stay local).
 */

import {
  box,
  cutAll,
  fuseAll,
  translate,
  emptySolid,
  type IRNode,
  type Env,
  type Evaluator,
} from '@/csg/index.js';
import type { Result } from '@/core/result.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Element model
// ---------------------------------------------------------------------------

export interface Element {
  readonly type: string | FamilyComponent<never>;
  readonly key: string | undefined;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly Element[];
}

interface WithKey {
  readonly key?: string | undefined;
}

export interface FamilyComponent<P> {
  (props: P & WithKey): Element;
  readonly familyName: string;
  readonly role: 'fill' | undefined;
  readonly renderErased: (props: object) => Element;
}

export function family<P extends object>(
  name: string,
  render: (props: P) => Element,
  opts?: { readonly role?: 'fill' | undefined }
): FamilyComponent<P> {
  const make = (props: P & WithKey): Element => {
    const { key, ...rest } = props;
    return { type: component, key, props: rest, children: [] };
  };
  const component: FamilyComponent<P> = Object.assign(make, {
    familyName: name,
    role: opts?.role,
    renderErased: (props: object) => render(props as P),
  });
  return component;
}

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

/** React-automatic-runtime shape: children arrive inside props. */
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

// ---------------------------------------------------------------------------
// Transform ops (prop-level vocabulary; spike scope: translate only)
// ---------------------------------------------------------------------------

export interface TransformOp {
  readonly op: 'translate';
  readonly v: readonly [number, number, number];
}

export function tTranslate(v: readonly [number, number, number]): TransformOp {
  return { op: 'translate', v };
}

// ---------------------------------------------------------------------------
// Resolution: Element tree -> ResolvedElement tree (key paths + IR + relations)
// ---------------------------------------------------------------------------

export interface Relationship {
  readonly kind: 'Voids' | 'Fills' | 'Contains';
  readonly target: string;
}

export interface ResolvedElement {
  readonly type: string;
  readonly keyPath: string;
  readonly geometry: IRNode;
  readonly relationships: readonly Relationship[];
  readonly children: readonly ResolvedElement[];
}

function isFamily(t: Element['type']): t is FamilyComponent<never> {
  return typeof t === 'function';
}

function typeNameOf(e: Element): string {
  return isFamily(e.type) ? e.type.familyName : e.type;
}

/** Run family render functions until an intrinsic element remains. The
 *  outermost family supplies the resolved type name. */
function renderToIntrinsic(elem: Element): { intrinsic: Element; typeName: string } {
  const typeName = typeNameOf(elem);
  let cur = elem;
  while (isFamily(cur.type)) {
    cur = cur.type.renderErased(cur.props);
  }
  return { intrinsic: cur, typeName };
}

function baseGeometry(intrinsic: Element): IRNode {
  if (intrinsic.type === 'Box') {
    const size = intrinsic.props['size'] as readonly [number, number, number];
    return box(size[0], size[1], size[2]);
  }
  if (intrinsic.type === 'Group') return emptySolid();
  throw new Error(`Spike E: unknown intrinsic element '${String(intrinsic.type)}'`);
}

/** Identity-free projection: element -> IR only. Used for plain geometry
 *  voids/fuse entries, which contribute a cut/fuse tool but no resolved node. */
function project(elem: Element): IRNode {
  const { intrinsic } = renderToIntrinsic(elem);
  return desugar(intrinsic, null).geometry;
}

interface DesugarOut {
  readonly geometry: IRNode;
  readonly openings: readonly ResolvedElement[];
  readonly hostRelationships: readonly Relationship[];
}

/** Normative desugaring: voids (local frame) -> fuse -> transform (outermost).
 *  With a hostPath, fill-role voids synthesize Opening elements; pathless
 *  desugaring (projection) treats every void as plain geometry. */
function desugar(intrinsic: Element, hostPath: string | null): DesugarOut {
  let geometry = baseGeometry(intrinsic);
  const openings: ResolvedElement[] = [];
  const hostRelationships: Relationship[] = [];

  const voids = (intrinsic.props['voids'] as readonly Element[] | undefined) ?? [];
  const tools: IRNode[] = [];
  voids.forEach((v, i) => {
    const fillRole = isFamily(v.type) && v.type.role === 'fill';
    if (fillRole && hostPath !== null) {
      const slotKey = v.key ?? String(i);
      const openingPath = `${hostPath}/voids:${slotKey}`;
      const fill = resolveAt(v, `${openingPath}/fill`);
      openings.push({
        type: 'Opening',
        keyPath: openingPath,
        geometry: fill.geometry,
        relationships: [{ kind: 'Fills', target: fill.keyPath }],
        children: [fill],
      });
      hostRelationships.push({ kind: 'Voids', target: openingPath });
      tools.push(fill.geometry);
    } else {
      tools.push(project(v));
    }
  });
  if (tools.length > 0) geometry = cutAll(geometry, tools);

  const fuses = (intrinsic.props['fuse'] as readonly Element[] | undefined) ?? [];
  if (fuses.length > 0) geometry = fuseAll([geometry, ...fuses.map(project)]);

  const ops = (intrinsic.props['transform'] as readonly TransformOp[] | undefined) ?? [];
  for (const op of ops) {
    geometry = translate(geometry, op.v);
  }

  return { geometry, openings, hostRelationships };
}

function resolveAt(elem: Element, path: string): ResolvedElement {
  const { intrinsic, typeName } = renderToIntrinsic(elem);
  const d = desugar(intrinsic, path);
  const relationships: Relationship[] = [...d.hostRelationships];
  const children: ResolvedElement[] = [];
  const seen = new Set<string>();
  intrinsic.children.forEach((c, i) => {
    const seg = c.key ?? `${typeNameOf(c)}[${i}]`;
    if (seen.has(seg)) {
      throw new Error(`Spike E: duplicate sibling key '${seg}' under '${path}'`);
    }
    seen.add(seg);
    const rc = resolveAt(c, `${path}/${seg}`);
    children.push(rc);
    relationships.push({ kind: 'Contains', target: rc.keyPath });
  });
  children.push(...d.openings);
  return { type: typeName, keyPath: path, geometry: d.geometry, relationships, children };
}

export function resolve(root: Element): ResolvedElement {
  return resolveAt(root, root.key ?? `${typeNameOf(root)}[0]`);
}

// ---------------------------------------------------------------------------
// Model evaluation: one evaluate() per element, keyed by path
// ---------------------------------------------------------------------------

export function evaluateModel(
  root: ResolvedElement,
  ev: Evaluator,
  env: Env = {}
): Map<string, Result<AnyShape<Dimension>>> {
  const out = new Map<string, Result<AnyShape<Dimension>>>();
  const walk = (n: ResolvedElement): void => {
    out.set(n.keyPath, ev.evaluate(n.geometry, env));
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}
