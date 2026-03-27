import { describe, it, beforeAll, expect } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import { getKernel } from '@/kernel/index.js';
import { supportsConstraintSketch } from '@/kernel/types.js';
import type { ConstraintSketchCapability, KernelAdapter } from '@/kernel/types.js';

const descBk = shouldSkipSuite('brepkitSketchArc') ? describe.skip : describe;

let kernel: KernelAdapter & ConstraintSketchCapability;

beforeAll(async () => {
  await initKernel();
  const k = getKernel();
  if (supportsConstraintSketch(k)) {
    kernel = k;
  }
}, 30000);

descBk('Sketch arc entity', () => {
  it('creates an arc from three points', () => {
    const s = kernel.sketchNew();
    // Center at origin, start at (1,0), end at (0,1) — quarter circle
    const center = kernel.sketchAddPoint(s, 0, 0, true);
    const start = kernel.sketchAddPoint(s, 1, 0, false);
    const end = kernel.sketchAddPoint(s, 0, 1, false);
    const arcIdx = kernel.sketchAddArc(s, center, start, end);
    expect(arcIdx).toBeGreaterThanOrEqual(0);
  });

  it('solves with arc and returns arc definitions', () => {
    const s = kernel.sketchNew();
    const center = kernel.sketchAddPoint(s, 0, 0, true);
    const start = kernel.sketchAddPoint(s, 5, 0, false);
    const end = kernel.sketchAddPoint(s, 0, 5, false);
    kernel.sketchAddArc(s, center, start, end);

    const result = JSON.parse(kernel.sketchSolve(s, 100, 1e-10)) as {
      converged: boolean;
      points: number[];
    };
    expect(result.converged).toBe(true);
    expect(result.points).toBeDefined();
  });
});

descBk('Sketch arc constraints', () => {
  it('pointOnArc constraint converges', () => {
    const s = kernel.sketchNew();
    const center = kernel.sketchAddPoint(s, 0, 0, true);
    const start = kernel.sketchAddPoint(s, 5, 0, false);
    const end = kernel.sketchAddPoint(s, 0, 5, false);
    const arcIdx = kernel.sketchAddArc(s, center, start, end);

    // Add a free point and constrain it to lie on the arc
    const _p = kernel.sketchAddPoint(s, 3, 3, false);
    kernel.sketchAddConstraint(s, JSON.stringify({ type: 'pointOnArc', point: _p, arc: arcIdx }));

    const result = JSON.parse(kernel.sketchSolve(s, 100, 1e-10)) as {
      converged: boolean;
      points: number[];
    };
    expect(result.converged).toBe(true);
    // Points array should include solved positions
    expect(result.points.length).toBeGreaterThanOrEqual(2);
  });

  it('arcLength constraint', () => {
    const s = kernel.sketchNew();
    const center = kernel.sketchAddPoint(s, 0, 0, true);
    const start = kernel.sketchAddPoint(s, 5, 0, false);
    const end = kernel.sketchAddPoint(s, 0, 5, false);
    const arcIdx = kernel.sketchAddArc(s, center, start, end);

    kernel.sketchAddConstraint(
      s,
      JSON.stringify({
        type: 'arcLength',
        arc: arcIdx,
        value: (Math.PI * 5) / 2, // quarter circle of radius 5
      })
    );

    const result = JSON.parse(kernel.sketchSolve(s, 100, 1e-10)) as {
      converged: boolean;
    };
    expect(result.converged).toBe(true);
  });

  it('sketchDof returns JSON string', () => {
    const s = kernel.sketchNew();
    kernel.sketchAddPoint(s, 0, 0, true);
    kernel.sketchAddPoint(s, 5, 0, false);

    const dofResult = kernel.sketchDof(s);
    expect(typeof dofResult).toBe('string');
    const parsed = JSON.parse(dofResult) as { dof: number };
    expect(parsed.dof).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.dof).toBe('number');
  });
});
