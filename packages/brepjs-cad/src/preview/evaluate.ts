import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AnyShape, ShapeMesh } from 'brepjs';
import {
  modelToMeshData,
  type ElementRange,
  type EvaluatedNodeLike,
  type MeshData,
  type PreviewMeasurements,
  type PreviewModelPayload,
  type PreviewTreeNode,
} from 'brepjs-viewer';
import { loadBrep, initOcctWasm, type BrepNs } from '../verify/brepjsRuntime.js';
import { loadPart } from '../verify/runPart.js';
import { packageRootOf } from '../verify/typecheck.js';
import { disposeShape } from '../disposeShape.js';

// Structural views of brepjs-families — the package is dynamically imported from the
// USER's project (the CLI walks up into the project's node_modules), so brepjs-cad
// carries no dependency on it and previews plain shapes without it installed.
interface ResolvedElementLike {
  readonly keyPath: string;
  readonly type: string;
  readonly archetype?: string | undefined;
  readonly geometry: { readonly kind: string };
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly children: readonly ResolvedElementLike[];
}

interface FamiliesEvaluatedNode {
  readonly keyPath: string;
  readonly mesh: { readonly ok: boolean; readonly value?: ShapeMesh | undefined };
  readonly shape?: { readonly ok: boolean; readonly value?: AnyShape | undefined } | undefined;
}

interface FamiliesNs {
  resolve(el: unknown): ResolvedElementLike;
  evaluateModel(
    root: ResolvedElementLike,
    evaluator: unknown,
    env: Record<string, unknown>,
    options: { shapes?: boolean }
  ): { root: ResolvedElementLike; byKeyPath: ReadonlyMap<string, FamiliesEvaluatedNode> };
}

