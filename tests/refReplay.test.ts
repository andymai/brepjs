/**
 * Lineage refs as a parametric-replay consumer. Demonstrates the end-to-end
 * payoff of the trilogy: name a feature on one build, change an upstream
 * parameter, rebuild from scratch, and have a downstream op re-target the SAME
 * feature — the thing topological naming exists to do. Gated to the OCCT family.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import {
  box,
  cylinder,
  getFaces,
  getHashCode,
  isEdge,
  isFace,
  measureVolume,
  unwrap,
  type Edge,
  type Face,
} from '@/index.js';
import { sharedEdges, verticesOfEdge } from '@/topology/adjacencyFns.js';
import { vertexPosition } from '@/topology/topologyQueryFns.js';
import { faceGeomType } from '@/topology/faceFns.js';
import { filletWithEvolution } from '@/topology/evolutionFns.js';
import {
  assignRoles,
  createEdgeRef,
  createRef,
  isEdgeRef,
  isFaceRef,
  isLineageRef,
  isVertexRef,
  resolveRefIn,
  resolveRefParams,
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

/** Name "the top-front edge" on a box, with origin == the 'box' role scheme. */
function nameTopFrontEdge(b: ReturnType<typeof box>) {
  const roles = assignRoles(b, 'box');
  const table: RoleTable = new Map([['box', roles]]);
  const [edge] = sharedEdges(faceForRole(b, roles, 'box:top'), faceForRole(b, roles, 'box:front'));
  if (edge === undefined) throw new Error('no top∩front edge');
  const ref = createEdgeRef('box', edge, b, table);
  if (ref === undefined) throw new Error('could not capture edge ref');
  return ref;
}

describe.skipIf(!isOcctFamily)('lineage refs as a parametric-replay consumer', () => {
  it('a fillet follows its named edge across a dimension rebuild', () => {
    // Author time: name the top-front edge on a 20-cube.
    const edgeRef = nameTopFrontEdge(box(20, 20, 20));

    // Recompute: the box parameter grows to 20×20×40, rebuilt from scratch with
    // no maintained role table — exactly a parametric edit.
    const rebuilt = box(20, 20, 40);
    const resolved = resolveRefIn(edgeRef, rebuilt);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const edge = resolved.entity;
    expect(isEdge(edge)).toBe(true);
    if (!isEdge(edge)) return;

    // It re-targeted the top-front edge of the TALLER box (top is now z=40).
    const zs = verticesOfEdge(edge).map((v) => vertexPosition(v)[2]);
    expect(Math.max(...zs)).toBeCloseTo(40, 4);

    // The downstream fillet applies to the correct edge of the rebuilt model.
    const filleted = unwrap(filletWithEvolution(rebuilt, [edge], 2)).shape;
    const vBox = unwrap(measureVolume(rebuilt));
    const vFillet = unwrap(measureVolume(filleted));
    expect(vFillet).toBeLessThan(vBox); // the corner was shaved
    expect(vFillet).toBeGreaterThan(vBox * 0.99); // only the corner
  });

  it('resolveRefParams swaps scalar + array refs, leaving other params', () => {
    const edgeRef = nameTopFrontEdge(box(20, 20, 20));
    const rebuilt = box(20, 20, 40);

    // `edges` is an ARRAY (the fillet/chamfer multi-edge case) — must recurse.
    const resolved = resolveRefParams({ edge: edgeRef, edges: [edgeRef], radius: 2 }, rebuilt);
    expect(resolved['radius']).toBe(2); // non-ref param untouched
    expect(isEdge(resolved['edge'] as Edge)).toBe(true); // scalar ref → live edge
    const edges = resolved['edges'] as Edge[];
    expect(edges.every((e) => isEdge(e))).toBe(true); // array of refs → live edges
  });

  it('type guards discriminate the four ref kinds', () => {
    const edgeRef = nameTopFrontEdge(box(20, 20, 20));
    expect(isEdgeRef(edgeRef)).toBe(true);
    expect(isVertexRef(edgeRef)).toBe(false);
    expect(isFaceRef(edgeRef)).toBe(false);
    expect(isLineageRef(edgeRef)).toBe(true);
    expect(isLineageRef({ radius: 2 })).toBe(false);
  });

  it('a face ref follows a cylinder across a radius rebuild (semantic roles)', () => {
    // Name the lateral wall on an r=5 cylinder — only possible now that
    // assignRoles names cylinders semantically, not positionally.
    const c1 = cylinder(5, 10);
    const roles1 = assignRoles(c1, 'cylinder');
    const lateralHashes = roles1.get('cylinder:lateral') ?? [];
    const lateral = getFaces(c1).find((f) => lateralHashes.includes(getHashCode(f)));
    if (lateral === undefined) throw new Error('no lateral face');
    const ref = createRef('cylinder', 'cylinder:lateral', lateral);

    // Rebuild with r=8: the ref re-resolves to the new cylinder's lateral wall.
    const resolved = resolveRefIn(ref, cylinder(8, 10));
    expect(resolved.ok).toBe(true);
    if (!resolved.ok || !isFace(resolved.entity)) return;
    expect(faceGeomType(resolved.entity)).toBe('CYLINDRE');
  });
});
