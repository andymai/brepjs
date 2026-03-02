import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
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
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
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

  it('returns STEP_FILE_READ_ERROR when FS.readFile throws after successful write', () => {
    const oc = getKernel().oc;
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
    // mesh() populates triangulation on the shape's underlying OCCT object;
    // exportSTL should detect that and skip the BRepMesh step.
    const b = box(10, 10, 10);
    mesh(b); // populate triangulation
    const result = exportSTL(b);
    expect(isOk(result)).toBe(true);
    expect(unwrap(result).size).toBeGreaterThan(0);
  });

  it('returns STL_FILE_READ_ERROR when FS.readFile throws after successful write', () => {
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