export interface PreviewBuild {
  readonly payload: PreviewModelPayload;
  /** Whole-model merge in ShapeMesh form — the GLB export input, derived from the
   *  same single merge the viewer payload uses. */
  readonly merged: ShapeMesh;
  readonly ok: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isResultLike(v: unknown): v is { ok: boolean; value?: unknown; error?: unknown } {
  return isRecord(v) && typeof v['ok'] === 'boolean' && ('value' in v || 'error' in v);
}

function isResolvedElementLike(v: unknown): v is ResolvedElementLike {
  return (
    isRecord(v) &&
    typeof v['keyPath'] === 'string' &&
    isRecord(v['geometry']) &&
    Array.isArray(v['children'])
  );
}

function isElementLike(v: unknown): boolean {
  // A families Element's type is an intrinsic name OR a family component function
  // (a tree rooted at <MyFamily/> arrives un-rendered — resolve() renders it).
  return (
    isRecord(v) &&
    (typeof v['type'] === 'string' || typeof v['type'] === 'function') &&
    isRecord(v['props']) &&
    Array.isArray(v['children']) &&
    !('keyPath' in v)
  );
}

/**
 * Load the module through the registered hook (same realm/kernel as verify) and
 * evaluate it into a preview payload. Contract: `export default` a value or a
 * (possibly async) function returning one — a families element tree, an already
 * resolved tree, or a plain shape; `Result` wrappers are unwrapped.
 */
export async function evaluatePreview(
  entryPath: string,
  opts: { fresh?: boolean } = {}
): Promise<PreviewBuild> {
  const brep = await loadBrep();
  await initOcctWasm(brep);
  const mod = await loadPart(entryPath, opts.fresh ?? false);
  if (mod.default === undefined) {
    throw new Error(
      'module has no default export (expected a shape, a families element tree, or a function returning one)'
    );
  }
  const produced: unknown = await Promise.resolve(
    typeof mod.default === 'function' ? (mod.default as () => unknown)() : mod.default
  );
  let value = produced;
  if (isResultLike(value)) {
    if (!value.ok) {
      throw new Error(
        `model returned Err: ${String((value.error as Error)?.message ?? value.error)}`
      );
    }
    value = value.value;
  }
  if (isResolvedElementLike(value) || isElementLike(value)) {
    return evaluateTree(brep, value, entryPath);
  }
  return evaluateShape(brep, value as AnyShape);
}

/**
 * Resolve the ESM entry of the PROJECT's brepjs-families install, walking from the
 * entry module. A globally installed CLI is not inside the project's node_modules, so
 * a bare import would miss (or load the wrong copy); resolving from the entry lands on
 * the same file URL the model itself imports — one module instance, matching runtime
 * identities.
 */
export function resolveFamiliesEntry(entryPath: string): string | undefined {
  let requireEntry: string;
  try {
    requireEntry = createRequire(pathToFileURL(entryPath).href).resolve('brepjs-families');
  } catch {
    return undefined;
  }
  const pkgDir = packageRootOf(dirname(requireEntry), 'brepjs-families');
  if (pkgDir === undefined) return requireEntry;
  try {
    const pkg = JSON.parse(readFileSync(resolvePath(pkgDir, 'package.json'), 'utf8')) as {
      exports?: unknown;
      module?: unknown;
    };
    const rel = esmEntryOf(pkg);
    return rel === undefined ? requireEntry : resolvePath(pkgDir, rel);
  } catch {
    return requireEntry;
  }
}

function esmEntryOf(pkg: { exports?: unknown; module?: unknown }): string | undefined {
  const root = (pkg.exports as Record<string, unknown> | undefined)?.['.'];
  if (root && typeof root === 'object') {
    const imp = (root as Record<string, unknown>)['import'];
    if (imp && typeof imp === 'object') {
      const d = (imp as Record<string, unknown>)['default'];
      if (typeof d === 'string') return d;
    }
    const d = (root as Record<string, unknown>)['default'];
    if (typeof d === 'string') return d;
  }
  return typeof pkg.module === 'string' ? pkg.module : undefined;
}

async function importFamilies(entryPath: string): Promise<FamiliesNs | undefined> {
  try {
    // Dev-dependency install: the CLI lives inside the project's node_modules, so the
    // bare specifier resolves to the project's copy.
    return (await import('brepjs-families')) as unknown as FamiliesNs;
  } catch {
    const abs = resolveFamiliesEntry(entryPath);
    if (abs === undefined) return undefined;
    try {
      return (await import(pathToFileURL(abs).href)) as FamiliesNs;
    } catch {
      return undefined;
    }
  }
}

async function evaluateTree(
  brep: BrepNs,
  value: unknown,
  entryPath: string
): Promise<PreviewBuild> {
  const fam = await importFamilies(entryPath);
  if (fam === undefined) {
    throw new Error(
      "the model is a families element tree, but 'brepjs-families' is not installed in this project"
    );
  }
  const resolved = isResolvedElementLike(value) ? value : fam.resolve(value);
  using evaluator = new brep.csg.Evaluator();
  const model = fam.evaluateModel(resolved, evaluator, {}, { shapes: true });
  const nodes = new Map<string, EvaluatedNodeLike>();
  for (const [keyPath, node] of model.byKeyPath) {
    const m = node.mesh.ok ? node.mesh.value : undefined;
    if (!m) {
      nodes.set(keyPath, { mesh: { ok: false } });
      continue;
    }
    // Shapes are borrowed from the Evaluator's cache (do not dispose); edges are
    // cosmetic, so a meshEdges failure must not fail the element.
    let edges: Float32Array | undefined;
    const shape = node.shape?.ok ? node.shape.value : undefined;
    if (shape) {
      try {
        edges = brep.meshEdges(shape).lines;
      } catch {
        edges = undefined;
      }
    }
    nodes.set(keyPath, {
      mesh: {
        ok: true,
        value: {
          triangles: m.triangles,
          vertices: m.vertices,
          normals: m.normals,
          faceGroups: m.faceGroups,
          ...(edges ? { edges } : {}),
        },
      },
    });
  }
  const { data, elements, failed } = modelToMeshData({ byKeyPath: nodes });
  return finish(data, elements, failed, toTree(model.root));
}

function evaluateShape(brep: BrepNs, shape: AnyShape): PreviewBuild {
  try {
    const m = brep.mesh(shape);
    let edges: Float32Array | undefined;
    try {
      edges = brep.meshEdges(shape).lines;
    } catch {
      edges = undefined;
    }
    const node: EvaluatedNodeLike = {
      mesh: {
        ok: true,
        value: {
          triangles: m.triangles,
          vertices: m.vertices,
          normals: m.normals,
          faceGroups: m.faceGroups,
          ...(edges ? { edges } : {}),
        },
      },
    };
    const { data, elements, failed } = modelToMeshData({ byKeyPath: new Map([['part', node]]) });
    const tree: PreviewTreeNode = {
      keyPath: 'part',
      type: 'Shape',
      hasGeometry: true,
      children: [],
    };
    return finish(data, elements, failed, tree);
  } finally {
    // A plain-shape module hands ownership to the caller — verify's contract too.
    disposeShape(shape);
  }
}

function toTree(el: ResolvedElementLike): PreviewTreeNode {
  const name = el.attributes['name'];
  return {
    keyPath: el.keyPath,
    type: el.type,
    ...(el.archetype !== undefined ? { archetype: el.archetype } : {}),
    ...(typeof name === 'string' ? { name } : {}),
    hasGeometry: el.geometry.kind !== 'Empty',
    children: el.children.map(toTree),
  };
}

function measure(data: MeshData, elementCount: number, failedCount: number): PreviewMeasurements {
  const p = data.position;
  const counts = {
    elementCount,
    failedCount,
    triangleCount: data.index.length / 3,
  };
  if (p.length < 3) return counts;
  const b = {
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
    zMin: Infinity,
    zMax: -Infinity,
  };
  for (let i = 0; i + 2 < p.length; i += 3) {
    const x = p[i] ?? 0;
    const y = p[i + 1] ?? 0;
    const z = p[i + 2] ?? 0;
    if (x < b.xMin) b.xMin = x;
    if (x > b.xMax) b.xMax = x;
    if (y < b.yMin) b.yMin = y;
    if (y > b.yMax) b.yMax = y;
    if (z < b.zMin) b.zMin = z;
    if (z > b.zMax) b.zMax = z;
  }
  return { ...counts, bounds: b };
}

function finish(
  data: MeshData,
  elements: readonly ElementRange[],
  failed: readonly string[],
  tree: PreviewTreeNode
): PreviewBuild {
  const payload: PreviewModelPayload = {
    data,
    elements,
    failed,
    tree,
    measurements: measure(data, elements.length, failed.length),
  };
  const merged: ShapeMesh = {
    triangles: data.index,
    vertices: data.position,
    normals: data.normal,
    uvs: new Float32Array(0),
    faceGroups: (data.faceGroups ?? []).map((g) => ({ ...g, origin: 0 })),
  };
  return { payload, merged, ok: failed.length === 0 };
}
