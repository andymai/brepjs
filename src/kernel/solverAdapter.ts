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
 * coincident: 3 translational (plane normal alignment + contact)
 * concentric: 2 rotational (axis alignment) + 2 translational (axis centering) = 4
 * distance: 1 translational (offset along normal)
 * angle: 1 rotational
 */
const UNSUPPORTED_DOF: Readonly<Record<string, number>> = {
  coincident: 3,
  concentric: 4,
  distance: 1,
  angle: 1,
};

type Pose = { position: Vec3; rotation: [number, number, number, number] };

const IDENTITY_ROTATION: [number, number, number, number] = [1, 0, 0, 0];

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Position a dependent plane against an already-placed reference plane.
 *
 * The reference's solved translation is applied to its (local) entity origin
 * before measuring, so a chain composes down already-solved poses instead of
 * reading original geometry. The dependent is at the origin (a node is only
 * solved once, while unplaced), so the returned position is its absolute
 * translation. `extra` is the gap for a distance mate (0 for coincident).
 * Rotation stays identity — coincident/distance produce pure translations;
 * Phase 1 rotational constraints will extend this.
 */
function solvePlanePair(ref: SolverEntity, refPos: Vec3, dep: SolverEntity, extra: number): Pose {
  const n = ref.normal ?? [0, 0, 1];
  const refOrigin = add(ref.origin, refPos);
  const offset =
    dot(n, [
      refOrigin[0] - dep.origin[0],
      refOrigin[1] - dep.origin[1],
      refOrigin[2] - dep.origin[2],
    ]) + extra;
  return {
    position: [offset * n[0], offset * n[1], offset * n[2]],
    rotation: IDENTITY_ROTATION,
  };
}

/**
 * Solve assembly constraints analytically.
 *
 * Handles: fixed, coincident (plane-plane), distance (plane-plane). For a
 * positioning mate, entityA is the reference and entityB the dependent. Chain
 * roots (nodes never positioned by a mate) and explicit `fixed` nodes anchor at
 * the origin; constraints then resolve in topological order — each places its
 * dependent against the reference's solved pose, so multi-body chains compose.
 * Returns `converged: false` with unsupported details for concentric, angle,
 * non-plane pairs, and any constraint whose reference never resolves.
 */
export function solveConstraints(nodes: string[], constraints: SolverConstraint[]): SolverResult {
  const transforms = new Map<string, Pose>();

  // Initialize all nodes at origin
  for (const node of nodes) {
    transforms.set(node, { position: [0, 0, 0], rotation: IDENTITY_ROTATION });
  }

  const unsupported: string[] = [];

  // For positioning mates, entityA is the reference and entityB the dependent.
  const positioning = constraints.filter(
    (c) => (c.type === 'coincident' || c.type === 'distance') && c.entityA && c.entityB
  );
  const dependents = new Set<string>();
  for (const c of positioning) if (c.entityB) dependents.add(c.entityB.node);

  // Anchors are placed at the origin: any node never positioned by a mate (a
  // chain root), plus any explicit `fixed` node.
  const placed = new Set<string>();
  for (const node of nodes) if (!dependents.has(node)) placed.add(node);
  for (const c of constraints) if (c.type === 'fixed' && c.entityA) placed.add(c.entityA.node);

  // concentric / angle are not solved yet (Phase 1).
  for (const c of constraints) {
    if (c.type === 'concentric' || c.type === 'angle') unsupported.push(c.type);
  }

  // Non-plane positioning pairs are unsupported regardless of order; report them
  // eagerly and keep only plane-plane pairs for topological resolution. A node
  // left unplaced by such a pair (it's a dependent, so not a root) will cause
  // any downstream plane-plane mate that references it to end up `(unanchored)`
  // — intended: an unsolved reference can't compose, so the chain doesn't converge.
  const pending: SolverConstraint[] = [];
  for (const c of positioning) {
    if (!c.entityA || !c.entityB) continue;
    if (c.entityA.entity.type !== 'plane' || c.entityB.entity.type !== 'plane') {
      unsupported.push(`${c.type}(${c.entityA.entity.type}-${c.entityB.entity.type})`);
      continue;
    }
    pending.push(c);
  }

  // Resolve in topological rounds: a mate solves once its reference (entityA) is
  // placed, positioning the dependent (entityB) against the reference's solved
  // pose so multi-body chains compose.
  let progress = true;
  while (progress && pending.length > 0) {
    progress = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const c = pending[i];
      if (!c?.entityA || !c.entityB) continue;
      const ref = c.entityA;
      const dep = c.entityB;
      if (!placed.has(ref.node)) continue; // reference not solved yet — defer

      pending.splice(i, 1);
      progress = true;
      if (placed.has(dep.node)) continue; // dependent already anchored (fixed) — redundant

      const refPose = transforms.get(ref.node) ?? {
        position: [0, 0, 0],
        rotation: IDENTITY_ROTATION,
      };
      const extra = c.type === 'distance' ? (c.value ?? 0) : 0;
      transforms.set(dep.node, solvePlanePair(ref.entity, refPose.position, dep.entity, extra));
      placed.add(dep.node);
    }
  }

  // Anything still pending has a reference that never resolved (e.g. a cycle).
  for (const c of pending) unsupported.push(`${c.type}(unanchored)`);

  const dof = unsupported.reduce((sum, type) => {
    // Look up by exact key first, then by base type (before parenthesis)
    const baseDof = UNSUPPORTED_DOF[type] ?? UNSUPPORTED_DOF[type.split('(')[0] ?? ''] ?? 0;
    return sum + baseDof;
  }, 0);

  return { transforms, dof, converged: unsupported.length === 0, unsupported };
}
