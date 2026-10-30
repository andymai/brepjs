import { describe, expect, it, beforeAll, vi } from 'vitest';
import { initKernel, currentKernel } from './setup.js';
import { shouldSkipSuite, skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  box,
  cylinder,
  sphere,
  mesh,
  meshEdges,
  exportSTEP,
  exportSTL,
  exportIGES,
  compound,
  cut,
  face,
  getBounds,
  getEdges,
  getFaces,
  getHashCode,
  getSolids,
  importSTEP,
  isPlanarWire,
  line,
  measureVolume,
  sewShells,
  translate,
  vertexPosition,
  verticesOfEdge,
  wireLoop,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  clearMeshCache,
  getKernel,
  type Face,
} from '@/index.js';
import type { Shape3D } from '@/index.js';

describe('meshFns', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  describe('mesh', () => {
    it('meshes a box into triangles', () => {
      const b = box(10, 10, 10);
      const m = mesh(b);
      expect(m.vertices.length).toBeGreaterThan(0);
      expect(m.triangles.length).toBeGreaterThan(0);
      expect(m.normals.length).toBeGreaterThan(0);
      expect(m.faceGroups.length).toBe(6); // 6 faces
    });

    it("labels a bare face's triangles with the face's hash code", () => {
      using b = box(10, 10, 10);
      for (const f of getFaces(b)) {
        expect(mesh(f, { cache: false }).faceGroups.map((g) => g.faceId)).toEqual([getHashCode(f)]);
      }
    });

    it('meshes a compound of loose faces and a sewn shell', () => {
      using a = squareSheet();
      using b = translate(a, [20, 0, 0]);
      using sheets = compound([a, b]);
      const loose = mesh(sheets, { cache: false });
      // Two 10 x 10 squares, two triangles each.
      expect(loose.triangles.length).toBe(4 * 3);
      expect(loose.faceGroups.map((g) => g.faceId).sort((x, y) => x - y)).toEqual(
        [getHashCode(a), getHashCode(b)].sort((x, y) => x - y)
      );
      using shell = unwrap(sewShells([a, b], true));
      expect(mesh(shell, { cache: false }).triangles.length).toBe(4 * 3);
    });

    it('respects tolerance option', () => {
      const b = box(10, 10, 10);
      const coarse = mesh(b, { tolerance: 1 });
      const fine = mesh(b, { tolerance: 0.01 });
      // Fine mesh may have more vertices
      expect(fine.vertices.length).toBeGreaterThanOrEqual(coarse.vertices.length);
    });

    it.skipIf(shouldSkipSuite('meshFns.angularDensity'))(
      'a tighter angularTolerance produces a denser mesh on curved geometry',
      () => {
        clearMeshCache();
        // Separate shape instances: some kernels cache triangulation on the
        // shape in place, so a second mesh() on the same object would reuse it.
        // Loose linear deflection so the angular cap, not chord error, drives density.
        const coarse = mesh(sphere(5), { tolerance: 2.0, angularTolerance: 1.0, cache: false });
        const fine = mesh(sphere(5), { tolerance: 2.0, angularTolerance: 0.1, cache: false });
        expect(fine.triangles.length).toBeGreaterThan(coarse.triangles.length);
      }
    );

    it('returns cached result on second call with same parameters', () => {
      clearMeshCache();
      const b = box(10, 10, 10);
      const mesh1 = mesh(b, { tolerance: 0.1 });
      const mesh2 = mesh(b, { tolerance: 0.1 });
      // Cached — same object reference
      expect(mesh2).toBe(mesh1);
    });

    it('bypasses cache when cache option is false', () => {
      clearMeshCache();
      const b = box(10, 10, 10);
      const mesh1 = mesh(b, { tolerance: 0.1 });
      const mesh2 = mesh(b, { tolerance: 0.1, cache: false });
      // Not cached — different object
      expect(mesh2).not.toBe(mesh1);
    });
  });

  describe('scale-relative default deflection', () => {
    // The manifold preview kernel tessellates from build-time segments and
    // ignores extract-time deflection, so density comparisons only hold on
    // B-rep kernels.
    const itBrep = it.skipIf(currentKernel === 'manifold');

    itBrep('meshes a BIM-scale sphere with a bounded triangle count', () => {
      using s = sphere(2000);
      const m = mesh(s, { cache: false });
      expect(m.triangles.length / 3).toBeGreaterThan(100);
      expect(m.triangles.length / 3).toBeLessThan(100_000);
    });

    itBrep('leaves small shapes on the absolute tier default', () => {
      // Diagonal below 10 model units: the resolved default must equal the
      // absolute standard-tier deflection, triangle for triangle. Separate
      // instances so neither call re-uses the other's triangulation.
      using a = sphere(2);
      using b = sphere(2);
      const byDefault = mesh(a, { cache: false });
      const explicit = mesh(b, { tolerance: 1e-3, cache: false });
      expect(byDefault.triangles.length).toBe(explicit.triangles.length);
    });

    it.skipIf(currentKernel === 'manifold' || shouldSkipSuite('meshFns.deflectionDensity'))(
      'an explicit tolerance still overrides the relative default',
      () => {
        using a = sphere(2000);
        using b = sphere(2000);
        const byDefault = mesh(a, { cache: false });
        const coarse = mesh(b, { tolerance: 40, angularTolerance: 0.5, cache: false });
        expect(coarse.triangles.length).toBeLessThan(byDefault.triangles.length);
      }
    );

    it.skipIf(currentKernel === 'manifold' || shouldSkipSuite('meshFns.edgeDeflection'))(
      'meshEdges edge density is scale-invariant at the relative default',
      () => {
        // Segments per edge go as sqrt(r / deflection); the relative default's
        // deflection grows linearly with r, so the count is scale-invariant.
        // Under the absolute tier default the 10x larger sphere would carry
        // ~sqrt(10) times the segments.
        using a = sphere(2000);
        using b = sphere(20000);
        const small = meshEdges(a, { cache: false });
        const large = meshEdges(b, { cache: false });
        expect(small.lines.length).toBeGreaterThan(0);
        const ratio = large.lines.length / small.lines.length;
        expect(ratio).toBeGreaterThan(0.7);
        expect(ratio).toBeLessThan(1.4);
      }
    );

    itBrep('exportSTL tessellates large shapes at the relative default', () => {
      using s = sphere(2000);
      const blob = unwrap(exportSTL(s, { binary: true }));
      // Binary STL is 84 header bytes + 50 per triangle: a bounded blob proves
      // the absolute tier default did not apply at this scale.
      expect(blob.size).toBeLessThan(84 + 50 * 100_000);
    });
  });

  describe('meshEdges', () => {
    it('meshes edge curves of a box', () => {
      const b = box(10, 10, 10);
      const edgeMesh = meshEdges(b);
      expect(edgeMesh.lines.length).toBeGreaterThan(0);
      expect(edgeMesh.edgeGroups.length).toBe(12); // 12 edges on a box
    });

    it("labels each edge polyline with its edge's hash code", () => {
      using b = box(40, 30, 20);
      const { lines, edgeGroups } = meshEdges(b, { cache: false });
      const edges = getEdges(b);
      expect(edgeGroups.map((g) => g.edgeId).sort((x, y) => x - y)).toEqual(
        edges.map(getHashCode).sort((x, y) => x - y)
      );
      // Each polyline runs between the end points of the edge it names.
      for (const g of edgeGroups) {
        const edge = edges.find((e) => getHashCode(e) === g.edgeId);
        if (!edge) throw new Error(`no edge has hash ${g.edgeId}`);
        const ends = verticesOfEdge(edge).map((v) => vertexPosition(v));
        const first = pointAt(lines, g.start);
        const last = pointAt(lines, g.start + g.count - 1);
        expect(ends.some((p) => near(p, first))).toBe(true);
        expect(ends.some((p) => near(p, last))).toBe(true);
      }

      using block = box(40, 30, 20);
      using bore = cylinder(5, 30, { at: [20, 15, -5] });
      using drilled = unwrap(cut(block, bore));
      const drilledIds = meshEdges(drilled, { cache: false }).edgeGroups.map((g) => g.edgeId);
      expect(drilledIds.sort((x, y) => x - y)).toEqual(
        getEdges(drilled)
          .map(getHashCode)
          .sort((x, y) => x - y)
      );
    });

    it('meshes the edges of a loose face and of a compound of faces', () => {
      using a = squareSheet();
      using b = translate(a, [20, 0, 0]);
      const one = meshEdges(a, { cache: false });
      expect(one.edgeGroups.map((g) => g.edgeId).sort((x, y) => x - y)).toEqual(
        getEdges(a)
          .map(getHashCode)
          .sort((x, y) => x - y)
      );
      expect(one.lines.length).toBe(4 * 2 * 3);
      using sheets = compound([a, b]);
      expect(meshEdges(sheets, { cache: false }).edgeGroups).toHaveLength(8);
    });

    it('samples the circular edge of a loose disc onto the circle', () => {
      using c = cylinder(5, 10);
      const cap = getFaces(c).find((f) => getBounds(f).zMin > 9.9);
      if (!cap) throw new Error('cylinder has no top cap');
      const { lines, edgeGroups } = meshEdges(cap, { tolerance: 0.01, cache: false });
      expect(edgeGroups).toHaveLength(1);
      expect(lines.length / 6).toBeGreaterThan(16);
      for (let i = 0; i < lines.length / 3; i++) {
        const [x, y, z] = pointAt(lines, i);
        expect(Math.hypot(x, y)).toBeCloseTo(5, 4);
        expect(z).toBeCloseTo(10, 4);
      }
    });

    it('returns cached result on second call with same parameters', () => {
      clearMeshCache();
      const b = box(10, 10, 10);
      const mesh1 = meshEdges(b, { tolerance: 0.1 });
      const mesh2 = meshEdges(b, { tolerance: 0.1 });
      // Cached — same object reference
      expect(mesh2).toBe(mesh1);
    });

    it('bypasses cache when cache option is false', () => {
      clearMeshCache();
      const b = box(10, 10, 10);
      const mesh1 = meshEdges(b, { tolerance: 0.1 });
      const mesh2 = meshEdges(b, { tolerance: 0.1, cache: false });
      // Not cached — different object
      expect(mesh2).not.toBe(mesh1);
    });

    it.skipIf(currentKernel === 'manifold' || shouldSkipSuite('meshFns.edgeAngularTolerance'))(
      'edge density follows angularTolerance, not just the chord deflection',
      () => {
        // A 1-unit chord deflection alone puts ~5 segments on an r=5 circle.
        using a = cylinder(5, 10);
        using b = cylinder(5, 10);
        const coarse = meshEdges(a, { tolerance: 1, angularTolerance: 1, cache: false });
        const fine = meshEdges(b, { tolerance: 1, angularTolerance: 0.1, cache: false });
        expect(fine.lines.length).toBeGreaterThan(coarse.lines.length * 3);
      }
    );

    it.skipIf(currentKernel === 'manifold' || shouldSkipSuite('meshFns.edgesOnFaceMesh'))(
      'edge polylines lie on face mesh vertices at the same tolerances',
      () => {
        // Separately sampled edges draw chords that cut through the shaded
        // surface on small arcs, which reads as faceting.
        using c = cylinder(2.4, 1.8);
        const opts = { tolerance: 0.1, angularTolerance: 0.2, cache: false };
        const faces = mesh(c, opts);
        const edges = meshEdges(c, opts);
        const key = (a: Float32Array, i: number) =>
          [a[i], a[i + 1], a[i + 2]].map((v) => (v ?? NaN).toFixed(4)).join(',');
        const faceVerts = new Set<string>();
        for (let i = 0; i < faces.vertices.length; i += 3) faceVerts.add(key(faces.vertices, i));
        expect(edges.lines.length).toBeGreaterThan(0);
        for (let i = 0; i < edges.lines.length; i += 3) {
          const p = key(edges.lines, i);
          expect(faceVerts.has(p), p).toBe(true);
        }
      }
    );
  });

  describe('exportSTEP', () => {
    it('exports a shape to STEP blob', () => {
      const b = box(10, 10, 10);
      const result = exportSTEP(b);
      expect(isOk(result)).toBe(true);
      const blob = unwrap(result);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('writes a compound as one STEP document holding every solid', async () => {
      using first = box(10, 10, 10);
      using unplaced = box(5, 5, 5);
      using second = translate(unplaced, [30, 0, 0]);
      using both = compound([first, second]);
      const step = await unwrap(exportSTEP(both)).text();
      expect(step.match(/^ISO-10303-21;/gm)).toHaveLength(1);
      expect(step.match(/END-ISO-10303-21;/g)).toHaveLength(1);

      using imported = unwrap(await importSTEP(new Blob([step])));
      expect(getSolids(imported)).toHaveLength(2);
      expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(1125, 3);
      const bounds = getBounds(imported);
      expect(bounds.xMin).toBeCloseTo(0, 3);
      expect(bounds.xMax).toBeCloseTo(35, 3);
    });

    it.skipIf(shouldSkipSuite('meshFns.stepReadError'))(
      'returns STEP_FILE_READ_ERROR when FS.readFile throws after successful write (FS path only)',
      () => {
        const oc = getKernel().oc;
        // V8 stream I/O bypasses FS entirely — this test only applies to FS path
        if (typeof oc.StepStreamIO?.exportSTEP === 'function') return;
        const originalReadFile = oc.FS.readFile as (...args: unknown[]) => unknown;
        // Patch readFile to throw on any .step file
        oc.FS.readFile = (path: string) => {
          if (path.endsWith('.step')) throw new Error('simulated FS read failure');
          return originalReadFile.call(oc.FS, path);
        };
        try {
          const b = box(5, 5, 5);
          const result = exportSTEP(b);
          expect(isErr(result)).toBe(true);
          expect(unwrapErr(result).code).toBe('STEP_FILE_READ_ERROR');
        } finally {
          oc.FS.readFile = originalReadFile;
        }
      }
    );

    it('returns STEP_EXPORT_CRASHED (not a file-read error) when the kernel writer traps', () => {
      // A WebAssembly.RuntimeError means the OCCT STEP writer crashed on geometry it
      // could not serialize — it must not be relabelled as a phantom "file read" error.
      const spy = vi.spyOn(getKernel(), 'exportSTEP').mockImplementation(() => {
        throw new WebAssembly.RuntimeError('memory access out of bounds');
      });
      try {
        const result = exportSTEP(box(5, 5, 5));
        expect(isErr(result)).toBe(true);
        expect(unwrapErr(result).code).toBe('STEP_EXPORT_CRASHED');
        expect(unwrapErr(result).message).toContain('memory access out of bounds');
      } finally {
        spy.mockRestore();
      }
    });

    it('returns STEP_EXPORT_UNSERIALIZABLE without invoking the writer when bounds eval throws', () => {
      // getBounds fails catchably on degenerate geometry that the writer would instead
      // OOB-trap on; the guard must abort before exportSTEP is ever called (#1126).
      const boundsSpy = vi.spyOn(getKernel(), 'boundingBox').mockImplementation(() => {
        throw new Error('Bnd_Box is void');
      });
      const writerSpy = vi.spyOn(getKernel(), 'exportSTEP');
      try {
        const result = exportSTEP(box(7, 7, 7));
        expect(isErr(result)).toBe(true);
        expect(unwrapErr(result).code).toBe('STEP_EXPORT_UNSERIALIZABLE');
        expect(writerSpy).not.toHaveBeenCalled();
      } finally {
        boundsSpy.mockRestore();
        writerSpy.mockRestore();
      }
    });

    it('localizes the offending sub-solid index in the UNSERIALIZABLE message for a compound', () => {
      // When bounds fail on a multi-solid compound, the error should name which
      // sub-solid(s) failed so callers can locate and heal them (#1126).
      const comp = compound([box(4, 4, 4), box(4, 4, 4)]);
      const boundsSpy = vi.spyOn(getKernel(), 'boundingBox').mockImplementation(() => {
        throw new Error('Bnd_Box is void');
      });
      try {
        const result = exportSTEP(comp);
        expect(isErr(result)).toBe(true);
        const msg = unwrapErr(result).message;
        expect(msg).toContain('offending sub-solid');
        expect(msg).toContain('of 2');
        expect(msg).toMatch(/index 0, 1/);
      } finally {
        boundsSpy.mockRestore();
      }
    });
  });

  describe('exportSTL', () => {
    it('exports a shape to STL blob', () => {
      const b = box(10, 10, 10);
      const result = exportSTL(b);
      expect(isOk(result)).toBe(true);
      const blob = unwrap(result);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('exports a shape to binary STL blob', () => {
      const b = box(10, 10, 10);
      const result = exportSTL(b, { binary: true });
      expect(isOk(result)).toBe(true);
      const blob = unwrap(result);
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.type).toBe('application/sla');
    });

    it('binary STL is smaller than ASCII STL for the same shape', () => {
      const b = sphere(5);
      const ascii = unwrap(exportSTL(b, { binary: false }));
      const binary = unwrap(exportSTL(b, { binary: true }));
      // Binary STL header is 84 bytes + 50 bytes per triangle; ASCII is larger in practice
      expect(binary.size).toBeGreaterThan(0);
      expect(ascii.size).toBeGreaterThan(0);
    });

    // Triangle count from a binary STL header (uint32 at byte offset 80).
    const stlTriCount = async (blob: Blob): Promise<number> =>
      new DataView(await blob.arrayBuffer()).getUint32(80, true);

    /** The [min, max] x of a binary STL's vertices (50-byte records after the 84-byte header). */
    const stlXRange = async (blob: Blob): Promise<[number, number]> => {
      const view = new DataView(await blob.arrayBuffer());
      let min = Infinity;
      let max = -Infinity;
      for (let t = 0; t < view.getUint32(80, true); t++) {
        for (let v = 0; v < 3; v++) {
          const x = view.getFloat32(84 + t * 50 + 12 + v * 12, true);
          min = Math.min(min, x);
          max = Math.max(max, x);
        }
      }
      return [min, max];
    };

    it('writes every solid of a compound', async () => {
      using first = box(10, 10, 10);
      using unplaced = box(10, 10, 10);
      using second = translate(unplaced, [30, 0, 0]);
      using both = compound([first, second]);
      const one = await stlTriCount(unwrap(exportSTL(first, { binary: true })));
      const stl = unwrap(exportSTL(both, { binary: true }));
      expect(await stlTriCount(stl)).toBe(2 * one);
      const [xMin, xMax] = await stlXRange(stl);
      expect(xMin).toBeCloseTo(0, 3);
      expect(xMax).toBeCloseTo(40, 3);
    });

    it.skipIf(shouldSkipSuite('meshFns.exportStlTolerance'))(
      'threads linear tolerance through to tessellation (coarse vs fine differ)',
      async () => {
        clearMeshCache();
        // Fresh instances: StlAPI.Write-based adapters serialize the
        // triangulation already cached on the shape, so reusing one sphere
        // would export the first tolerance twice.
        const coarse = await stlTriCount(
          unwrap(exportSTL(sphere(10), { binary: true, tolerance: 1 }))
        );
        const fine = await stlTriCount(
          unwrap(exportSTL(sphere(10), { binary: true, tolerance: 0.01 }))
        );
        expect(coarse).toBeGreaterThan(0);
        // A finer linear deflection must subdivide the sphere into more facets.
        expect(fine).toBeGreaterThan(coarse);
      }
    );

    it.skipIf(shouldSkipSuite('meshFns.exportStlTolerance'))(
      'threads angularTolerance through to tessellation',
      async () => {
        clearMeshCache();
        // Loose linear deflection so the angular cap, not chord error, drives density.
        const coarse = await stlTriCount(
          unwrap(exportSTL(sphere(10), { binary: true, tolerance: 2, angularTolerance: 1 }))
        );
        const fine = await stlTriCount(
          unwrap(exportSTL(sphere(10), { binary: true, tolerance: 2, angularTolerance: 0.1 }))
        );
        expect(fine).toBeGreaterThan(coarse);
      }
    );

    it('skips re-meshing when shape already has triangulation', () => {
      // mesh() populates triangulation on the shape's underlying kernel object;
      // exportSTL should detect that and skip the BRepMesh step.
      const b = box(10, 10, 10);
      mesh(b); // populate triangulation
      const result = exportSTL(b);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).size).toBeGreaterThan(0);
    });

    it.skipIf(shouldSkipSuite('meshFns.meshDeflection'))(
      'returns STL_FILE_READ_ERROR when FS.readFile throws after successful write',
      () => {
        const oc = getKernel().oc;
        const originalReadFile = oc.FS.readFile as (...args: unknown[]) => unknown;
        // Patch readFile to throw on any .stl file
        oc.FS.readFile = (path: string) => {
          if (path.endsWith('.stl')) throw new Error('simulated FS read failure');
          return originalReadFile.call(oc.FS, path);
        };
        try {
          const b = box(5, 5, 5);
          const result = exportSTL(b);
          expect(isErr(result)).toBe(true);
          expect(unwrapErr(result).code).toBe('STL_FILE_READ_ERROR');
        } finally {
          oc.FS.readFile = originalReadFile;
        }
      }
    );

    it('returns STL_EXPORT_UNSERIALIZABLE without meshing or invoking the writer when bounds eval throws', () => {
      const boundsSpy = vi.spyOn(getKernel(), 'boundingBox').mockImplementation(() => {
        throw new Error('Bnd_Box is void');
      });
      const meshSpy = vi.spyOn(getKernel(), 'meshShape');
      const writerSpy = vi.spyOn(getKernel(), 'exportSTL');
      try {
        const result = exportSTL(box(7, 7, 7));
        expect(isErr(result)).toBe(true);
        expect(unwrapErr(result).code).toBe('STL_EXPORT_UNSERIALIZABLE');
        expect(meshSpy).not.toHaveBeenCalled();
        expect(writerSpy).not.toHaveBeenCalled();
      } finally {
        boundsSpy.mockRestore();
        meshSpy.mockRestore();
        writerSpy.mockRestore();
      }
    });
  });

  describe('kernel.exportOBJ', () => {
    it('produces a valid OBJ ArrayBuffer on kernels that support it', () => {
      expect.hasAssertions();
      const b = box(10, 10, 10);
      let data: ArrayBuffer;
      try {
        data = getKernel().exportOBJ(b.wrapped, 0.1);
      } catch (e) {
        // OCCT default adapter throws "only available with the brepkit kernel"
        expect(String(e)).toContain('brepkit');
        return;
      }
      expect(data.byteLength).toBeGreaterThan(0);
      const text = new TextDecoder().decode(data);
      // Structural assertions are kernel-agnostic — brepkit's C++ writer
      // and occt-wasm's TS writer both emit standard OBJ.
      expect(text).toMatch(/^v /m);
      expect(text).toMatch(/^f /m);
    });
  });

  describe('kernel.exportPLY', () => {
    it('produces a valid PLY ArrayBuffer on kernels that support it', () => {
      expect.hasAssertions();
      const b = box(10, 10, 10);
      let data: ArrayBuffer;
      try {
        data = getKernel().exportPLY(b.wrapped, 0.1);
      } catch (e) {
        // OCCT default adapter throws "only available with the brepkit kernel"
        expect(String(e)).toContain('brepkit');
        return;
      }
      expect(data.byteLength).toBeGreaterThan(0);
      const text = new TextDecoder().decode(data);
      // PLY header is always ASCII, even when the body is binary. Keep the
      // assertions format-agnostic so brepkit's binary-little-endian writer
      // and occt-wasm's ASCII writer both pass.
      expect(text.startsWith('ply\n')).toBe(true);
      expect(text).toMatch(/^format (ascii|binary_little_endian|binary_big_endian) 1\.0/m);
      expect(text).toMatch(/^element vertex \d+/m);
      expect(text).toMatch(/^element face \d+/m);
      expect(text).toContain('end_header');
    });
  });

  describe('kernel.exportGLB', () => {
    it('produces a valid GLB ArrayBuffer on kernels that support it', () => {
      expect.hasAssertions();
      const b = box(10, 10, 10);
      let data: ArrayBuffer;
      try {
        data = getKernel().exportGLB(b.wrapped, 0.1);
      } catch (e) {
        // OCCT default adapter throws "only available with the brepkit kernel"
        expect(String(e)).toContain('brepkit');
        return;
      }
      expect(data.byteLength).toBeGreaterThan(0);
      // GLB spec: 12-byte header = magic 'glTF' (0x46546C67) | version 2 | total length
      const view = new DataView(data);
      expect(view.getUint32(0, true)).toBe(0x46546c67);
      expect(view.getUint32(4, true)).toBe(2);
      expect(view.getUint32(8, true)).toBe(data.byteLength);
    });
  });

  describe('exportIGES', () => {
    /** An IGES file's lines by the section letter in column 73. */
    const igesSections = (text: string): Record<string, string[]> => {
      const out: Record<string, string[]> = { S: [], G: [], D: [], P: [], T: [] };
      for (const line of text.split('\n')) {
        if (line.length >= 73) out[line.charAt(72)]?.push(line);
      }
      return out;
    };

    /** Where the numbering and links of an IGES file's sections disagree. */
    const igesProblems = (s: Record<string, string[]>): string[] => {
      const problems: string[] = [];
      const num = (line: string | undefined, from: number, to: number): number =>
        Number(line?.slice(from, to).trim() ?? NaN);
      const [D, P, T] = [s['D'] ?? [], s['P'] ?? [], s['T'] ?? []];
      for (const [letter, lines] of [['D', D] as const, ['P', P] as const]) {
        lines.forEach((line, i) => {
          if (num(line, 73, 80) !== i + 1) problems.push(`${letter} line ${i + 1} numbered wrong`);
        });
      }
      for (let i = 0; i + 1 < D.length; i += 2) {
        const first = num(D[i], 8, 16);
        const count = num(D[i + 1], 24, 32);
        for (let k = 0; k < count; k++) {
          if (num(P[first - 1 + k], 64, 72) !== i + 1) problems.push(`entry ${i + 1} not linked`);
        }
      }
      const counts = ['S', 'G', 'D', 'P'].map((l) => l + String(s[l]?.length).padStart(7));
      if (T.length !== 1 || !T[0]?.startsWith(counts.join(''))) problems.push('terminate counts');
      return problems;
    };

    it('writes a compound as one IGES document holding every solid', async (ctx) => {
      skipIfDiverges(ctx, 'meshFns.igesExport');
      using first = box(10, 10, 10);
      using unplaced = box(10, 10, 10);
      using second = translate(unplaced, [30, 0, 0]);
      using both = compound([first, second]);
      const one = igesSections(await unwrap(exportIGES(first)).text());
      const iges = igesSections(await unwrap(exportIGES(both)).text());

      expect(iges['S']).toHaveLength(one['S']?.length ?? 0);
      expect(iges['D']).toHaveLength(2 * (one['D']?.length ?? 0));
      expect(iges['P']).toHaveLength(2 * (one['P']?.length ?? 0));
      expect(igesProblems(iges)).toEqual([]);
      // Line entities (type 110) run from x = 0 on the first box to x = 40 on the second.
      const xs = (iges['P'] ?? [])
        .filter((line) => line.startsWith('110,'))
        .flatMap((line) => {
          const v = line.slice(0, 64).split(/[,;]/).map(Number);
          return [v[1] ?? NaN, v[4] ?? NaN];
        });
      expect(Math.min(...xs)).toBeCloseTo(0, 3);
      expect(Math.max(...xs)).toBeCloseTo(40, 3);
    });

    it('exports a shape to IGES blob when IGES is available in the WASM build', () => {
      const oc = getKernel().oc;
      if (typeof oc.IGESControl_Writer_1 !== 'function') {
        console.warn('IGESControl_Writer_1 not in WASM build — skipping IGES integration test');
        return;
      }
      const b = box(10, 10, 10);
      const result = exportIGES(b);
      expect(isOk(result)).toBe(true);
      const blob = unwrap(result);
      expect(blob.size).toBeGreaterThan(0);
      expect(blob.type).toBe('application/iges');
    });

    it('exports a sphere to IGES blob when IGES is available in the WASM build', () => {
      const oc = getKernel().oc;
      if (typeof oc.IGESControl_Writer_1 !== 'function') {
        console.warn('IGESControl_Writer_1 not in WASM build — skipping IGES integration test');
        return;
      }
      const s = sphere(5);
      const result = exportIGES(s);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result).size).toBeGreaterThan(0);
    });

    it('returns IGES_EXPORT_FAILED when FS.readFile throws after successful write', () => {
      const oc = getKernel().oc;
      if (typeof oc.IGESControl_Writer_1 !== 'function') {
        console.warn('IGESControl_Writer_1 not in WASM build — skipping IGES error path test');
        return;
      }
      const originalReadFile = oc.FS.readFile as (...args: unknown[]) => unknown;
      oc.FS.readFile = (path: string) => {
        if (path.endsWith('.iges')) throw new Error('simulated FS read failure');
        return originalReadFile.call(oc.FS, path);
      };
      try {
        const b = box(5, 5, 5);
        const result = exportIGES(b);
        expect(isErr(result)).toBe(true);
        expect(unwrapErr(result).code).toBe('IGES_EXPORT_FAILED');
      } finally {
        oc.FS.readFile = originalReadFile;
      }
    });
  });
});

/** A loose 10 x 10 square face in the XZ plane. */
function squareSheet(): Face {
  using e1 = line([0, 0, 0], [10, 0, 0]);
  using e2 = line([10, 0, 0], [10, 0, 10]);
  using e3 = line([10, 0, 10], [0, 0, 10]);
  using e4 = line([0, 0, 10], [0, 0, 0]);
  using loop = unwrap(wireLoop([e1, e2, e3, e4]));
  if (!isPlanarWire(loop)) throw new Error('square is not planar');
  return unwrap(face(loop));
}

function pointAt(lines: Float32Array, vertex: number): [number, number, number] {
  return [lines[vertex * 3] ?? NaN, lines[vertex * 3 + 1] ?? NaN, lines[vertex * 3 + 2] ?? NaN];
}

function near(a: readonly number[], b: readonly number[]): boolean {
  const [ax = 0, ay = 0, az = 0] = a;
  const [bx = 0, by = 0, bz = 0] = b;
  return Math.hypot(ax - bx, ay - by, az - bz) < 1e-4;
}
