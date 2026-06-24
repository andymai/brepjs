/**
 * Edit-after-reference harness for *vertex* references (lineage by the ≥3 faces
 * meeting at the corner). A vertex resolves through its face-roles' current
 * faces (verticesOfFace intersection), so it survives edits that re-hash the
 * vertex. Gated to the OCCT family (faithful B-rep evolution).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import { box, translate, getHashCode, unwrap, type Vec3 } from '@/index.js';
import { getVertices, vertexPosition } from '@/topology/topologyQueryFns.js';
import { fuseWithEvolution } from '@/topology/evolutionFns.js';
import {
  assignRoles,
  updateRoles,
  createVertexRef,
  resolveVertexRef,
  type RoleTable,
} from '@/topology/shapeRef/index.js';

const isOcctFamily = currentKernelId === 'occt' || currentKernelId === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** A box corner whose ≥3 faces all have roles (so createVertexRef succeeds). */
function namedCorner(shape: ReturnType<typeof box>, table: RoleTable) {
  return getVertices(shape).find((v) => createVertexRef('s0', v, shape, table) !== undefined);
}

describe.skipIf(!isOcctFamily)('shapeRef vertex references (lineage by ≥3 faces)', () => {
  it('captures a corner by its 3 face-roles and resolves it (round trip)', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);

    const corner = namedCorner(b, table);
    expect(corner).toBeDefined();
    if (corner === undefined) return;

    const ref = createVertexRef('s0', corner, b, table);
    expect(ref).toBeDefined();
    if (ref === undefined) return;
    expect(ref.faceRoles.length).toBe(3); // three box faces meet at a corner

    const resolved = resolveVertexRef(ref, table, b);
    expect('vertex' in resolved).toBe(true);
    if ('vertex' in resolved) {
      expect(resolved.confidence).toBe('exact');
      expect(getHashCode(resolved.vertex)).toBe(getHashCode(corner));
    }
  });

  it('a vertex reference survives an edit via its face lineage', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);

    const corner = namedCorner(b, table);
    if (corner === undefined) throw new Error('no named corner');
    const ref = createVertexRef('s0', corner, b, table);
    if (ref === undefined) throw new Error('could not capture vertex ref');
    const cornerPos = vertexPosition(corner);

    // Edit: fuse a block onto the top interior — re-hashes box:top and its
    // vertices, but the box's 8 outer corners stay put.
    const { shape: fused, evolution } = unwrap(
      fuseWithEvolution(b, translate(box(6, 6, 6), [7, 7, 20]))
    );
    const updated = updateRoles(table, 's0', evolution);

    const resolved = resolveVertexRef(ref, updated, fused);
    expect('vertex' in resolved).toBe(true);
    if ('vertex' in resolved) {
      // Same corner position, located via lineage despite the re-hash.
      expect(dist(vertexPosition(resolved.vertex), cornerPos)).toBeLessThan(0.01);
    }
  });

  it('returns broken when a bounding face role no longer resolves', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);
    const corner = namedCorner(b, table);
    if (corner === undefined) throw new Error('no named corner');
    const ref = createVertexRef('s0', corner, b, table);
    if (ref === undefined) throw new Error('could not capture vertex ref');

    const resolved = resolveVertexRef(ref, new Map(), b);
    expect('reason' in resolved).toBe(true);
  });
});
