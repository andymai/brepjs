/**
 * Assembly mates — constraint-based positioning for assembly parts.
 */

import type { Face, Edge } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { type Result, ok, err } from '@/core/result.js';
import { validationError, kernelError, BrepErrorCode } from '@/core/errors.js';
import type { AssemblyNode } from './assemblyFns.js';
import { walkAssembly } from './assemblyFns.js';
import { faceCenter, normalAt } from '@/topology/faceFns.js';
import {
  solveConstraints,
  type SolverEntity,
  type SolverConstraint,
} from '@/kernel/solverAdapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MateEntity {
  node: string;
  face?: Face;
  edge?: Edge;
  point?: Vec3;
}

export type MateConstraint =
  | { type: 'coincident'; entityA: MateEntity; entityB: MateEntity }
  | { type: 'concentric'; axisA: MateEntity; axisB: MateEntity }
  | { type: 'distance'; entityA: MateEntity; entityB: MateEntity; distance: number }
  | { type: 'angle'; entityA: MateEntity; entityB: MateEntity; angle: number }
  | { type: 'fixed'; entity: MateEntity };

export interface AssemblySolveResult {
  transforms: Map<string, { position: Vec3; rotation: [number, number, number, number] }>;
  dof: number;
  converged: boolean;
}

// ---------------------------------------------------------------------------
// Geometry extraction
// ---------------------------------------------------------------------------

function extractEntity(mate: MateEntity): SolverEntity | null {
  if (mate.face) {
    const origin = faceCenter(mate.face);
    const normal = normalAt(mate.face);
    return { type: 'plane', origin, normal };
  }

  if (mate.point) {
    return { type: 'point', origin: mate.point };
  }

  return null;
}

/** Extract and validate a pair of MateEntities into a partial SolverConstraint. */
function extractPair(
  a: MateEntity,
  b: MateEntity
): Result<{
  entityA: { node: string; entity: SolverEntity };
  entityB: { node: string; entity: SolverEntity };
}> {
  const entA = extractEntity(a);
  const entB = extractEntity(b);
  if (!entA || !entB) {
    return err(
      validationError(
        BrepErrorCode.ASSEMBLY_MATE_INVALID,
        'solveAssembly: could not extract geometry from mate entities'
      )
    );
  }
  return ok({
    entityA: { node: a.node, entity: entA },
    entityB: { node: b.node, entity: entB },
  });
}

/** Convert a single mate into a solver constraint. */
function mateToSolverConstraint(mate: MateConstraint): Result<SolverConstraint> {
  switch (mate.type) {
    case 'fixed':
      return ok({
        type: 'fixed',
        entityA: { node: mate.entity.node, entity: { type: 'point', origin: [0, 0, 0] } },
      });
    case 'coincident': {
      const pair = extractPair(mate.entityA, mate.entityB);
      if (!pair.ok) return pair;
      return ok({ type: 'coincident', ...pair.value });
    }
    case 'distance': {
      const pair = extractPair(mate.entityA, mate.entityB);
      if (!pair.ok) return pair;
      return ok({ type: 'distance', ...pair.value, value: mate.distance });
    }
    case 'angle': {
      const pair = extractPair(mate.entityA, mate.entityB);
      if (!pair.ok) return pair;
      return ok({ type: 'angle', ...pair.value, value: mate.angle });
    }
    case 'concentric': {
      const pair = extractPair(mate.axisA, mate.axisB);
      if (!pair.ok) return pair;
      return ok({ type: 'concentric', ...pair.value });
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a mate constraint to an assembly.
 * Returns a new assembly node with the constraint added.
 */
export function addMate(assembly: AssemblyNode, constraint: MateConstraint): AssemblyNode {
  const existing = (assembly.mates ?? []) as readonly MateConstraint[];
  return { ...assembly, mates: [...existing, constraint] };
}

/**
 * Solve all mate constraints and compute part transforms.
 */
export function solveAssembly(assembly: AssemblyNode): Result<AssemblySolveResult> {
  const mates = assembly.mates as MateConstraint[] | undefined;
  if (!mates || mates.length === 0) {
    return err(
      validationError(BrepErrorCode.ASSEMBLY_MATE_INVALID, 'solveAssembly: no mates defined')
    );
  }

  try {
    // Collect all node names
    const nodes: string[] = [];
    walkAssembly(assembly, (node) => {
      nodes.push(node.name);
    });

    // Convert mates to solver constraints
    const solverConstraints: SolverConstraint[] = [];

    for (const mate of mates) {
      const result = mateToSolverConstraint(mate);
      if (!result.ok) return result;
      solverConstraints.push(result.value);
    }

    const result = solveConstraints(nodes, solverConstraints);

    if (!result.converged) {
      const detail =
        result.unsupported.length > 0
          ? `Unsupported constraint types: ${result.unsupported.join(', ')} (${result.dof} DOF unresolved)`
          : 'Assembly constraint solver did not converge';
      return err(kernelError(BrepErrorCode.ASSEMBLY_NOT_CONVERGED, detail));
    }

    return ok({
      transforms: result.transforms,
      dof: result.dof,
      converged: result.converged,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      kernelError(BrepErrorCode.ASSEMBLY_SOLVE_FAILED, `Assembly solve failed: ${raw}`, e)
    );
  }
}
