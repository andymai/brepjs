import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  box,
  castShape,
  compound,
  cut,
  exportIGES,
  exportSTEP,
  exportSTL,
  getFaces,
  getShells,
  getSolids,
  importIGES,
  importSTEP,
  importSTL,
  isCompound,
  isErr,
  isOk,
  isShell,
  isSolid,
  measureArea,
  measureVolume,
  translate,
  unwrap,
} from '@/index.js';
import type { Shape3D } from '@/index.js';

/** The facets of a shape's ASCII STL; `inward` reverses each triangle so the shell faces in. */
async function stlFacets(shape: Shape3D, inward = false): Promise<string> {
  const text = await unwrap(exportSTL(shape, { binary: false })).text();
  const lines = text.split('\n');
  const facets = lines.slice(
    1,
    lines.findIndex((line) => line.trim().startsWith('endsolid'))
  );
  if (!inward) return facets.join('\n') + '\n';
  const out: string[] = [];
  for (let i = 0; i < facets.length; i++) {
    const line = facets[i] ?? '';
    out.push(line);
    if (line.trim() === 'outer loop') {
      out.push(...facets.slice(i + 1, i + 4).reverse());
      i += 3;
    }
  }
  return out.join('\n') + '\n';
}

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
  it('imports an STL file exported from a box', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
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

  it('imports ASCII STL format (closed tetrahedron)', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
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

  it('imports a closed mesh as a solid that booleans measure correctly', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    using source = box(20, 20, 20);
    const stlBlob = unwrap(exportSTL(source));

    using imported = unwrap(await importSTL(stlBlob));
    expect(isSolid(imported)).toBe(true);
    if (!isSolid(imported)) return;
    expect(unwrap(measureVolume(imported))).toBeCloseTo(8000, 3);

    using tool = box(10, 10, 10);
    using result = unwrap(cut(imported, tool));
    expect(unwrap(measureVolume(result))).toBeCloseTo(7000, 3);
  });

  it('imports an open mesh as a sewn shell', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    const asciiStl = [
      'solid square',
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 0',
      'vertex 1 0 0',
      'vertex 1 1 0',
      'endloop',
      'endfacet',
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 0',
      'vertex 1 1 0',
      'vertex 0 1 0',
      'endloop',
      'endfacet',
      'endsolid square',
    ].join('\n');

    using imported = unwrap(await importSTL(new Blob([asciiStl])));
    expect(isShell(imported)).toBe(true);
    if (!isShell(imported)) return;
    expect(getFaces(imported)).toHaveLength(2);
    expect(unwrap(measureArea(imported))).toBeCloseTo(1, 6);
  });

  it('imports disjoint closed bodies as a compound of solids', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    using first = box(10, 10, 10);
    using unplaced = box(10, 10, 10);
    using second = translate(unplaced, [20, 0, 0]);
    using both = compound([first, second]);
    const stlBlob = unwrap(exportSTL(both));

    using imported = unwrap(await importSTL(stlBlob));
    expect(isCompound(imported)).toBe(true);
    expect(getSolids(imported)).toHaveLength(2);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000, 3);

    using tool = box(5, 5, 5);
    using result = unwrap(cut(imported as Shape3D, tool));
    expect(unwrap(measureVolume(result))).toBeCloseTo(1875, 3);
  });

  it('keeps an open body as a shell beside the closed ones', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    using closed = box(10, 10, 10);
    const ascii = await unwrap(exportSTL(closed, { binary: false })).text();
    const sheet = [
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 50',
      'vertex 1 0 50',
      'vertex 1 1 50',
      'endloop',
      'endfacet',
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 50',
      'vertex 1 1 50',
      'vertex 0 1 50',
      'endloop',
      'endfacet',
      '',
    ].join('\n');
    const endsolid = ascii.lastIndexOf('endsolid');
    expect(endsolid).toBeGreaterThan(0);
    const combined = ascii.slice(0, endsolid) + sheet + ascii.slice(endsolid);

    using imported = unwrap(await importSTL(new Blob([combined])));
    expect(isCompound(imported)).toBe(true);
    const solids = getSolids(imported);
    expect(solids).toHaveLength(1);
    expect(unwrap(measureVolume(solids[0] as Shape3D))).toBeCloseTo(1000, 3);
    expect(getShells(imported)).toHaveLength(2);
    expect(getFaces(imported)).toHaveLength(14);
  });

  it('closes a body that sits beside a loose triangle', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    using closed = box(10, 10, 10);
    const ascii = await unwrap(exportSTL(closed, { binary: false })).text();
    const triangle = [
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 50',
      'vertex 1 0 50',
      'vertex 1 1 50',
      'endloop',
      'endfacet',
      '',
    ].join('\n');
    const endsolid = ascii.lastIndexOf('endsolid');
    expect(endsolid).toBeGreaterThan(0);
    const combined = ascii.slice(0, endsolid) + triangle + ascii.slice(endsolid);

    using imported = unwrap(await importSTL(new Blob([combined])));
    const solids = getSolids(imported);
    expect(solids).toHaveLength(1);
    expect(unwrap(measureVolume(solids[0] as Shape3D))).toBeCloseTo(1000, 3);
    expect(getFaces(imported)).toHaveLength(13);
  });

  it('keeps a sealed cavity hollow', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    using outer = box(20, 20, 20);
    using cavityBox = box(10, 10, 10);
    using cavity = translate(cavityBox, [5, 5, 5]);
    const stl =
      'solid hollow\n' +
      (await stlFacets(outer)) +
      (await stlFacets(cavity, true)) +
      'endsolid hollow\n';

    using imported = unwrap(await importSTL(new Blob([stl])));
    const solids = getSolids(imported);
    expect(solids).toHaveLength(1);
    expect(unwrap(measureVolume(solids[0] as Shape3D))).toBeCloseTo(8000 - 1000, 3);
    expect(getShells(imported)).toHaveLength(2);
  });

  it('keeps an outward-facing part inside another as its own body', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    using outer = box(20, 20, 20);
    using innerBox = box(10, 10, 10);
    using inner = translate(innerBox, [5, 5, 5]);
    const stl =
      'solid parts\n' + (await stlFacets(outer)) + (await stlFacets(inner)) + 'endsolid parts\n';

    using imported = unwrap(await importSTL(new Blob([stl])));
    const volumes = getSolids(imported)
      .map((solid) => unwrap(measureVolume(solid as Shape3D)))
      .sort((a, b) => a - b);
    expect(volumes).toHaveLength(2);
    expect(volumes[0]).toBeCloseTo(1000, 3);
    expect(volumes[1]).toBeCloseTo(8000, 3);
  });

  it('keeps an island inside a cavity as a body of its own', async (ctx) => {
    skipIfDiverges(ctx, 'importFns.stlImport');
    using outer = box(30, 30, 30);
    using cavityBox = box(20, 20, 20);
    using cavity = translate(cavityBox, [5, 5, 5]);
    using islandBox = box(10, 10, 10);
    using island = translate(islandBox, [10, 10, 10]);
    const stl =
      'solid nested\n' +
      (await stlFacets(outer)) +
      (await stlFacets(cavity, true)) +
      (await stlFacets(island)) +
      'endsolid nested\n';

    using imported = unwrap(await importSTL(new Blob([stl])));
    const volumes = getSolids(imported)
      .map((solid) => unwrap(measureVolume(solid as Shape3D)))
      .sort((a, b) => a - b);
    expect(volumes).toHaveLength(2);
    expect(volumes[0]).toBeCloseTo(1000, 3);
    expect(volumes[1]).toBeCloseTo(27000 - 8000, 3);
  });
});

describe.skipIf(currentKernel !== 'occt-wasm')('IGES on occt-wasm', () => {
  it('exportIGES returns an unsupported-capability error', () => {
    using b = box(10, 10, 10);
    const result = exportIGES(b);
    expect(isErr(result)).toBe(true);
    if (result.ok) return;
    expect(result.error.kind).toBe('UNSUPPORTED');
    expect(result.error.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(result.error.message).toContain('occt-wasm');
  });

  it('importIGES returns an unsupported-capability error', async () => {
    const result = await importIGES(new Blob(['not read']));
    expect(isErr(result)).toBe(true);
    if (result.ok) return;
    expect(result.error.kind).toBe('UNSUPPORTED');
    expect(result.error.code).toBe('UNSUPPORTED_CAPABILITY');
    expect(result.error.message).toContain('occt-wasm');
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
