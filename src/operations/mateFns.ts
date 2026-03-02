/**
 * Assembly mates — constraint-based positioning for assembly parts.
 */

import type { Face, Edge } from '../core/shapeTypes.js';
import type { Vec3 } from '../core/types.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, kernelError, BrepErrorCode } from '../core/errors.js';
import type { AssemblyNode } from './assemblyFns.js';
import { walkAssembly } from './assemblyFns.js';
import { faceCenter, normalAt } from '../topology/faceFns.js';
import {
  solveConstraints,
  type SolverEntity,
  type SolverConstraint,
} from '../kernel/solverAdapter.js';

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
    // Use face center + normal for both plane and cylindrical faces
    return { type: 'plane', origin, normal };
  }

  if (mate.point) {
    return { type: 'point', origin: mate.point };
  }

  return null;
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
      if (mate.type === 'fixed') {
        solverConstraints.push({
          type: 'fixed',
          entityA: { node: mate.entity.node, entity: { type: 'point', origin: [0, 0, 0] } },
        });
        continue;
      }

      if (mate.type === 'coincident') {
        const entA = extractEntity(mate.entityA);
        const entB = extractEntity(mate.entityB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'coincident',
          entityA: { node: mate.entityA.node, entity: entA },
          entityB: { node: mate.entityB.node, entity: entB },
        });
      }

      if (mate.type === 'distance') {
        const entA = extractEntity(mate.entityA);
        const entB = extractEntity(mate.entityB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'distance',
          entityA: { node: mate.entityA.node, entity: entA },
          entityB: { node: mate.entityB.node, entity: entB },
          value: mate.distance,
        });
      }

      if (mate.type === 'angle') {
        const entA = extractEntity(mate.entityA);
        const entB = extractEntity(mate.entityB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'angle',
          entityA: { node: mate.entityA.node, entity: entA },
          entityB: { node: mate.entityB.node, entity: entB },
          value: mate.angle,
        });
      }

      if (mate.type === 'concentric') {
        const entA = extractEntity(mate.axisA);
        const entB = extractEntity(mate.axisB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'concentric',
          entityA: { node: mate.axisA.node, entity: entA },
          entityB: { node: mate.axisB.node, entity: entB },
        });
      }
    }

    const result = solveConstraints(nodes, solverConstraints);

    if (!result.converged) {
      return err(
        kernelError(
          BrepErrorCode.ASSEMBLY_NOT_CONVERGED,
          'Assembly constraint solver did not converge'
        )
      );
    }

    return ok({
      transforms: result.transforms,
      dof: result.dof,
      converged: result.converged,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(kernelError(BrepErrorCode.ASSEMBLY_SOLVE_FAILED, `Assembly solve failed: ${raw}`, e));
  }
}
