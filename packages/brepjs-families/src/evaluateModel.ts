/**
 * Model evaluation: one `evaluate()` per element, keyed by path. Identity
 * (keyPath, attributes, relationships) rides on the record beside the
 * geometry Result; identical recipes share one materialization underneath.
 */

import type { csg, Result, AnyShape, Dimension } from 'brepjs';
import type { Relationship, ResolvedElement } from './resolve.js';

export interface EvaluatedNode {
  readonly keyPath: string;
  readonly type: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly relationships: readonly Relationship[];
  /** Borrowed from the Evaluator — do not dispose; valid per its contract. */
  readonly result: Result<AnyShape<Dimension>>;
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
  env: csg.Env = {}
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
        result: evaluator.evaluate(n.geometry, env),
      });
    }
    for (const c of n.children) walk(c);
  };
  walk(root);
  return { root, byKeyPath };
}
