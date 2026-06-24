/**
 * Edit-after-reference harness for *edge* references (lineage by adjacent
 * face-roles). An edge is identified by the roles of the two faces it bounds, so
 * it resolves through the (split-aware) face role table + `sharedEdges` even
 * after an edit re-hashes the edge — the lineage approach to topological naming.
 *
 * Gated to the OCCT family (faithful B-rep face/edge evolution).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import {
  box,
  translate,
  getFaces,
  getHashCode,
  unwrap,
  measureLength,
  type Face,
} from '@/index.js';
import { fuseWithEvolution } from '@/topology/evolutionFns.js';
import { sharedEdges } from '@/topology/adjacencyFns.js';
import {
  assignRoles,
  updateRoles,
  createEdgeRef,
  resolveEdgeRef,
  type RoleTable,
} from '@/topology/shapeRef/index.js';

const isOcctFamily = currentKernelId === 'occt' || currentKernelId === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

function faceForRole(
  shape: ReturnType<typeof box>,
  roles: Map<string, number[]>,
  role: string
): Face {
  const hashes = roles.get(role) ?? [];
  const f = getFaces(shape).find((face) => hashes.includes(getHashCode(face)));
  if (f === undefined) throw new Error(`no face for role ${role}`);
  return f;
}

describe.skipIf(!isOcctFamily)('shapeRef edge references (lineage by adjacent faces)', () => {
  it('captures an edge by its two face-roles and resolves it (round trip)', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);

    const top = faceForRole(b, roles, 'box:top');
    const front = faceForRole(b, roles, 'box:front');
    const [edge] = sharedEdges(top, front);
    expect(edge).toBeDefined();
    if (edge === undefined) return;

    const ref = createEdgeRef('s0', edge, b, table);
    expect(ref).toBeDefined();
    if (ref === undefined) return;
    expect([...ref.faceRoles].sort()).toEqual(['box:front', 'box:top']);

    const resolved = resolveEdgeRef(ref, table, b);
    expect('edge' in resolved).toBe(true);
    if ('edge' in resolved) {
      expect(resolved.confidence).toBe('exact');
      expect(getHashCode(resolved.edge)).toBe(getHashCode(edge));
    }
  });

  it('an edge reference survives an edit via its face lineage', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);

    const top = faceForRole(b, roles, 'box:top');
    const front = faceForRole(b, roles, 'box:front');
    const [edge] = sharedEdges(top, front);
    if (edge === undefined) throw new Error('no top∩front edge');
    const ref = createEdgeRef('s0', edge, b, table);
    if (ref === undefined) throw new Error('could not capture edge ref');

    // Edit: fuse a block onto the top interior. This re-hashes box:top and its
    // edges, but leaves the top∩front edge (along y=0) geometrically intact.
    const { shape: fused, evolution } = unwrap(
      fuseWithEvolution(b, translate(box(6, 6, 6), [7, 7, 20]))
    );
    const updated = updateRoles(table, 's0', evolution);

    const resolved = resolveEdgeRef(ref, updated, fused);
    // Resolves via lineage (top∩front) even though the edge's hash churned.
    expect('edge' in resolved).toBe(true);
    if ('edge' in resolved) {
      expect(unwrap(measureLength(resolved.edge))).toBeCloseTo(20, 0);
    }
  });

  it('returns broken when a bounding face role no longer resolves', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);
    const top = faceForRole(b, roles, 'box:top');
    const front = faceForRole(b, roles, 'box:front');
    const [edge] = sharedEdges(top, front);
    if (edge === undefined) throw new Error('no top∩front edge');
    const ref = createEdgeRef('s0', edge, b, table);
    if (ref === undefined) throw new Error('could not capture edge ref');

    // An empty table → neither face role resolves → the edge can't be located.
    const resolved = resolveEdgeRef(ref, new Map(), b);
    expect('reason' in resolved).toBe(true);
  });
});
