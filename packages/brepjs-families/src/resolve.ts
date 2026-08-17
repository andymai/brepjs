/**
 * Resolution: Element tree -> ResolvedElement tree. Assigns key paths, runs
 * render functions, desugars geometry props onto the content-addressed CSG IR
 * (voids in the local frame, then fuse, then transform), synthesizes Opening
 * elements for fill-role voids, and captures identity-side attributes.
 *
 * Identity rides on ResolvedElement (keyPath, attributes, relationships); the
 * IR DAG beneath carries none of it, so identical recipes share one cache
 * entry while identities stay distinct.
 */

import { csg } from 'brepjs';
import { isFamily, typeNameOf, type Element } from './element.js';

export interface TransformOp {
  readonly op: 'translate';
  readonly v: readonly [number, number, number];
}

export function tTranslate(v: readonly [number, number, number]): TransformOp {
  return { op: 'translate', v };
}

export interface Relationship {
  readonly kind: 'Voids' | 'Fills' | 'Contains';
  readonly target: string;
}

export interface ResolvedElement {
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

const IDENTITY_PROPS = ['psets', 'material', 'classification'] as const;

function identityAttributes(elem: Element): Readonly<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const key of IDENTITY_PROPS) {
    if (elem.props[key] !== undefined) out[key] = elem.props[key];
  }
  return out;
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

function baseGeometry(intrinsic: Element): csg.IRNode {
  if (intrinsic.type === 'Box') {
    const size = intrinsic.props['size'] as readonly [number, number, number];
    return csg.box(size[0], size[1], size[2]);
  }
  if (intrinsic.type === 'Group' || intrinsic.type === 'Fragment') return csg.emptySolid();
  throw new Error(`brepjs-families: unknown intrinsic element '${String(intrinsic.type)}'`);
}

/** Identity-free projection: element -> IR only. Used for plain geometry
 *  voids/fuse entries, which contribute a boolean tool but no resolved node. */
function project(elem: Element): csg.IRNode {
  const { intrinsic } = renderToIntrinsic(elem);
  return desugar(intrinsic, null).geometry;
}

interface DesugarOut {
  readonly geometry: csg.IRNode;
  readonly openings: readonly ResolvedElement[];
  readonly hostRelationships: readonly Relationship[];
}

/** Normative desugaring order: voids (local frame) -> fuse -> transform.
 *  With a hostPath, fill-role voids synthesize Opening elements; pathless
 *  desugaring (projection) treats every void as plain geometry. */
function applyOps(geometry: csg.IRNode, ops: readonly TransformOp[]): csg.IRNode {
  let out = geometry;
  for (const op of ops) {
    out = csg.translate(out, op.v);
  }
  return out;
}

/** Rebuild a resolved subtree with the host's transform applied to every
 *  geometry (identity fields untouched): synthesized openings and fills are
 *  cut in the host's LOCAL frame, so a transformed host must carry them. */
function transformResolved(node: ResolvedElement, ops: readonly TransformOp[]): ResolvedElement {
  return {
    ...node,
    geometry: applyOps(node.geometry, ops),
    children: node.children.map((c) => transformResolved(c, ops)),
  };
}

function desugar(intrinsic: Element, hostPath: string | null): DesugarOut {
  let geometry = baseGeometry(intrinsic);
  let openings: ResolvedElement[] = [];
  const hostRelationships: Relationship[] = [];

  const voids = (intrinsic.props['voids'] as readonly Element[] | undefined) ?? [];
  const tools: csg.IRNode[] = [];
  const slotKeys = new Set<string>();
  voids.forEach((v, i) => {
    const fillRole = isFamily(v.type) && v.type.role === 'fill';
    if (fillRole && hostPath !== null) {
      if (v.key !== undefined) assertKeyAllowed(v.key, hostPath);
      const slotKey = v.key ?? String(i);
      if (slotKeys.has(slotKey)) {
        throw new Error(
          `brepjs-families: duplicate void slot key '${slotKey}' under '${hostPath}'`
        );
      }
      slotKeys.add(slotKey);
      const openingPath = `${hostPath}/voids:${slotKey}`;
      const fill = resolveAt(v, `${openingPath}/fill`, v.key !== undefined);
      openings.push({
        type: 'Opening',
        keyPath: openingPath,
        keyed: v.key !== undefined,
        geometry: fill.geometry,
        props: {},
        attributes: {},
        relationships: [{ kind: 'Fills', target: fill.keyPath }],
        children: [fill],
      });
      hostRelationships.push({ kind: 'Voids', target: openingPath });
      tools.push(fill.geometry);
    } else {
      tools.push(project(v));
    }
  });
  if (tools.length > 0) geometry = csg.cutAll(geometry, tools);

  const fuses = (intrinsic.props['fuse'] as readonly Element[] | undefined) ?? [];
  if (fuses.length > 0) geometry = csg.fuseAll([geometry, ...fuses.map(project)]);

  const ops = (intrinsic.props['transform'] as readonly TransformOp[] | undefined) ?? [];
  if (ops.length > 0) {
    geometry = applyOps(geometry, ops);
    // Openings/fills were cut in the local frame; the host transform carries
    // them into the same frame as the host's own geometry.
    openings = openings.map((o) => transformResolved(o, ops));
  }

  return { geometry, openings, hostRelationships };
}

/** ':' is reserved for prop-embedded slot segments (`voids:d1`), which makes
 *  synthesized paths structurally collision-free against child keys. */
function assertKeyAllowed(key: string, path: string): void {
  if (key.includes(':')) {
    throw new Error(
      `brepjs-families: key '${key}' under '${path}' contains ':', which is reserved for prop-embedded slots`
    );
  }
}

function resolveAt(elem: Element, path: string, keyed: boolean): ResolvedElement {
  const { intrinsic, typeName } = renderToIntrinsic(elem);
  const d = desugar(intrinsic, path);
  const relationships: Relationship[] = [...d.hostRelationships];
  const children: ResolvedElement[] = [];
  const seen = new Set<string>();
  intrinsic.children.forEach((c, i) => {
    if (c.key !== undefined) assertKeyAllowed(c.key, path);
    const seg = c.key ?? `${typeNameOf(c)}[${i}]`;
    if (seen.has(seg)) {
      throw new Error(`brepjs-families: duplicate sibling key '${seg}' under '${path}'`);
    }
    seen.add(seg);
    const rc = resolveAt(c, `${path}/${seg}`, c.key !== undefined);
    children.push(rc);
    relationships.push({ kind: 'Contains', target: rc.keyPath });
  });
  children.push(...d.openings);
  return {
    type: typeName,
    keyPath: path,
    keyed,
    geometry: d.geometry,
    props: elem.props,
    attributes: identityAttributes(elem),
    relationships,
    children,
  };
}

export function resolve(root: Element): ResolvedElement {
  return resolveAt(root, root.key ?? `${typeNameOf(root)}[0]`, root.key !== undefined);
}
