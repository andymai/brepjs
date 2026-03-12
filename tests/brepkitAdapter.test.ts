/**
 * BrepkitAdapter unit tests — validates adapter logic with a mock BrepKernel.
 *
 * These tests verify:
 * - Handle wrapping/unwrapping
 * - Method delegation to the underlying kernel
 * - Matrix computation for transforms
 * - Mesh assembly with per-face groups
 * - Error handling for unimplemented methods
 *
 * The mock kernel simulates brepkit's WASM API without requiring actual WASM.
 */

import { describe, expect, it, vi } from 'vitest';
import { BrepkitAdapter, type BrepkitHandle } from '../src/kernel/brepkitAdapter.js';
import { registerKernel, getKernel, withKernel } from '../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Mock BrepKernel
// ---------------------------------------------------------------------------

function createMockBrepKernel() {
  let nextId = 0;
  const allocId = () => nextId++;

  return {
    // Primitives
    makeBox: vi.fn((_w: number, _h: number, _d: number) => allocId()),
    makeCylinder: vi.fn((_r: number, _h: number) => allocId()),
    makeSphere: vi.fn((_r: number, _seg: number) => allocId()),
    makeCone: vi.fn((_br: number, _tr: number, _h: number) => allocId()),
    makeTorus: vi.fn((_major: number, _minor: number, _seg: number) => allocId()),

    // Booleans
    fuse: vi.fn((_a: number, _b: number) => allocId()),
    cut: vi.fn((_a: number, _b: number) => allocId()),
    intersect: vi.fn((_a: number, _b: number) => allocId()),
    section: vi.fn(() => [allocId()]),

    // Operations
    extrude: vi.fn(() => allocId()),
    revolve: vi.fn(() => allocId()),
    loft: vi.fn(() => allocId()),
    fillet: vi.fn(() => allocId()),
    filletVariable: vi.fn(() => allocId()),
    chamfer: vi.fn(() => allocId()),
    shell: vi.fn(() => allocId()),

    // Transform
    copySolid: vi.fn((_id: number) => allocId()),
    transformSolid: vi.fn(),
    mirror: vi.fn(() => allocId()),

    // Tessellation
    tessellateFace: vi.fn((_face: number, _defl: number) => ({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    })),
    tessellateSolid: vi.fn(() => ({
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      indices: [0, 1, 2],
    })),
    tessellateSolidGrouped: vi.fn((_solid: number, _defl: number) =>
      JSON.stringify({
        positions: [
          0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0, 3, 0, 0, 3, 1, 0, 2, 1, 0,
        ],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
        indices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
        faceOffsets: [0, 3, 6, 9],
      })
    ),

    // Topology
    getSolidFaces: vi.fn((_id: number) => [100, 101, 102]),
    getSolidEdges: vi.fn((_id: number) => [200, 201]),
    getSolidVertices: vi.fn((_id: number) => [300, 301, 302, 303]),
    getEdgeVertices: vi.fn(() => [0, 0, 0, 1, 1, 1]),
    getVertexPosition: vi.fn((id: number) => [id * 0.1, id * 0.2, id * 0.3]),
    getFaceNormal: vi.fn(() => [0, 0, 1]),
    getEntityCounts: vi.fn(() => [6, 12, 8]),

    // Measurement
    boundingBox: vi.fn(() => [-1, -1, -1, 1, 1, 1]),
    volume: vi.fn(() => 8.0),
    surfaceArea: vi.fn(() => 24.0),
    faceArea: vi.fn(() => 4.0),
    centerOfMass: vi.fn(() => [0, 0, 0]),
    edgeLength: vi.fn(() => 2.0),
    facePerimeter: vi.fn(() => 8.0),

    // Distance
    solidToSolidDistance: vi.fn(() => 5.0),
    pointToSolidDistance: vi.fn(() => [3.0, 1.0, 2.0, 3.0]),

    // Classification
    classifyPoint: vi.fn(() => 'inside'),
    validateSolid: vi.fn(() => 0),

    // I/O
    exportStep: vi.fn(() => new TextEncoder().encode('ISO-10303;')),
    importStep: vi.fn(() => [allocId()]),
    exportStl: vi.fn(() => new Uint8Array([83, 84, 76])),
    importStl: vi.fn(() => allocId()),
    exportIges: vi.fn(() => new TextEncoder().encode('IGES;')),
    importIges: vi.fn(() => [allocId()]),

    // Sew
    sewFaces: vi.fn(() => allocId()),

    // Split
    split: vi.fn(() => [allocId(), allocId()]),

    // Pattern (returns compound id)
    linearPattern: vi.fn(() => allocId()),

    // Shape construction (Phase 2)
    makeVertex: vi.fn((_x: number, _y: number, _z: number) => allocId()),
    makeLineEdge: vi.fn(() => allocId()),
    makeNurbsEdge: vi.fn(() => allocId()),
    makeWire: vi.fn((_edges: number[], _closed: boolean) => allocId()),
    makeFaceFromWire: vi.fn((_wire: number) => allocId()),
    solidFromShell: vi.fn((_shell: number) => allocId()),
    makeCompound: vi.fn((_solids: number[]) => allocId()),

    // Geometry queries (Phase 2)
    getSurfaceType: vi.fn(() => 'plane'),
    getEdgeCurveType: vi.fn(() => 'line'),
    getEdgeCurveParameters: vi.fn(() => [0.0, 2.0]),
    evaluateEdgeCurve: vi.fn(() => [0.5, 0.0, 0.0]),
    evaluateEdgeCurveD1: vi.fn(() => [0.5, 0.0, 0.0, 1.0, 0.0, 0.0]),
    evaluateSurfaceNormal: vi.fn(() => [0.0, 0.0, 1.0]),
    evaluateSurface: vi.fn(() => [1.0, 2.0, 3.0]),
    getFaceEdges: vi.fn(() => [200, 201, 202, 203]),
    getFaceVertices: vi.fn(() => [300, 301, 302, 303]),
    getFaceOuterWire: vi.fn(() => 400),
    healSolid: vi.fn(() => 0),

    // Phase 12-14 bindings
    getSurfaceDomain: vi.fn(() => [0.0, 1.0, 0.0, 1.0]),
    projectPointOnSurface: vi.fn(() => [0.5, 0.5, 1.0, 2.0, 3.0, 0.1]),
    addHolesToFace: vi.fn(() => allocId()),
    interpolatePoints: vi.fn(() => allocId()),
    sweepAlongEdges: vi.fn(() => allocId()),
    convexHull: vi.fn(() => allocId()),
    offsetSolid: vi.fn(() => allocId()),
    getEdgeNurbsData: vi.fn(() => null),
    tessellateEdge: vi.fn((_edge: number, numPoints: number) => {
      // Return numPoints evenly spaced along X axis
      const pts: number[] = [];
      for (let i = 0; i < numPoints; i++) {
        pts.push(i / (numPoints - 1), 0, 0);
      }
      return pts;
    }),
    isEdgeForwardInWire: vi.fn(() => true),

    // Promoted-to-required methods (brepkit-wasm 0.4.3)
    getCompoundSolids: vi.fn(() => []),
    getShellFaces: vi.fn(() => []),
    getWireEdges: vi.fn((_wire: number) => [200, 201]),
    getShapeOrientation: vi.fn(() => 'forward'),
    reverseShape: vi.fn((_id: number) => allocId()),
    getEdgeVertexHandles: vi.fn(() => new Uint32Array([300, 301])),
    repairSolid: vi.fn(() => 0),
    gridPattern: vi.fn(() => allocId()),
    loftSmooth: vi.fn(() => allocId()),
    sweepSmooth: vi.fn(() => allocId()),
    meshEdges: vi.fn((_solid: number, _deflection: number) => ({
      positions: [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
      offsets: [0, 6],
      edgeCount: 2,
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrepkitAdapter', () => {
  describe('handle system', () => {
    it('wraps solid handles with correct type', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 3, 4);

      expect(box).toHaveProperty('__brepkit', true);
      expect(box).toHaveProperty('type', 'solid');
      expect(typeof (box as BrepkitHandle).id).toBe('number');
    });

    it('passes dimensions to underlying kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      adapter.makeBox(10, 20, 30);

      expect(mock.makeBox).toHaveBeenCalledWith(10, 20, 30);
    });

    it('rejects non-brepkit shapes with clear error', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      expect(() => adapter.fuse({}, {})).toThrow('expected a BrepkitHandle');
    });

    it('rejects wrong shape type', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const faces = adapter.iterShapes(box, 'face');

      // Trying to fuse a face (not a solid) should fail
      expect(() => adapter.fuse(faces[0], box)).toThrow('requires a solid');
    });

    it('isNull returns true for non-handles', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      expect(adapter.isNull(null)).toBe(true);
      expect(adapter.isNull(undefined)).toBe(true);
      expect(adapter.isNull(42)).toBe(true);
      expect(adapter.isNull({})).toBe(true);
    });

    it('isNull returns false for valid handles', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      expect(adapter.isNull(box)).toBe(false);
    });
  });

  describe('primitives', () => {
    it('creates box at origin', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 3, 4);

      expect(mock.makeBox).toHaveBeenCalledWith(2, 3, 4);
      expect((box as BrepkitHandle).type).toBe('solid');
    });

    it('creates cylinder at origin', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      adapter.makeCylinder(5, 10);

      expect(mock.makeCylinder).toHaveBeenCalledWith(5, 10);
    });

    it('creates cylinder with offset center via transform', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      adapter.makeCylinder(5, 10, [1, 2, 3]);

      // Should have called copySolid + transformSolid for the translation
      expect(mock.makeCylinder).toHaveBeenCalledWith(5, 10);
      expect(mock.copySolid).toHaveBeenCalled();
      expect(mock.transformSolid).toHaveBeenCalled();
    });

    it('creates sphere with default segments', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      adapter.makeSphere(7);

      expect(mock.makeSphere).toHaveBeenCalledWith(7, 32); // DEFAULT_SEGMENTS
    });

    it('creates cone', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      adapter.makeCone(3, 1, 5);

      expect(mock.makeCone).toHaveBeenCalledWith(3, 1, 5);
    });

    it('creates torus with default segments', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      adapter.makeTorus(10, 3);

      expect(mock.makeTorus).toHaveBeenCalledWith(10, 3, 32);
    });

    it('makeBoxFromCorners translates to correct center', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      adapter.makeBoxFromCorners([1, 2, 3], [5, 6, 7]);

      expect(mock.makeBox).toHaveBeenCalledWith(4, 4, 4);
      // Should translate to midpoint (3, 4, 5)
      expect(mock.copySolid).toHaveBeenCalled();
      expect(mock.transformSolid).toHaveBeenCalled();
    });
  });

  describe('booleans', () => {
    it('fuse delegates to kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const a = adapter.makeBox(1, 1, 1);
      const b = adapter.makeBox(1, 1, 1);
      const result = adapter.fuse(a, b);

      expect(mock.fuse).toHaveBeenCalledWith((a as BrepkitHandle).id, (b as BrepkitHandle).id);
      expect((result as BrepkitHandle).type).toBe('solid');
    });

    it('cut delegates to kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const a = adapter.makeBox(2, 2, 2);
      const b = adapter.makeBox(1, 1, 1);
      adapter.cut(a, b);

      expect(mock.cut).toHaveBeenCalled();
    });

    it('intersect delegates to kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const a = adapter.makeBox(2, 2, 2);
      const b = adapter.makeBox(1, 1, 1);
      adapter.intersect(a, b);

      expect(mock.intersect).toHaveBeenCalled();
    });

    it('fuseAll chains multiple fuse calls', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const shapes = [adapter.makeBox(1, 1, 1), adapter.makeBox(1, 1, 1), adapter.makeBox(1, 1, 1)];
      adapter.fuseAll(shapes);

      // Should have called fuse twice (3 shapes → 2 fuse calls)
      expect(mock.fuse).toHaveBeenCalledTimes(2);
    });

    it('cutAll chains multiple cut calls', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const shape = adapter.makeBox(5, 5, 5);
      const tools = [adapter.makeBox(1, 1, 1), adapter.makeBox(1, 1, 1)];
      adapter.cutAll(shape, tools);

      expect(mock.cut).toHaveBeenCalledTimes(2);
    });
  });

  describe('transforms', () => {
    it('translate creates copy then transforms', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const translated = adapter.translate(box, 5, 0, 0);

      expect(mock.copySolid).toHaveBeenCalled();
      expect(mock.transformSolid).toHaveBeenCalled();
      expect((translated as BrepkitHandle).type).toBe('solid');
      // Verify the translation matrix
      const matrix = mock.transformSolid.mock.calls[0][1];
      expect(matrix[3]).toBe(5); // tx
      expect(matrix[7]).toBe(0); // ty
      expect(matrix[11]).toBe(0); // tz
    });

    it('rotate produces correct rotation matrix', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      adapter.rotate(box, 90, [0, 0, 1]);

      const matrix = mock.transformSolid.mock.calls[0][1];
      // 90° rotation around Z: cos(90)=0, sin(90)=1
      expect(matrix[0]).toBeCloseTo(0); // cos
      expect(matrix[1]).toBeCloseTo(-1); // -sin
      expect(matrix[4]).toBeCloseTo(1); // sin
      expect(matrix[5]).toBeCloseTo(0); // cos
    });

    it('scale produces correct scale matrix', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      adapter.scale(box, [0, 0, 0], 3);

      const matrix = mock.transformSolid.mock.calls[0][1];
      expect(matrix[0]).toBe(3);
      expect(matrix[5]).toBe(3);
      expect(matrix[10]).toBe(3);
    });

    it('mirror delegates to kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      adapter.mirror(box, [0, 0, 0], [1, 0, 0]);

      expect(mock.mirror).toHaveBeenCalledWith((box as BrepkitHandle).id, 0, 0, 0, 1, 0, 0);
    });
  });

  describe('meshing', () => {
    it('meshes a solid with per-face groups', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const result = adapter.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });

      // Mock grouped result: 3 faces, each with 1 triangle (3 indices)
      expect(result.faceGroups.length).toBe(3);
      expect(result.vertices).toBeInstanceOf(Float32Array);
      expect(result.normals).toBeInstanceOf(Float32Array);
      expect(result.triangles).toBeInstanceOf(Uint32Array);
      expect(result.uvs).toBeInstanceOf(Float32Array);

      // Grouped mock: 9 vertices × 3 coords = 27
      expect(result.vertices.length).toBe(27);
      // UVs stripped when includeUVs not set
      expect(result.uvs.length).toBe(0);
      // faceGroups count is index count (not triangle count)
      expect(result.faceGroups[0]?.count).toBe(3);
    });

    it('uses grouped tessellation as primary path', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      adapter.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });

      expect(mock.tessellateSolidGrouped).toHaveBeenCalled();
      expect(mock.tessellateFace).not.toHaveBeenCalled();
    });

    it('grouped tessellation faceHash matches face IDs from getSolidFaces', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const result = adapter.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });

      // Mock getSolidFaces returns [100, 101, 102]
      expect(result.faceGroups.map((g) => g.faceHash)).toEqual([100, 101, 102]);
    });

    it('falls back to per-face when grouped throws', () => {
      const mock = createMockBrepKernel();
      mock.tessellateSolidGrouped.mockImplementation(() => {
        throw new Error('grouped not supported');
      });
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const result = adapter.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });

      expect(mock.tessellateSolidGrouped).toHaveBeenCalled();
      expect(mock.tessellateFace).toHaveBeenCalled();
      // Still produces valid output via per-face fallback
      expect(result.faceGroups.length).toBe(3);
    });

    it('falls back when faceOffsets/faceIds counts diverge', () => {
      const mock = createMockBrepKernel();
      // Return 4 face groups but getSolidFaces returns 3 → mismatch
      mock.tessellateSolidGrouped.mockReturnValue(
        JSON.stringify({
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
          faceOffsets: [0, 3, 3, 3, 3],
        })
      );
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const result = adapter.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });

      // Should have fallen back to per-face
      expect(mock.tessellateFace).toHaveBeenCalled();
      expect(result.faceGroups.length).toBe(3);
    });

    it('skips degenerate faces with zero-count groups', () => {
      const mock = createMockBrepKernel();
      mock.tessellateSolidGrouped.mockReturnValue(
        JSON.stringify({
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
          indices: [0, 1, 2],
          // 3 faces but middle one has zero indices (degenerate)
          faceOffsets: [0, 3, 3, 3],
        })
      );
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const result = adapter.mesh(box, { tolerance: 0.1, angularTolerance: 0.5 });

      // Only first face has non-zero count
      expect(result.faceGroups.length).toBe(1);
      expect(result.faceGroups[0]?.faceHash).toBe(100);
    });

    it('meshEdges returns tessellated edge polylines', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const result = adapter.meshEdges(box, 0.1, 0.5);

      // Mock returns 2 edges, each tessellated with multiple points
      expect(result.edgeGroups.length).toBe(2);
      expect(result.lines.length).toBeGreaterThan(0);
    });
  });

  describe('topology', () => {
    it('iterShapes returns typed handles', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const faces = adapter.iterShapes(box, 'face');
      expect(faces.length).toBe(3); // mock returns 3 faces
      expect((faces[0] as BrepkitHandle).type).toBe('face');
      expect((faces[0] as BrepkitHandle).id).toBe(100);

      const edges = adapter.iterShapes(box, 'edge');
      expect(edges.length).toBe(2);
      expect((edges[0] as BrepkitHandle).type).toBe('edge');

      const verts = adapter.iterShapes(box, 'vertex');
      expect(verts.length).toBe(4);
      expect((verts[0] as BrepkitHandle).type).toBe('vertex');
    });

    it('shapeType returns correct type', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      expect(adapter.shapeType(box)).toBe('solid');
    });

    it('hashCode distributes across range', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const hash = adapter.hashCode(box, 1000);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(1000);
    });

    it('isSame compares handle identity', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const a = adapter.makeBox(1, 1, 1);
      const b = adapter.makeBox(1, 1, 1);

      expect(adapter.isSame(a, a)).toBe(true);
      expect(adapter.isSame(a, b)).toBe(false); // different IDs
    });

    it('vertexPosition delegates to kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const verts = adapter.iterShapes(box, 'vertex');

      const pos = adapter.vertexPosition(verts[0]);
      expect(pos).toEqual([300 * 0.1, 300 * 0.2, 300 * 0.3]);
    });
  });

  describe('measurement', () => {
    it('volume delegates to kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 2, 2);

      expect(adapter.volume(box)).toBe(8.0);
    });

    it('area for solid calls surfaceArea', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 2, 2);

      expect(adapter.area(box)).toBe(24.0);
      expect(mock.surfaceArea).toHaveBeenCalled();
    });

    it('area for face calls faceArea', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];

      expect(adapter.area(face)).toBe(4.0);
      expect(mock.faceArea).toHaveBeenCalled();
    });

    it('length for edge calls edgeLength', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const edge = adapter.iterShapes(box, 'edge')[0];

      expect(adapter.length(edge)).toBe(2.0);
    });

    it('boundingBox returns min/max', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 2, 2);

      const bb = adapter.boundingBox(box);
      expect(bb.min).toEqual([-1, -1, -1]);
      expect(bb.max).toEqual([1, 1, 1]);
    });

    it('centerOfMass returns coordinates', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 2, 2);

      expect(adapter.centerOfMass(box)).toEqual([0, 0, 0]);
    });
  });

  describe('I/O', () => {
    it('exportSTEP returns string', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const step = adapter.exportSTEP([box]);
      expect(typeof step).toBe('string');
      expect(step).toContain('ISO-10303');
    });

    it('importSTEP returns solid handles', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      const shapes = adapter.importSTEP('ISO-10303...');
      expect(shapes.length).toBeGreaterThan(0);
      expect((shapes[0] as BrepkitHandle).type).toBe('solid');
    });

    it('exportSTL binary returns ArrayBuffer', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const result = adapter.exportSTL(box, true);
      expect(result).toBeInstanceOf(ArrayBuffer);
    });

    it('importSTL returns solid handle', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      const shape = adapter.importSTL(new ArrayBuffer(10));
      expect((shape as BrepkitHandle).type).toBe('solid');
    });
  });

  describe('modification', () => {
    it('fillet delegates with uniform radius', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 2, 2);
      const edges = adapter.iterShapes(box, 'edge');
      adapter.fillet(box, edges, 0.5);

      expect(mock.fillet).toHaveBeenCalledWith(
        (box as BrepkitHandle).id,
        edges.map((e) => (e as BrepkitHandle).id),
        0.5
      );
    });

    it('chamfer delegates with uniform distance', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 2, 2);
      const edges = adapter.iterShapes(box, 'edge');
      adapter.chamfer(box, edges, 0.3);

      expect(mock.chamfer).toHaveBeenCalledWith(
        (box as BrepkitHandle).id,
        edges.map((e) => (e as BrepkitHandle).id),
        0.3
      );
    });

    it('shell delegates face handles', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(2, 2, 2);
      const faces = adapter.iterShapes(box, 'face');
      adapter.shell(box, [faces[0]], 0.2);

      expect(mock.shell).toHaveBeenCalledWith((box as BrepkitHandle).id, 0.2, [
        (faces[0] as BrepkitHandle).id,
      ]);
    });

    it('extrude delegates with direction and distance', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      adapter.extrude(face, [0, 0, 1], 5);

      expect(mock.extrude).toHaveBeenCalledWith((face as BrepkitHandle).id, 0, 0, 1, 5);
    });
  });

  describe('history tracking', () => {
    it('translateWithHistory returns 1:1 face mapping for transforms', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const result = adapter.translateWithHistory(box, 1, 0, 0, [10, 11, 12], 1000);

      expect(result.shape).toBeDefined();
      expect(result.evolution.modified).toBeInstanceOf(Map);
      // Transform: each input face maps to corresponding output face
      expect(result.evolution.modified.size).toBe(3); // 3 input hashes
      expect(result.evolution.deleted.size).toBe(0);
    });

    it('fuseWithHistory detects generated/deleted faces', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const a = adapter.makeBox(1, 1, 1);
      const b = adapter.makeBox(1, 1, 1);

      const result = adapter.fuseWithHistory(a, b, [10, 11], 1000);
      expect(result.shape).toBeDefined();
      expect(result.evolution.modified).toBeInstanceOf(Map);
      expect(result.evolution.generated).toBeInstanceOf(Map);
      expect(result.evolution.deleted).toBeInstanceOf(Set);
      // The mock returns faces [100, 101, 102], hashes are 100, 101, 102
      // Input hashes [10, 11] don't match → they're "deleted"
      // All output hashes are new → they're "generated"
      expect(result.evolution.deleted.size).toBe(2); // input hashes not in output
    });
  });

  describe('kernel registry', () => {
    it('can be registered and used via withKernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      registerKernel('brepkit-test', adapter);

      const result = withKernel('brepkit-test', () => {
        const k = getKernel();
        expect(k.kernelId).toBe('brepkit');
        return k.makeBox(1, 1, 1);
      });

      expect((result as BrepkitHandle).type).toBe('solid');
    });
  });

  describe('shape construction (Phase 2)', () => {
    it('makeVertex creates a vertex handle', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const v = adapter.makeVertex(1, 2, 3);

      expect((v as BrepkitHandle).type).toBe('vertex');
      expect(mock.makeVertex).toHaveBeenCalledWith(1, 2, 3);
    });

    it('makeLineEdge creates edge between two points', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const edge = adapter.makeLineEdge([0, 0, 0], [1, 0, 0]);

      expect((edge as BrepkitHandle).type).toBe('edge');
      expect(mock.makeLineEdge).toHaveBeenCalledWith(0, 0, 0, 1, 0, 0);
    });

    it('makeWire creates wire from edges', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const e1 = adapter.makeLineEdge([0, 0, 0], [1, 0, 0]);
      const e2 = adapter.makeLineEdge([1, 0, 0], [1, 1, 0]);
      const wire = adapter.makeWire([e1, e2]);

      expect((wire as BrepkitHandle).type).toBe('wire');
      expect(mock.makeWire).toHaveBeenCalled();
    });

    it('makeFace creates face from wire', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const e1 = adapter.makeLineEdge([0, 0, 0], [1, 0, 0]);
      const e2 = adapter.makeLineEdge([1, 0, 0], [1, 1, 0]);
      const e3 = adapter.makeLineEdge([1, 1, 0], [0, 0, 0]);
      const wire = adapter.makeWire([e1, e2, e3]);
      const face = adapter.makeFace(wire);

      expect((face as BrepkitHandle).type).toBe('face');
      expect(mock.makeFaceFromWire).toHaveBeenCalled();
    });

    it('makeCompound creates compound from solids', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const a = adapter.makeBox(1, 1, 1);
      const b = adapter.makeBox(2, 2, 2);
      const compound = adapter.makeCompound([a, b]);

      expect((compound as BrepkitHandle).type).toBe('compound');
      expect(mock.makeCompound).toHaveBeenCalled();
    });
  });

  describe('geometry queries (Phase 2)', () => {
    it('surfaceType returns correct type', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];

      expect(adapter.surfaceType(face)).toBe('plane');
      expect(mock.getSurfaceType).toHaveBeenCalled();
    });

    it('surfaceNormal evaluates at (u,v)', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];

      const normal = adapter.surfaceNormal(face, 0.5, 0.5);
      expect(normal).toEqual([0, 0, 1]);
      expect(mock.evaluateSurfaceNormal).toHaveBeenCalled();
    });

    it('pointOnSurface evaluates at (u,v)', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];

      const point = adapter.pointOnSurface(face, 0.5, 0.5);
      expect(point).toEqual([1, 2, 3]);
    });

    it('outerWire returns wire handle', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      const wire = adapter.outerWire(face);

      expect((wire as BrepkitHandle).type).toBe('wire');
    });

    it('curveType returns correct type', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const edge = adapter.iterShapes(box, 'edge')[0];

      expect(adapter.curveType(edge)).toBe('line');
    });

    it('curveParameters returns domain', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const edge = adapter.iterShapes(box, 'edge')[0];

      const params = adapter.curveParameters(edge);
      expect(params).toEqual([0.0, 2.0]);
    });

    it('curvePointAtParam evaluates point', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const edge = adapter.iterShapes(box, 'edge')[0];

      const point = adapter.curvePointAtParam(edge, 1.0);
      expect(point).toEqual([0.5, 0, 0]);
    });

    it('curveTangent returns point and tangent', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const edge = adapter.iterShapes(box, 'edge')[0];

      const result = adapter.curveTangent(edge, 1.0);
      expect(result.point).toEqual([0.5, 0, 0]);
      expect(result.tangent).toEqual([1, 0, 0]);
    });

    it('iterShapes face→edge returns edges', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      const edges = adapter.iterShapes(face, 'edge');

      expect(edges.length).toBe(4);
      expect((edges[0] as BrepkitHandle).type).toBe('edge');
    });

    it('iterShapes face→vertex returns vertices', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      const verts = adapter.iterShapes(face, 'vertex');

      expect(verts.length).toBe(4);
      expect((verts[0] as BrepkitHandle).type).toBe('vertex');
    });

    it('healSolid returns shape on success', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const healed = adapter.healSolid(box);
      expect(healed).toBe(box);
    });
  });

  describe('curve construction (Phase 3)', () => {
    it('makeCircleEdge creates NURBS circle', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const edge = adapter.makeCircleEdge([0, 0, 0], [0, 0, 1], 5);

      expect((edge as BrepkitHandle).type).toBe('edge');
      expect(mock.makeNurbsEdge).toHaveBeenCalled();
    });

    it('makeCircleArc creates partial arc', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const edge = adapter.makeCircleArc([0, 0, 0], [0, 0, 1], 5, 0, Math.PI);

      expect((edge as BrepkitHandle).type).toBe('edge');
    });

    it('makeBezierEdge creates NURBS from control points', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const edge = adapter.makeBezierEdge([
        [0, 0, 0],
        [1, 2, 0],
        [3, 0, 0],
      ]);

      expect((edge as BrepkitHandle).type).toBe('edge');
      expect(mock.makeNurbsEdge).toHaveBeenCalled();
      // Verify it's degree 2 (3 points - 1)
      const call = mock.makeNurbsEdge.mock.calls[0];
      expect(call[6]).toBe(2); // degree
    });

    it('makeBezierEdge rejects < 2 points', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      expect(() => adapter.makeBezierEdge([[0, 0, 0]])).toThrow('at least 2 points');
    });

    it('makeWireFromMixed creates wire from edges', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const e1 = adapter.makeLineEdge([0, 0, 0], [1, 0, 0]);
      const e2 = adapter.makeLineEdge([1, 0, 0], [1, 1, 0]);
      const wire = adapter.makeWireFromMixed([e1, e2]);

      expect((wire as BrepkitHandle).type).toBe('wire');
    });

    it('buildTriFace creates face from 3 points', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const face = adapter.buildTriFace([0, 0, 0], [1, 0, 0], [0, 1, 0]);

      expect(face).not.toBeNull();
      expect((face as BrepkitHandle).type).toBe('face');
    });

    it('buildTriFace returns null for degenerate triangle', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const face = adapter.buildTriFace([0, 0, 0], [1, 0, 0], [2, 0, 0]);

      expect(face).toBeNull();
    });

    it('interpolatePoints creates NURBS from 2 points', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const edge = adapter.interpolatePoints([
        [0, 0, 0],
        [5, 0, 0],
      ]);

      expect((edge as BrepkitHandle).type).toBe('edge');
      // 2 points → line edge
      expect(mock.makeLineEdge).toHaveBeenCalled();
    });

    it('interpolatePoints creates NURBS from 4+ points', () => {
      const mock = createMockBrepKernel();
      (mock as Record<string, unknown>).interpolatePoints = vi.fn(() => 99);
      const adapter = new BrepkitAdapter(mock);
      const edge = adapter.interpolatePoints([
        [0, 0, 0],
        [1, 1, 0],
        [2, 0, 0],
        [3, 1, 0],
      ]);

      expect((edge as BrepkitHandle).type).toBe('edge');
      expect((mock as Record<string, unknown>).interpolatePoints).toHaveBeenCalled();
    });
  });

  describe('production-quality upgrades (Phase 12-14)', () => {
    it('uvBounds queries actual surface domain', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      const bounds = adapter.uvBounds(face);

      expect(bounds).toEqual({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
      expect(mock.getSurfaceDomain).toHaveBeenCalled();
    });

    it('uvFromPoint returns UV coordinates via Newton projection', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      const uv = adapter.uvFromPoint(face, [1, 2, 3]);

      expect(uv).toEqual([0.5, 0.5]);
      expect(mock.projectPointOnSurface).toHaveBeenCalled();
    });

    it('projectPointOnFace returns closest 3D point', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      const point = adapter.projectPointOnFace(face, [5, 5, 5]);

      expect(point).toEqual([1, 2, 3]);
    });

    it('addHolesInFace creates face with inner wires', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const face = adapter.iterShapes(box, 'face')[0];
      const e1 = adapter.makeLineEdge([0.2, 0.2, 0], [0.4, 0.2, 0]);
      const e2 = adapter.makeLineEdge([0.4, 0.2, 0], [0.3, 0.4, 0]);
      const e3 = adapter.makeLineEdge([0.3, 0.4, 0], [0.2, 0.2, 0]);
      const hole = adapter.makeWire([e1, e2, e3]);
      const result = adapter.addHolesInFace(face, [hole]);

      expect((result as BrepkitHandle).type).toBe('face');
      expect(mock.addHolesToFace).toHaveBeenCalled();
    });

    it('offset delegates to WASM offsetSolid', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const result = adapter.offset(box, 0.5);

      expect((result as BrepkitHandle).type).toBe('solid');
      expect(mock.offsetSolid).toHaveBeenCalled();
    });

    it('hullFromPoints delegates to WASM convexHull', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const result = adapter.hullFromPoints(
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 0, z: 1 },
        ],
        0.01
      );

      expect((result as BrepkitHandle).type).toBe('solid');
      expect(mock.convexHull).toHaveBeenCalled();
    });
  });

  describe('native meshEdges (0.4.3)', () => {
    it('meshEdges delegates to native WASM meshEdges', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);
      const result = adapter.meshEdges(box, 0.1, 0.5);

      // Should call native meshEdges (not tessellateEdge)
      expect(mock.meshEdges).toHaveBeenCalled();
      expect(result.lines.length).toBeGreaterThan(0);
      expect(result.edgeGroups.length).toBe(2); // mock returns 2 edges
    });

    it('meshEdges passes tolerance to native method', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      adapter.meshEdges(box, 0.05, 0.5);

      // Should pass deflection to native meshEdges
      expect(mock.meshEdges).toHaveBeenCalledWith(expect.any(Number), 0.05);
    });
  });

  describe('implementation coverage', () => {
    it('has no commonly-used methods throwing NotImplementedError', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      // Core operations should all work without throwing NotImplementedError
      const box = adapter.makeBox(1, 1, 1);
      expect(adapter.shapeType(box)).toBe('solid');
      expect(adapter.isNull(box)).toBe(false);
      expect(adapter.volume(box)).toBe(8.0);
      expect(adapter.kernelId).toBe('brepkit');
    });
  });

  describe('dispose', () => {
    it('is a no-op (arena-based memory)', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      // Should not throw
      adapter.dispose({ delete: () => {} });
    });
  });

  describe('validation', () => {
    it('isValid returns true for valid solid', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      expect(adapter.isValid(box)).toBe(true);
      expect(mock.validateSolid).toHaveBeenCalled();
    });

    it('isValid returns false for non-handle', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      expect(adapter.isValid(null)).toBe(false);
      expect(adapter.isValid({})).toBe(false);
    });
  });

  describe('distance', () => {
    it('solid-to-solid distance delegates to kernel', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const a = adapter.makeBox(1, 1, 1);
      const b = adapter.makeBox(1, 1, 1);

      const result = adapter.distance(a, b);
      expect(result.value).toBe(5.0);
      expect(mock.solidToSolidDistance).toHaveBeenCalled();
    });
  });

  describe('composed transforms', () => {
    it('composes translate + rotate into single matrix', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      const composed = adapter.composeTransform([
        { type: 'translate', x: 1, y: 0, z: 0 },
        { type: 'rotate', angle: 90, axis: [0, 0, 1] },
      ]);

      expect(composed.handle).toBeInstanceOf(Array);
      expect((composed.handle as number[]).length).toBe(16);

      // dispose is a no-op
      composed.dispose();
    });
  });

  describe('pattern generation', () => {
    it('linearPattern creates copies at correct offsets', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const pattern = adapter.linearPattern(box, [1, 0, 0], 5, 3);

      expect(pattern.length).toBe(3);
      expect(pattern[0]).toBe(box); // first is original
      // Others are copies
      expect(mock.copySolid).toHaveBeenCalledTimes(2);
    });

    it('circularPattern creates copies at correct angles', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);
      const box = adapter.makeBox(1, 1, 1);

      const pattern = adapter.circularPattern(box, [0, 0, 0], [0, 0, 1], 90, 4);

      expect(pattern.length).toBe(4);
      expect(pattern[0]).toBe(box);
      // 3 rotated copies
      expect(mock.copySolid).toHaveBeenCalledTimes(3);
    });
  });

  describe('fillet (variable radius)', () => {
    it('calls filletVariable with array-tuple radius', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      const solid = adapter.makeBox(10, 10, 10);
      const edges = (adapter.getEdges(solid) as BrepkitHandle[]).slice(0, 2);
      adapter.fillet(solid, edges, [1, 3]);

      expect(mock.filletVariable).toHaveBeenCalledOnce();
      const spec = JSON.parse(mock.filletVariable.mock.calls[0]?.[1] as string);
      expect(spec).toHaveLength(2);
      expect(spec[0]).toEqual(expect.objectContaining({ startRadius: 1, endRadius: 3 }));
      expect(spec[1]).toEqual(expect.objectContaining({ startRadius: 1, endRadius: 3 }));
    });

    it('calls filletVariable with per-edge function', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      const solid = adapter.makeBox(10, 10, 10);
      const edges = (adapter.getEdges(solid) as BrepkitHandle[]).slice(0, 1);
      adapter.fillet(solid, edges, () => [2, 4]);

      expect(mock.filletVariable).toHaveBeenCalledOnce();
      const spec = JSON.parse(mock.filletVariable.mock.calls[0]?.[1] as string);
      expect(spec).toHaveLength(1);
      expect(spec[0]).toEqual(expect.objectContaining({ startRadius: 2, endRadius: 4 }));
    });

    it('uses fast path for constant radius', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      const solid = adapter.makeBox(10, 10, 10);
      const edges = (adapter.getEdges(solid) as BrepkitHandle[]).slice(0, 1);
      adapter.fillet(solid, edges, 2);

      expect(mock.fillet).toHaveBeenCalledOnce();
      expect(mock.filletVariable).not.toHaveBeenCalled();
    });
  });

  describe('makeArc2dTangent', () => {
    it('produces a correct arc for a quarter-circle', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      // Quarter-circle: start=(1,0), tangent=(0,1), end=(0,1)
      // Expected center = (0,0), radius = 1
      const spy = vi.spyOn(adapter, 'makeArc2dThreePoints');
      adapter.makeArc2dTangent(1, 0, 0, 1, 0, 1);

      expect(spy).toHaveBeenCalledOnce();
      const [sx, sy, mx, my, ex, ey] = spy.mock.calls[0];
      expect(sx).toBeCloseTo(1, 10);
      expect(sy).toBeCloseTo(0, 10);
      expect(ex).toBeCloseTo(0, 10);
      expect(ey).toBeCloseTo(1, 10);
      // Midpoint should be on the unit circle at ~45°
      const midR = Math.sqrt(mx * mx + my * my);
      expect(midR).toBeCloseTo(1, 5);
    });

    it('falls back to a line for collinear tangent', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      // Start=(0,0), tangent=(1,0), end=(5,0) — tangent parallel to chord
      const spy = vi.spyOn(adapter, 'makeArc2dThreePoints');
      const result = adapter.makeArc2dTangent(0, 0, 1, 0, 5, 0);

      // Should NOT call makeArc2dThreePoints (degenerate case)
      expect(spy).not.toHaveBeenCalled();
      // Returns a line (from bk2d.makeLine2d)
      expect(result).toBeDefined();
    });

    it('handles CW arc direction', () => {
      const mock = createMockBrepKernel();
      const adapter = new BrepkitAdapter(mock);

      // Start=(1,0), tangent=(0,-1) → CW, end=(0,-1)
      const spy = vi.spyOn(adapter, 'makeArc2dThreePoints');
      adapter.makeArc2dTangent(1, 0, 0, -1, 0, -1);

      expect(spy).toHaveBeenCalledOnce();
      const [, , mx, my] = spy.mock.calls[0];
      // Midpoint should be in the positive-x, negative-y quadrant (CW arc)
      const midR = Math.sqrt(mx * mx + my * my);
      expect(midR).toBeCloseTo(1, 5);
      expect(mx).toBeGreaterThan(0);
      expect(my).toBeLessThan(0);
    });
  });
});
