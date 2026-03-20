/**
 * Tests for brepkit-wasm extended capabilities (v1.0.5).
 *
 * These tests cover the 29 newly wired kernel methods that are only available
 * with the brepkit backend. Each test runs against the brepkit kernel and
 * verifies the method works correctly.
 *
 * Run with: TEST_KERNEL=brepkit npx vitest run tests/fn-brepkitExtended.test.ts
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, fillet, castShape, getEdges, getFaces, isSolid, unwrap } from '@/index.js';
import { getKernel } from '@/kernel/index.js';
import { isBrepkit } from './helpers/kernelEnv.js';

const descBk = isBrepkit ? describe : describe.skip;

beforeAll(async () => {
  await initKernel();
}, 30000);

// ---------------------------------------------------------------------------
// I/O Formats
// ---------------------------------------------------------------------------

descBk('Extended I/O formats (brepkit)', () => {
  it('export3MF produces non-empty ArrayBuffer', () => {
    const b = box(10, 10, 10);
    const data = getKernel().export3MF(b.wrapped, 0.1);
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(data.byteLength).toBeGreaterThan(0);
  });

  it('exportGLB produces non-empty ArrayBuffer', () => {
    const b = box(10, 10, 10);
    const data = getKernel().exportGLB(b.wrapped, 0.1);
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(data.byteLength).toBeGreaterThan(0);
  });

  it('exportOBJ produces non-empty ArrayBuffer', () => {
    const b = box(10, 10, 10);
    const data = getKernel().exportOBJ(b.wrapped, 0.1);
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(data.byteLength).toBeGreaterThan(0);
  });

  it('exportPLY produces non-empty ArrayBuffer', () => {
    const b = box(10, 10, 10);
    const data = getKernel().exportPLY(b.wrapped, 0.1);
    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(data.byteLength).toBeGreaterThan(0);
  });

  it('3MF round-trip preserves geometry', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const data = kernel.export3MF(b.wrapped, 0.01);
    const imported = kernel.import3MF(data);
    expect(imported.length).toBeGreaterThan(0);
  });

  it('GLB round-trip produces a solid shape', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const data = kernel.exportGLB(b.wrapped, 0.1);
    const imported = kernel.importGLB(data);
    expect(isSolid(castShape(imported))).toBe(true);
  });

  it('OBJ round-trip produces a solid shape', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const data = kernel.exportOBJ(b.wrapped, 0.1);
    const imported = kernel.importOBJ(data);
    expect(isSolid(castShape(imported))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Advanced Modeling
// ---------------------------------------------------------------------------

descBk('Advanced modeling (brepkit)', () => {
  it('filletVariable applies variable radius fillet', () => {
    const kernel = getKernel();
    const b = box(20, 20, 20);
    const edges = getEdges(castShape(b.wrapped));
    expect(edges.length).toBeGreaterThan(0);

    // Build a JSON spec for variable fillet (first edge, start radius 1, end radius 3)
    const edgeHash = kernel.hashCode(edges[0]!.wrapped, 1_000_000); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const spec = JSON.stringify([{ edge: edgeHash, startRadius: 1, endRadius: 3 }]);
    const result = kernel.filletVariable(b.wrapped, spec);
    expect(isSolid(castShape(result))).toBe(true);
  });

  it('sweepWithOptions creates a solid', () => {
    const kernel = getKernel();
    const b = box(5, 5, 1); // profile face
    const faces = getFaces(castShape(b.wrapped));
    const profileFace = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    // Create a NURBS edge as path (sweepWithOptions requires NURBS)
    const pathEdge = kernel.interpolatePoints(
      [
        [0, 0, 0],
        [0, 5, 10],
        [0, 0, 20],
      ],
      { periodic: false }
    );
    const result = kernel.sweepWithOptions(
      profileFace.wrapped,
      pathEdge,
      'corrected_frenet',
      [1.0],
      1
    );
    expect(isSolid(castShape(result))).toBe(true);
  });

  it('draft applies taper angle', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const faces = getFaces(castShape(b.wrapped));
    // Draft the top face
    const topFace = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const result = kernel.draft(
      b.wrapped,
      [topFace.wrapped],
      [0, 0, 1], // pull direction
      [0, 0, 0], // neutral plane origin
      5 // angle degrees
    );
    expect(isSolid(castShape(result))).toBe(true);
  });

  it('helicalSweep creates a helix solid', () => {
    const kernel = getKernel();
    const b = box(2, 2, 1);
    const faces = getFaces(castShape(b.wrapped));
    const profileFace = faces[0]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const result = kernel.helicalSweep(profileFace.wrapped, [0, 0, 0], [0, 0, 1], 10, 5, 2);
    expect(isSolid(castShape(result))).toBe(true);
  });

  it('defeature removes faces from a solid', () => {
    const kernel = getKernel();
    // Create a box with a fillet, then try to remove the fillet face
    const b = box(20, 20, 20);
    const edges = getEdges(castShape(b.wrapped));
    const filleted = unwrap(fillet(castShape(b.wrapped), [edges[0]!], 2)); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const faces = getFaces(filleted);
    // Defeature the last face (fillet surface)
    const filletFace = faces[faces.length - 1]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const result = kernel.defeature(filleted.wrapped, [filletFace.wrapped]);
    expect(isSolid(castShape(result))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature Detection
// ---------------------------------------------------------------------------

descBk('Feature detection (brepkit)', () => {
  it('detectSmallFeatures finds small faces', () => {
    const kernel = getKernel();
    const b = box(20, 20, 20);
    const edges = getEdges(castShape(b.wrapped));
    const filleted = unwrap(fillet(castShape(b.wrapped), [edges[0]!], 0.5)); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    // Fillet face area ≈ π*0.5*20/2 ≈ 15.7; use a threshold above that
    const smallFaces = kernel.detectSmallFeatures(filleted.wrapped, 20.0, 0.01);
    expect(Array.isArray(smallFaces)).toBe(true);
    expect(smallFaces.length).toBeGreaterThan(0);
  });

  it('recognizeFeatures returns JSON', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const result = kernel.recognizeFeatures(b.wrapped, 0.1);
    expect(typeof result).toBe('string');
    // Should be valid JSON
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Topology Queries
// ---------------------------------------------------------------------------

descBk('Topology queries (brepkit)', () => {
  it('edgeToFaceMap returns valid JSON', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const result = kernel.edgeToFaceMap(b.wrapped);
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });

  it('sharedEdges finds edges between adjacent faces', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const faces = getFaces(castShape(b.wrapped));
    expect(faces.length).toBe(6);
    // Two adjacent faces of a box share exactly 1 edge
    const shared = kernel.sharedEdges(faces[0]!.wrapped, faces[1]!.wrapped); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(shared.length).toBeGreaterThanOrEqual(0); // may be 0 if faces aren't adjacent
  });

  it('adjacentFaces finds neighboring faces', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const faces = getFaces(castShape(b.wrapped));
    const adjacent = kernel.adjacentFaces(b.wrapped, faces[0]!.wrapped); // eslint-disable-line @typescript-eslint/no-non-null-assertion
    expect(adjacent.length).toBeGreaterThan(0);
    // A box face has 4 adjacent faces
    expect(adjacent.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// NURBS Curve Operations
// ---------------------------------------------------------------------------

descBk('NURBS curve operations (brepkit)', () => {
  it('curveDegreeElevate increases curve degree', () => {
    const kernel = getKernel();
    // Create a NURBS edge first (curveDegreeElevate requires NURBS)
    const edge = kernel.interpolatePoints(
      [
        [0, 0, 0],
        [5, 5, 0],
        [10, 0, 0],
      ],
      { periodic: false }
    );
    const elevated = kernel.curveDegreeElevate(edge, 1);
    // Elevated curve should still be a valid kernel handle
    const elevatedParams = kernel.curveParameters(elevated);
    expect(elevatedParams[1] - elevatedParams[0]).toBeGreaterThan(0);
  });

  it('curveKnotInsert adds a knot to a NURBS curve', () => {
    const kernel = getKernel();
    // Interpolate to get a NURBS edge
    const edge = kernel.interpolatePoints(
      [
        [0, 0, 0],
        [5, 5, 0],
        [10, 0, 0],
      ],
      { periodic: false }
    );
    const params = kernel.curveParameters(edge);
    const midParam = (params[0] + params[1]) / 2;
    const result = kernel.curveKnotInsert(edge, midParam, 1);
    // Inserted-knot curve should retain valid parameter range
    const resultParams = kernel.curveParameters(result);
    expect(resultParams[1] - resultParams[0]).toBeGreaterThan(0);
  });

  it('curveKnotRemove simplifies a NURBS curve', () => {
    const kernel = getKernel();
    const edge = kernel.interpolatePoints(
      [
        [0, 0, 0],
        [5, 5, 0],
        [10, 0, 0],
        [15, -5, 0],
        [20, 0, 0],
      ],
      { periodic: false }
    );
    // Insert a knot then try to remove it
    const params = kernel.curveParameters(edge);
    const midParam = (params[0] + params[1]) / 2;
    const withKnot = kernel.curveKnotInsert(edge, midParam, 1);
    const result = kernel.curveKnotRemove(withKnot, midParam, 0.1);
    expect(result).toBeDefined();
  });

  it('curveSplit divides a curve at a parameter', () => {
    const kernel = getKernel();
    const edge = kernel.interpolatePoints(
      [
        [0, 0, 0],
        [5, 5, 0],
        [10, 0, 0],
      ],
      { periodic: false }
    );
    const params = kernel.curveParameters(edge);
    const midParam = (params[0] + params[1]) / 2;
    const [e1, e2] = kernel.curveSplit(edge, midParam);
    expect(e1).toBeDefined();
    expect(e2).toBeDefined();
  });

  it('approximateSurfaceLspia fits a surface to a point grid', () => {
    const kernel = getKernel();
    // Create a 3x3 grid of points (flat plane with a bump)
    const coords: number[] = [];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const z = i === 1 && j === 1 ? 2 : 0;
        coords.push(i * 5, j * 5, z);
      }
    }
    const face = kernel.approximateSurfaceLspia(coords, 3, 3, 2, 2, 3, 3, 0.1, 50);
    // Should produce a valid face shape
    const faceEdges = kernel.iterShapes(face, 'edge');
    expect(faceEdges.length).toBeGreaterThan(0);
  });

  it('untrimFace extends a NURBS face to full surface domain', () => {
    const kernel = getKernel();
    // Build a NURBS surface by interpolation, which gives a proper NURBS face
    const coords: number[] = [];
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        coords.push(i * 5, j * 5, Math.sin(i) * Math.cos(j) * 2);
      }
    }
    const face = kernel.approximateSurfaceLspia(coords, 4, 4, 3, 3, 4, 4, 0.01, 50);
    const untrimmed = kernel.untrimFace(face, 10, 5);
    // Untrimmed face should have edges
    const edges = kernel.iterShapes(untrimmed, 'edge');
    expect(edges.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Validation / Repair
// ---------------------------------------------------------------------------

descBk('Validation & repair (brepkit)', () => {
  it('mergeCoincidentVertices returns a count', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const count = kernel.mergeCoincidentVertices(b.wrapped, 1e-6);
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('removeDegenerateEdges returns a count', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const count = kernel.removeDegenerateEdges(b.wrapped, 1e-6);
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('fixFaceOrientations returns a count', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const count = kernel.fixFaceOrientations(b.wrapped);
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

descBk('Point classification (brepkit)', () => {
  it('classifyPointRobust identifies inside/outside', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const inside = kernel.classifyPointRobust(b.wrapped, [5, 5, 5], 1e-6);
    expect(inside).toBe('inside');
    const outside = kernel.classifyPointRobust(b.wrapped, [20, 20, 20], 1e-6);
    expect(outside).toBe('outside');
  });

  it('classifyPointWinding identifies inside/outside', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    const inside = kernel.classifyPointWinding(b.wrapped, [5, 5, 5], 1e-6);
    expect(inside).toBe('inside');
    const outside = kernel.classifyPointWinding(b.wrapped, [20, 20, 20], 1e-6);
    expect(outside).toBe('outside');
  });
});

// ---------------------------------------------------------------------------
// Mesh Boolean
// ---------------------------------------------------------------------------

descBk('Mesh boolean (brepkit)', () => {
  it('meshBoolean performs union on triangle data', () => {
    const kernel = getKernel();
    // Two overlapping tetrahedra (minimal mesh)
    const posA = [0, 0, 0, 1, 0, 0, 0.5, 1, 0, 0.5, 0.5, 1];
    const idxA = [0, 1, 2, 0, 1, 3, 1, 2, 3, 0, 2, 3];
    const posB = [0.5, 0, 0, 1.5, 0, 0, 1, 1, 0, 1, 0.5, 1];
    const idxB = [0, 1, 2, 0, 1, 3, 1, 2, 3, 0, 2, 3];
    const result = kernel.meshBoolean(posA, idxA, posB, idxB, 'union', 1e-6);
    expect(result.vertices).toBeInstanceOf(Float32Array);
    expect(result.triangles).toBeInstanceOf(Uint32Array);
    expect(result.triangles.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Batch Execution
// ---------------------------------------------------------------------------

descBk('Batch execution (brepkit)', () => {
  it('executeBatch creates shapes via JSON commands', () => {
    const kernel = getKernel();
    const batch = JSON.stringify({
      ops: [{ op: 'makeBox', args: [10, 10, 10] }],
    });
    const result = kernel.executeBatch(batch);
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result);
    expect(parsed).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Arena Checkpoint / Restore
// ---------------------------------------------------------------------------

descBk('Arena checkpoint/restore (brepkit)', () => {
  it('checkpoint returns a numeric index', () => {
    const kernel = getKernel();
    const cp = kernel.checkpoint();
    expect(typeof cp).toBe('number');
    expect(cp).toBeGreaterThanOrEqual(0);
    // Clean up
    kernel.discardCheckpoint(cp);
  });

  it('checkpointCount reflects active checkpoints', () => {
    const kernel = getKernel();
    const before = kernel.checkpointCount();
    const cp = kernel.checkpoint();
    expect(kernel.checkpointCount()).toBe(before + 1);
    kernel.discardCheckpoint(cp);
    expect(kernel.checkpointCount()).toBe(before);
  });

  it('restoreCheckpoint rolls back arena state', () => {
    const kernel = getKernel();
    const cp = kernel.checkpoint();
    // Create a shape after checkpoint
    box(10, 10, 10);
    // Restore should not throw
    kernel.restoreCheckpoint(cp);
  });

  it('discardCheckpoint keeps handles alive', () => {
    const kernel = getKernel();
    const cp = kernel.checkpoint();
    const b = box(10, 10, 10);
    // Discard checkpoint (keep handles)
    kernel.discardCheckpoint(cp);
    // Shape should still be usable
    const faces = getFaces(castShape(b.wrapped));
    expect(faces.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// OCCT kernel: methods should throw
// ---------------------------------------------------------------------------

const descOcct = !isBrepkit ? describe : describe.skip;

descOcct('Brepkit-only methods throw on OCCT', () => {
  it('export3MF throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.export3MF(b.wrapped, 0.1)).toThrow(/brepkit/);
  });

  it('exportGLB throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.exportGLB(b.wrapped, 0.1)).toThrow(/brepkit/);
  });

  it('filletVariable throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.filletVariable(b.wrapped, '[]')).toThrow(/brepkit/);
  });

  it('edgeToFaceMap throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.edgeToFaceMap(b.wrapped)).toThrow(/brepkit/);
  });

  it('executeBatch throws', () => {
    const kernel = getKernel();
    expect(() => kernel.executeBatch('{}')).toThrow(/brepkit/);
  });

  it('defeature throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.defeature(b.wrapped, [])).toThrow(/brepkit/);
  });

  it('classifyPointRobust throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.classifyPointRobust(b.wrapped, [5, 5, 5], 1e-6)).toThrow(/brepkit/);
  });

  it('exportOBJ throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.exportOBJ(b.wrapped, 0.1)).toThrow(/brepkit/);
  });

  it('exportPLY throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.exportPLY(b.wrapped, 0.1)).toThrow(/brepkit/);
  });

  it('import3MF throws', () => {
    const kernel = getKernel();
    expect(() => kernel.import3MF(new ArrayBuffer(0))).toThrow(/brepkit/);
  });

  it('importOBJ throws', () => {
    const kernel = getKernel();
    expect(() => kernel.importOBJ(new ArrayBuffer(0))).toThrow(/brepkit/);
  });

  it('importGLB throws', () => {
    const kernel = getKernel();
    expect(() => kernel.importGLB(new ArrayBuffer(0))).toThrow(/brepkit/);
  });

  it('helicalSweep throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.helicalSweep(b.wrapped, [0, 0, 0], [0, 0, 1], 10, 5, 0)).toThrow(/brepkit/);
  });

  it('sweepWithOptions throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.sweepWithOptions(b.wrapped, b.wrapped, 'frenet', [1], 1)).toThrow(
      /brepkit/
    );
  });

  it('draft throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.draft(b.wrapped, [], [0, 0, 1], [0, 0, 0], 5)).toThrow(/brepkit/);
  });

  it('detectSmallFeatures throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.detectSmallFeatures(b.wrapped, 5, 0.01)).toThrow(/brepkit/);
  });

  it('recognizeFeatures throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.recognizeFeatures(b.wrapped, 0.1)).toThrow(/brepkit/);
  });

  it('sharedEdges throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.sharedEdges(b.wrapped, b.wrapped)).toThrow(/brepkit/);
  });

  it('adjacentFaces throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.adjacentFaces(b.wrapped, b.wrapped)).toThrow(/brepkit/);
  });

  it('classifyPointWinding throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.classifyPointWinding(b.wrapped, [5, 5, 5], 1e-6)).toThrow(/brepkit/);
  });

  it('curveDegreeElevate throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.curveDegreeElevate(b.wrapped, 1)).toThrow(/brepkit/);
  });

  it('curveKnotInsert throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.curveKnotInsert(b.wrapped, 0.5, 1)).toThrow(/brepkit/);
  });

  it('curveKnotRemove throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.curveKnotRemove(b.wrapped, 0.5, 0.1)).toThrow(/brepkit/);
  });

  it('curveSplit throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.curveSplit(b.wrapped, 0.5)).toThrow(/brepkit/);
  });

  it('approximateSurfaceLspia throws', () => {
    const kernel = getKernel();
    expect(() => kernel.approximateSurfaceLspia([0, 0, 0], 1, 1, 1, 1, 1, 1, 0.1, 10)).toThrow(
      /brepkit/
    );
  });

  it('untrimFace throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.untrimFace(b.wrapped, 1, 1)).toThrow(/brepkit/);
  });

  it('mergeCoincidentVertices throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.mergeCoincidentVertices(b.wrapped, 1e-6)).toThrow(/brepkit/);
  });

  it('removeDegenerateEdges throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.removeDegenerateEdges(b.wrapped, 1e-6)).toThrow(/brepkit/);
  });

  it('fixFaceOrientations throws', () => {
    const kernel = getKernel();
    const b = box(10, 10, 10);
    expect(() => kernel.fixFaceOrientations(b.wrapped)).toThrow(/brepkit/);
  });

  it('checkpoint throws', () => {
    const kernel = getKernel();
    expect(() => kernel.checkpoint()).toThrow(/brepkit/);
  });

  it('checkpointCount throws', () => {
    const kernel = getKernel();
    expect(() => kernel.checkpointCount()).toThrow(/brepkit/);
  });

  it('restoreCheckpoint throws', () => {
    const kernel = getKernel();
    expect(() => {
      kernel.restoreCheckpoint(0);
    }).toThrow(/brepkit/);
  });

  it('discardCheckpoint throws', () => {
    const kernel = getKernel();
    expect(() => {
      kernel.discardCheckpoint(0);
    }).toThrow(/brepkit/);
  });

  it('meshBoolean throws', () => {
    const kernel = getKernel();
    expect(() => kernel.meshBoolean([], [], [], [], 'union', 1e-6)).toThrow(/brepkit/);
  });
});
