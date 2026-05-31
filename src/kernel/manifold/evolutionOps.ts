/**
 * History-tracking operation variants for the manifold adapter.
 *
 * Each `*WithHistory` op runs its plain counterpart on Manifold and wraps the
 * result in an {@link OperationResult}. Manifold tracks provenance only at the
 * coarse mesh-run / originalID level, not per B-rep face, so a faithful
 * hash-to-hash {@link ShapeEvolution} cannot be reconstructed here. We therefore
 * return an empty-but-valid evolution (no generated/modified/deleted entries);
 * exact face-history queries are answered by the OCCT kernel via op-graph replay
 * at a higher layer.
 * @module
 */

import type { KernelEvolutionOps } from '@/kernel/interfaces/evolutionOps.js';
import type {
  BooleanDiagnostics,
  DiagnosticOperationResult,
  KernelShape,
  OperationResult,
  ShapeEvolution,
} from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { makeBooleanOps } from './booleanOps.js';
import { makeModifierOps } from './modifierOps.js';
import { makeTransformOps } from './transformOps.js';

const NO_DIAGNOSTICS: BooleanDiagnostics = {
  hasErrors: false,
  hasWarnings: false,
  messages: [],
};

function emptyEvolution(): ShapeEvolution {
  return {
    modified: new Map<number, readonly number[]>(),
    generated: new Map<number, readonly number[]>(),
    deleted: new Set<number>(),
  };
}

function result(shape: KernelShape): OperationResult {
  return { shape, evolution: emptyEvolution() };
}

function diagnostic(shape: KernelShape): DiagnosticOperationResult {
  return { shape, evolution: emptyEvolution(), diagnostics: NO_DIAGNOSTICS };
}

export function makeEvolutionOps(module: ManifoldModule): KernelEvolutionOps {
  const transform = makeTransformOps(module);
  const boolean = makeBooleanOps(module);
  const modifier = makeModifierOps(module);

  return {
    translateWithHistory: (shape, x, y, z) => result(transform.translate(shape, x, y, z)),
    rotateWithHistory: (shape, angle, _hashes, _bound, axis, center) =>
      result(transform.rotate(shape, angle, axis, center)),
    mirrorWithHistory: (shape, origin, normal) => result(transform.mirror(shape, origin, normal)),
    scaleWithHistory: (shape, center, factor) => result(transform.scale(shape, center, factor)),
    generalTransformWithHistory: (shape, linear, translation, isOrthogonal) =>
      result(transform.generalTransform(shape, linear, translation, isOrthogonal)),
    fuseWithHistory: (shape, tool, _hashes, _bound, options) =>
      diagnostic(boolean.fuse(shape, tool, options)),
    cutWithHistory: (shape, tool, _hashes, _bound, options) =>
      diagnostic(boolean.cut(shape, tool, options)),
    intersectWithHistory: (shape, tool, _hashes, _bound, options) =>
      diagnostic(boolean.intersect(shape, tool, options)),
    filletWithHistory: (shape, edges, radius) => result(modifier.fillet(shape, edges, radius)),
    chamferWithHistory: (shape, edges, distance) =>
      result(modifier.chamfer(shape, edges, distance)),
    shellWithHistory: (shape, faces, thickness, _hashes, _bound, tolerance) =>
      result(modifier.shell(shape, faces, thickness, tolerance)),
    thickenWithHistory: (shape, thickness) => result(modifier.thicken(shape, thickness)),
    offsetWithHistory: (shape, distance, _hashes, _bound, tolerance) =>
      result(modifier.offset(shape, distance, tolerance)),
    draftWithHistory: (shape, faces, pullDirection, neutralPlane, angleDeg) =>
      result(modifier.draft(shape, faces, pullDirection, neutralPlane, angleDeg)),
    applyComposedTransformWithHistory: (shape, transformHandle) =>
      result(transform.transform(shape, transformHandle)),
  };
}
