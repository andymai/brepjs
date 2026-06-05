/**
 * INVARIANTS: the real guard (ADR-0013 §11 — "the real guard" is a runtime
 * invariant test, not a contour-algorithm promise).
 *
 * Every voxel op output is consumed as a mesh, so the topological contract
 * matters more than any single measurement. What Surface Nets v1 actually
 * guarantees, across all ops and resolutions:
 *
 *   - CLOSED: no boundary (hole) edges — every edge shared by >= 2 triangles.
 *   - in-range indices, well-formed normals/uvs/faceGroups.
 *
 * What it does NOT guarantee (DOCUMENTED DIVERGENCE, ADR-0013 §6): strict
 * 2-manifoldness and degenerate-free triangles. Surface Nets emits some
 * non-manifold edges + sliver triangles except on grid-aligned geometry; the
 * manifold dual-contouring `Contourer` is the eventual fix. We bound the bad
 * fraction as a regression guard rather than asserting it is zero.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { box, translate, makeBaseBox } from '@/index.js';
import { repairMesh, offsetMesh, shellMesh, voxelBoolean } from '@/voxel/index.js';
import { latticeInfillShape } from '@/lattice/index.js';
import { unwrap } from '@/core/result.js';
import type { KernelMeshResult } from '@/kernel/types.js';
import { RUN_VOXEL_PARITY, setupVoxelParity, meshInputOf, meshTopology, VOXEL } from './helpers.js';

const opts = { resolution: VOXEL.resolution, padding: VOXEL.padding };

// One output per implemented voxel op. Names are static (known at collection);
// the ops themselves run in beforeAll, after the engine + kernel are ready.
const OP_NAMES = [
  'repair',
  'offset(+)',
  'offset(-)',
  'shell',
  'boolean(union)',
  'boolean(difference)',
  'lattice',
] as const;

const outs = new Map<string, KernelMeshResult>();

beforeAll(async () => {
  await setupVoxelParity();
  if (!RUN_VOXEL_PARITY) return;
  const cube = meshInputOf(box(10, 10, 10));
  const cubeB = meshInputOf(translate(box(10, 10, 10), [5, 0, 0]));
  outs.set('repair', unwrap(repairMesh(cube, opts)));
  outs.set('offset(+)', unwrap(offsetMesh(cube, 0.6, opts)));
  outs.set('offset(-)', unwrap(offsetMesh(cube, -0.6, opts)));
  outs.set('shell', unwrap(shellMesh(cube, 0.8, opts)));
  outs.set('boolean(union)', unwrap(voxelBoolean(cube, cubeB, 'union', opts)));
  outs.set('boolean(difference)', unwrap(voxelBoolean(cube, cubeB, 'difference', opts)));
  outs.set(
    'lattice',
    unwrap(latticeInfillShape(makeBaseBox(10, 10, 10), { type: 'gyroid', period: 3, thickness: 1 }))
  );
}, 90000);

describe.skipIf(!RUN_VOXEL_PARITY)(
  'INVARIANT: every voxel op output is a closed, well-formed mesh',
  () => {
    for (const name of OP_NAMES) {
      describe(name, () => {
        it('is non-empty with multiple-of-3 buffers', () => {
          const out = outs.get(name);
          expect(out).toBeDefined();
          if (!out) return;
          expect(out.vertices.length).toBeGreaterThan(0);
          expect(out.triangles.length).toBeGreaterThan(0);
          expect(out.vertices.length % 3).toBe(0);
          expect(out.triangles.length % 3).toBe(0);
        });

        it('has all triangle indices in range', () => {
          const out = outs.get(name);
          if (!out) return;
          expect(meshTopology(out).outOfRangeIndices).toBe(0);
        });

        it('is CLOSED — no boundary/hole edges', () => {
          const out = outs.get(name);
          if (!out) return;
          expect(meshTopology(out).boundaryEdges).toBe(0);
        });

        it('has well-formed normals, uvs, and a single face group', () => {
          const out = outs.get(name);
          if (!out) return;
          const vertexCount = out.vertices.length / 3;
          expect(out.normals.length).toBe(out.vertices.length);
          expect(out.uvs.length).toBe(vertexCount * 2);
          expect(out.faceGroups).toHaveLength(1);
          expect(out.faceGroups[0]?.count).toBe(out.triangles.length / 3);
        });

        // DOCUMENTED DIVERGENCE: not a 2-manifold guarantee — a regression bound.
        // Degenerate triangles and non-manifold edges are different units, so
        // bound each independently (both normalized by triangle count) rather
        // than summing them.
        it('keeps degenerate triangles + non-manifold edges within the documented band', () => {
          const out = outs.get(name);
          if (!out) return;
          const top = meshTopology(out);
          expect(top.degenerateTriangles / top.triangleCount).toBeLessThan(VOXEL.badTriFraction);
          expect(top.nonManifoldEdges / top.triangleCount).toBeLessThan(VOXEL.badTriFraction);
        });
      });
    }
  }
);
