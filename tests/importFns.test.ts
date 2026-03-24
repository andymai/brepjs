import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  castShape,
  exportIGES,
  exportSTEP,
  exportSTL,
  importIGES,
  importSTEP,
  importSTL,
  isErr,
  isOk,
  measureVolume,
  unwrap,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('importSTEP', () => {
  it('imports a STEP file exported from a box', async () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const stepBlob = unwrap(exportSTEP(b));

    const result = await importSTEP(stepBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
    expect(unwrap(measureVolume(imported))).toBeCloseTo(1000, -1);
  });

  it('returns error for invalid STEP data', async () => {
    const invalidBlob = new Blob(['not a valid STEP file'], { type: 'application/octet-stream' });
    const result = await importSTEP(invalidBlob);
    expect(isOk(result)).toBe(false);
  });

  it('returns error for empty blob (ReadFile failure path)', async () => {
    // An empty file causes kernel STEPControl_Reader.ReadFile to return false,
    // covering the line 42 error branch distinct from the null-shape branch.
    const emptyBlob = new Blob([new Uint8Array(0)]);
    const result = await importSTEP(emptyBlob);
    expect(isErr(result)).toBe(true);
  });

  it('preserves shape type after STEP round-trip', async () => {
    const b = castShape(box(5, 10, 20).wrapped);
    const stepBlob = unwrap(exportSTEP(b));
    const result = await importSTEP(stepBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    // Volume should be 5 * 10 * 20 = 1000
    expect(unwrap(measureVolume(imported))).toBeCloseTo(1000, -1);
  });
});

describe('importSTL', () => {
  // OCCT V8 RC4: StlAPI_Reader.Read throws internally — revisit when V8.0.0 final ships
  it.skip('imports an STL file exported from a box', async () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const stlBlob = unwrap(exportSTL(b));

    const result = await importSTL(stlBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
  });

  it('returns error for invalid STL data', async () => {
    const invalidBlob = new Blob(['not a valid STL file'], { type: 'application/octet-stream' });
    const result = await importSTL(invalidBlob);
    expect(isOk(result)).toBe(false);
  });

  it('returns error for empty blob', async () => {
    const emptyBlob = new Blob([new Uint8Array(0)]);
    const result = await importSTL(emptyBlob);
    expect(isErr(result)).toBe(true);
  });

  // OCCT V8 RC4: StlAPI_Reader.Read throws internally — revisit when V8.0.0 final ships
  it.skip('imports ASCII STL format (closed tetrahedron)', async () => {
    // A valid closed tetrahedron with 4 triangular facets
    const asciiStl = [
      'solid tetra',
      '  facet normal 0 0 -1',
      '    outer loop',
      '      vertex 0 0 0',
      '      vertex 1 0 0',
      '      vertex 0 1 0',
      '    endloop',
      '  endfacet',
      '  facet normal 0 -1 0',
      '    outer loop',
      '      vertex 0 0 0',
      '      vertex 1 0 0',
      '      vertex 0 0 1',
      '    endloop',
      '  endfacet',
      '  facet normal -1 0 0',
      '    outer loop',
      '      vertex 0 0 0',
      '      vertex 0 1 0',
      '      vertex 0 0 1',
      '    endloop',
      '  endfacet',
      '  facet normal 0.577 0.577 0.577',
      '    outer loop',
      '      vertex 1 0 0',
      '      vertex 0 1 0',
      '      vertex 0 0 1',
      '    endloop',
      '  endfacet',
      'endsolid tetra',
    ].join('\n');
    const blob = new Blob([asciiStl], { type: 'model/stl' });
    const result = await importSTL(blob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
  });
});

describe('importIGES', () => {
  // NOTE: IGESControl_Reader_1 and IGESControl_Writer_1 are not available in the current
  // WASM build — the IGES reader/writer constructors are not compiled into the OpenCascade
  // WASM bundle used by this package. These tests are skipped rather than removed so that
  // they can be re-enabled once IGES support is added to the WASM build.

  it.skip('imports an IGES file exported from a box', async () => {
    const b = castShape(box(10, 10, 10).wrapped);
    const igesBlob = unwrap(exportIGES(b));

    const result = await importIGES(igesBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    expect(imported).toBeDefined();
    expect(unwrap(measureVolume(imported))).toBeCloseTo(1000, -1);
  });

  it.skip('returns error for invalid IGES data', async () => {
    const invalidBlob = new Blob(['not a valid IGES file'], { type: 'application/octet-stream' });
    const result = await importIGES(invalidBlob);
    expect(isErr(result)).toBe(true);
  });

  it.skip('returns error for empty blob', async () => {
    const emptyBlob = new Blob([new Uint8Array(0)]);
    const result = await importIGES(emptyBlob);
    expect(isErr(result)).toBe(true);
  });

  it.skip('preserves geometry through IGES round-trip', async () => {
    const b = castShape(box(3, 6, 9).wrapped);
    const igesBlob = unwrap(exportIGES(b));

    const result = await importIGES(igesBlob);
    expect(isOk(result)).toBe(true);
    const imported = unwrap(result);
    // Volume: 3 * 6 * 9 = 162
    expect(unwrap(measureVolume(imported))).toBeCloseTo(162, -1);
  });
});
