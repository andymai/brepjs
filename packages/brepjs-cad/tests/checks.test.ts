import { describe, it, expect, beforeAll } from 'vitest';
import * as brep from 'brepjs';
import { init, box, fuse, unwrap, compound } from 'brepjs';
import { runChecks } from '@/verify/checks.js';

beforeAll(async () => {
  await init();
}, 30000);

describe('runChecks', () => {
  it('reports a valid solid with positive volume and bounds', () => {
    const report = runChecks(brep, box(10, 10, 10));
    expect(report.shapeType).toBe('Solid');
    expect(report.measurements.volume).toBeCloseTo(1000, 1);
    expect(report.measurements.bounds?.xMax).toBeCloseTo(10, 3);
    expect(report.checks.find((c) => c.name === 'isValidSolid')?.passed).toBe(true);
    expect(report.checks.find((c) => c.name === 'positiveVolume')?.passed).toBe(true);
  });

  it('computes volume + positiveVolume for a boolean result even when it is a Compound', () => {
    // Booleans/modifiers often return a Compound wrapping one solid; verification must not
    // silently skip volume/positiveVolume for it (would leave `ok` vacuously true).
    const fused = unwrap(fuse(box(10, 10, 10), box(10, 10, 10, { at: [5, 0, 0] })));
    const report = runChecks(brep, fused);
    expect(report.measurements.volume).toBeDefined();
    expect(report.measurements.volume).toBeGreaterThan(0);
    expect(report.checks.some((c) => c.name === 'positiveVolume' && c.passed)).toBe(true);
  });

  it('flags a multi-body Compound in notes (fragmentation advisory) without failing the report', () => {
    // Two boxes sitting apart → a 2-solid Compound. An author on plain --check otherwise can't see
    // the part fragmented; the advisory surfaces the count + fix but must not affect `ok`.
    const asm = compound([box(10, 10, 10), box(10, 10, 10, { at: [40, 0, 0] })]);
    const report = runChecks(brep, asm);
    const note = report.notes?.find((n) => n.includes('2 solids'));
    expect(note).toBeDefined();
    expect(note).toMatch(/not welded/i);
    // advisory only — every check still passes
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('does NOT flag a single solid or a single-solid Compound', () => {
    expect(runChecks(brep, box(10, 10, 10)).notes).toBeUndefined();
    // overlapping fuse → one welded solid wrapped in a Compound (solids.length === 1): no advisory
    const fused = unwrap(fuse(box(10, 10, 10), box(10, 10, 10, { at: [5, 0, 0] })));
    expect(runChecks(brep, fused).notes).toBeUndefined();
  });

  it('reports topology counts (faces/edges/wires/vertices) for a solid', () => {
    const report = runChecks(brep, box(10, 10, 10));
    expect(report.topology).toBeDefined();
    expect(report.topology?.faceCount).toBe(6);
    expect(report.topology?.edgeCount).toBe(12);
    expect(report.topology?.wireCount).toBe(6);
    expect(report.topology?.vertexCount).toBe(8);
  });

  it('omits topology (without failing the report) when traversal throws', () => {
    // Fault-inject a topology extractor to exercise runChecks's defensive fallback: counts must
    // degrade to "absent" while the rest of the report stays intact and unaffected.
    const faultyBrep = {
      ...brep,
      getFaces: () => {
        throw new Error('simulated degenerate-shape traversal failure');
      },
    };
    const report = runChecks(faultyBrep, box(10, 10, 10));
    expect(report.topology).toBeUndefined();
    expect(report.shapeType).toBe('Solid');
    expect(report.measurements.volume).toBeCloseTo(1000, 1);
  });

  it('reports center of mass for a solid', () => {
    // box(10,10,10) spans 0..10 on each axis, so its centroid is (5,5,5).
    const report = runChecks(brep, box(10, 10, 10));
    expect(report.measurements.centerOfMass).toBeDefined();
    expect(report.measurements.centerOfMass?.[0]).toBeCloseTo(5, 3);
    expect(report.measurements.centerOfMass?.[1]).toBeCloseTo(5, 3);
    expect(report.measurements.centerOfMass?.[2]).toBeCloseTo(5, 3);
  });

  it('reports manifold=true for a closed solid', () => {
    const report = runChecks(brep, box(10, 10, 10));
    expect(report.topology?.manifold).toBe(true);
  });

  it('reports manifold=false when a shell is not manifold', () => {
    // Fault-inject the manifold predicate to exercise the false branch deterministically,
    // without depending on the kernel to produce a real non-manifold solid.
    const faultyBrep = { ...brep, isManifoldShell: (() => false) as typeof brep.isManifoldShell };
    const report = runChecks(faultyBrep, box(10, 10, 10));
    expect(report.topology?.manifold).toBe(false);
  });

  it('omits manifold (absent, not false) for a shape with no shells', () => {
    const edge = brep.getEdges(box(10, 10, 10))[0];
    if (!edge) throw new Error('expected an edge from the box');
    const report = runChecks(brep, edge);
    expect(report.topology).toBeDefined();
    expect(report.topology?.manifold).toBeUndefined();
  });

  it('validates each body of a multi-solid compound (allBodiesValid)', () => {
    const asm = compound([box(10, 10, 10), box(10, 10, 10, { at: [20, 0, 0] })]);
    const report = runChecks(brep, asm);
    expect(report.shapeType).toBe('Compound');
    expect(report.checks.find((c) => c.name === 'allBodiesValid')?.passed).toBe(true);
    // A multi-body assembly does not get the single-solid check.
    expect(report.checks.find((c) => c.name === 'isValidSolid')).toBeUndefined();
  });

  it('reports allBodiesValid=false when a body is invalid', () => {
    // Fault-inject validSolid so a body reads as invalid, exercising the false branch deterministically.
    const faultyBrep = {
      ...brep,
      validSolid: (() => ({ ok: false, error: 'forced invalid' })) as typeof brep.validSolid,
    };
    const asm = compound([box(10, 10, 10), box(10, 10, 10, { at: [20, 0, 0] })]);
    const report = runChecks(faultyBrep, asm);
    const check = report.checks.find((c) => c.name === 'allBodiesValid');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('2/2');
  });

  it('reports a partial failure (1 of 2 bodies invalid)', () => {
    // Fail only the second body: first call delegates to the real check, later calls force-fail.
    let call = 0;
    const faultyBrep = {
      ...brep,
      validSolid: ((s: Parameters<typeof brep.validSolid>[0]) =>
        call++ === 0
          ? brep.validSolid(s)
          : { ok: false, error: 'forced invalid' }) as typeof brep.validSolid,
    };
    const asm = compound([box(10, 10, 10), box(10, 10, 10, { at: [20, 0, 0] })]);
    const report = runChecks(faultyBrep, asm);
    const check = report.checks.find((c) => c.name === 'allBodiesValid');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('1/2');
  });

  it('does not add a body-validity check for a shape with no solids', () => {
    const edge = brep.getEdges(box(10, 10, 10))[0];
    if (!edge) throw new Error('expected an edge from the box');
    const report = runChecks(brep, edge);
    expect(report.checks.find((c) => c.name === 'allBodiesValid')).toBeUndefined();
    expect(report.checks.find((c) => c.name === 'isValidSolid')).toBeUndefined();
  });
});
