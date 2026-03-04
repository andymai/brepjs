/**
 * Constraint solver adapter — analytical solver for simple assembly mates.
 */

/** 3D vector (local alias to avoid cross-layer import). */
type Vec3 = readonly [number, number, number];

export interface SolverEntity {
  type: 'plane' | 'axis' | 'point';
  origin: Vec3;
  normal?: Vec3;
  direction?: Vec3;
}

export interface SolverConstraint {
  type: 'coincident' | 'concentric' | 'distance' | 'angle' | 'fixed';
  entityA?: { node: string; entity: SolverEntity };
  entityB?: { node: string; entity: SolverEntity };
  value?: number;
}

export interface SolverResult {
  transforms: Map<string, { position: Vec3; rotation: [number, number, number, number] }>;
  dof: number;
  converged: boolean;
  /** Constraint types that were passed in but not solved (not yet implemented). */
  unsupported: string[];
}

/**
 * Standard degrees of freedom left unresolved by each unsupported constraint type.
 * concentric: 2 rotational (axis alignment) + 2 translational (axis centering) = 4
 * angle: 1 rotational
 */
const UNSUPPORTED_DOF: Readonly<Record<string, number>> = { concentric: 4, angle: 1 };

/**
 * Solve assembly constraints analytically.
 *
 * Currently handles: fixed, coincident (plane-plane), distance (plane-plane).
 * Returns `converged: false` with unsupported constraint details for concentric and angle.
 */
export function solveConstraints(nodes: string[], constraints: SolverConstraint[]): SolverResult {
  const transforms = new Map<
    string,
    { position: Vec3; rotation: [number, number, number, number] }
  >();

  // Initialize all nodes at origin
  for (const node of nodes) {
    transforms.set(node, {
      position: [0, 0, 0],
      rotation: [1, 0, 0, 0],
    });
  }

  const unsupported: string[] = [];

  // Process fixed constraints first (no-ops, node stays at origin)
  // Then process positioning constraints
  for (const c of constraints) {
    if (c.type === 'coincident' && c.entityA && c.entityB) {
      const a = c.entityA;
      const b = c.entityB;

      if (a.entity.type === 'plane' && b.entity.type === 'plane') {
        const aNormal = a.entity.normal ?? [0, 0, 1];
        const aOrigin = a.entity.origin;
        const bOrigin = b.entity.origin;

        const dot =
          aNormal[0] * (aOrigin[0] - bOrigin[0]) +
          aNormal[1] * (aOrigin[1] - bOrigin[1]) +
          aNormal[2] * (aOrigin[2] - bOrigin[2]);

        const pos: Vec3 = [dot * aNormal[0], dot * aNormal[1], dot * aNormal[2]];
        transforms.set(b.node, { position: pos, rotation: [1, 0, 0, 0] });
      }
    } else if (c.type === 'distance' && c.entityA && c.entityB && c.value !== undefined) {
      const a = c.entityA;
      const b = c.entityB;

      if (a.entity.type === 'plane' && b.entity.type === 'plane') {
        const aNormal = a.entity.normal ?? [0, 0, 1];
        const aOrigin = a.entity.origin;
        const bOrigin = b.entity.origin;

        const currentDist =
          aNormal[0] * (aOrigin[0] - bOrigin[0]) +
          aNormal[1] * (aOrigin[1] - bOrigin[1]) +
          aNormal[2] * (aOrigin[2] - bOrigin[2]);

        const offset = currentDist + c.value;
        const pos: Vec3 = [offset * aNormal[0], offset * aNormal[1], offset * aNormal[2]];
        transforms.set(b.node, { position: pos, rotation: [1, 0, 0, 0] });
      }
    } else if (c.type === 'concentric' || c.type === 'angle') {
      unsupported.push(c.type);
    }
    // 'fixed' is a no-op — node stays at origin (handled by initialization)
  }

  const dof = unsupported.reduce((sum, type) => sum + (UNSUPPORTED_DOF[type] ?? 0), 0);

  return { transforms, dof, converged: unsupported.length === 0, unsupported };
}
