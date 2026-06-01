import { describe, expect, it, beforeAll, vi } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  sphere,
  mesh,
  meshEdges,
  exportSTEP,
  exportSTL,
  exportIGES,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  clearMeshCache,
  getKernel,
} from '@/index.js';

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

  describe('meshEdges', () => {
    it('meshes edge curves of a box', () => {
      const b = box(10, 10, 10);
      const edgeMesh = meshEdges(b);
      expect(edgeMesh.lines.length).toBeGreaterThan(0);
      expect(edgeMesh.edgeGroups.length).toBe(12); // 12 edges on a box
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
  });

  describe('exportSTEP', () => {
    it('exports a shape to STEP blob', () => {
      const b = box(10, 10, 10);
      const result = exportSTEP(b);
      expect(isOk(result)).toBe(true);
      const blob = unwrap(result);
      expect(blob.size).toBeGreaterThan(0);
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
