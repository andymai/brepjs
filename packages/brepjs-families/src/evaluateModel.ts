/**
 * Model evaluation: one record per element, keyed by path. Identity (keyPath,
 * attributes, relationships) rides on the record beside the geometry;
 * identical recipes share one materialization underneath.
 *
 * Meshes are the primary output: plain data with no kernel lifetimes, cached
 * by content so re-evaluation after shape-cache eviction is a pure data hit.
 * B-rep shape handles are opt-in (`shapes: true`) for export paths.
 */

import type { csg, Result, AnyShape, Dimension, ShapeMesh, MeshOptions } from 'brepjs';
import type { Relationship, ResolvedElement } from './resolve.js';

export interface EvaluatedNode {
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

export interface EvaluateModelOptions {
  /** Also materialize a B-rep handle per element (export paths). Off by
   *  default so viewport consumers never pin kernel lifetimes. */
  readonly shapes?: boolean | undefined;
  readonly mesh?: MeshOptions | undefined;
}

export interface EvaluatedModel {
  readonly root: ResolvedElement;
  /** Geometry-bearing elements only: pure containers (Empty geometry) exist
   *  for identity/containment and have no entry. */
  readonly byKeyPath: ReadonlyMap<string, EvaluatedNode>;
}

export function evaluateModel(
  root: ResolvedElement,
  evaluator: csg.Evaluator,
  env: csg.Env = {},
  options: EvaluateModelOptions = {}
): EvaluatedModel {
  const byKeyPath = new Map<string, EvaluatedNode>();
  const walk = (n: ResolvedElement): void => {
    // The Empty identity node is not directly materializable by design.
    if (n.geometry.kind !== 'Empty') {
      byKeyPath.set(n.keyPath, {
        keyPath: n.keyPath,
        type: n.type,
        attributes: n.attributes,
        relationships: n.relationships,
        mesh: evaluator.evaluateMesh(n.geometry, env, { ...options.mesh }),
        ...(options.shapes ? { shape: evaluator.evaluate(n.geometry, env) } : {}),
      });
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return { root, byKeyPath };
}
