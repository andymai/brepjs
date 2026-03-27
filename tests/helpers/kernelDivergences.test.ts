import { describe, it, expect } from 'vitest';
import {
  divergences,
  getDivergence,
  getToleranceFor,
  getAllDivergences,
  currentKernelId,
  shouldSkipSuite,
  skipIfDiverges,
} from './kernelDivergences.js';

describe('kernelDivergences', () => {
  it('exports a non-empty divergence map', () => {
    const all = getAllDivergences();
    expect(Object.keys(all).length).toBeGreaterThan(0);
  });

  it('brepkit has divergences declared', () => {
    const bk = divergences['brepkit'];
    expect(bk).toBeDefined();
    expect(Object.keys(bk ?? {}).length).toBeGreaterThan(0);
  });

  it('occt has divergences declared', () => {
    const oc = divergences['occt'];
    expect(oc).toBeDefined();
    expect(Object.keys(oc ?? {}).length).toBeGreaterThan(0);
  });

  it('getDivergence returns divergence for known key', () => {
    const div = getDivergence('variableFillet', 'brepkit');
    expect(div).toBeDefined();
    expect(div?.kind).toBe('not-implemented');
  });

  it('getDivergence returns undefined for unknown key', () => {
    expect(getDivergence('nonexistent.key', 'brepkit')).toBeUndefined();
  });

  it('getDivergence defaults to current kernel from env', () => {
    // On OCCT this returns undefined; on brepkit it returns the divergence entry
    const div = getDivergence('variableFillet');
    if (div) {
      expect(div.kind).toBe('not-implemented');
    }
  });

  it('getToleranceFor returns tolerance divergence with numeric fields', () => {
    const tol = getToleranceFor('operations.loftCircles', 'brepkit');
    expect(tol).toBeDefined();
    expect(tol?.kind).toBe('tolerance');
    expect(typeof tol?.relativeTol).toBe('number');
    expect(tol?.metric).toBe('volume');
  });

  it('getToleranceFor returns undefined for non-tolerance divergence', () => {
    const tol = getToleranceFor('variableFillet', 'brepkit');
    expect(tol).toBeUndefined();
  });

  it('getToleranceFor returns undefined for unknown key', () => {
    const tol = getToleranceFor('nonexistent.key', 'brepkit');
    expect(tol).toBeUndefined();
  });

  it('every divergence has a non-empty reason', () => {
    for (const [_kernelId, entries] of Object.entries(getAllDivergences())) {
      for (const [key, div] of Object.entries(entries)) {
        expect(div.reason, `${key} missing reason`).toBeTruthy();
      }
    }
  });

  it('every divergence has a valid kind', () => {
    const validKinds = new Set(['not-implemented', 'skip', 'tolerance', 'topology-differs']);
    for (const [_kernelId, entries] of Object.entries(getAllDivergences())) {
      for (const [key, div] of Object.entries(entries)) {
        expect(validKinds.has(div.kind), `${key} has invalid kind: ${div.kind}`).toBe(true);
      }
    }
  });

  it('shouldSkipSuite returns true for not-implemented features', () => {
    expect(shouldSkipSuite('variableFillet', 'brepkit')).toBe(true);
  });

  it('shouldSkipSuite returns true for skip divergences', () => {
    expect(shouldSkipSuite('booleanFns.disjointIntersection', 'brepkit')).toBe(true);
  });

  it('shouldSkipSuite returns false for tolerance divergences', () => {
    expect(shouldSkipSuite('operations.loftCircles', 'brepkit')).toBe(false);
  });

  it('shouldSkipSuite returns false for topology-differs divergences', () => {
    expect(shouldSkipSuite('faceFinder.sphereFaceCount', 'brepkit')).toBe(false);
  });

  it('shouldSkipSuite returns false for unknown keys', () => {
    expect(shouldSkipSuite('nonexistent', 'brepkit')).toBe(false);
  });

  it('currentKernelId is a non-empty string', () => {
    expect(typeof currentKernelId).toBe('string');
    expect(currentKernelId.length).toBeGreaterThan(0);
  });

  it('skipIfDiverges calls ctx.skip for skip divergence', () => {
    let skipped = false;
    const mockCtx = {
      skip: () => {
        skipped = true;
      },
    } as unknown as Parameters<typeof skipIfDiverges>[0];
    skipIfDiverges(mockCtx, 'booleanFns.disjointIntersection', 'brepkit');
    expect(skipped).toBe(true);
  });

  it('skipIfDiverges does not call ctx.skip for tolerance divergence', () => {
    let skipped = false;
    const mockCtx = {
      skip: () => {
        skipped = true;
      },
    } as unknown as Parameters<typeof skipIfDiverges>[0];
    skipIfDiverges(mockCtx, 'operations.loftCircles', 'brepkit');
    expect(skipped).toBe(false);
  });

  it('skipIfDiverges does not call ctx.skip for unknown key', () => {
    let skipped = false;
    const mockCtx = {
      skip: () => {
        skipped = true;
      },
    } as unknown as Parameters<typeof skipIfDiverges>[0];
    skipIfDiverges(mockCtx, 'nonexistent', 'brepkit');
    expect(skipped).toBe(false);
  });

  it('brepkit-only suites are registered as not-implemented on occt', () => {
    const brepkitOnlySuites = [
      'brepkitSketchArc',
      'brepkitOffsetV2',
      'brepkitBooleanEdgeCases',
      'brepkitExtended',
      'gltfRoundTrip',
    ];
    for (const key of brepkitOnlySuites) {
      const div = getDivergence(key, 'occt');
      expect(div, `${key} should be registered for occt`).toBeDefined();
      expect(div?.kind).toBe('not-implemented');
    }
  });

  it('occt-only suites are registered as not-implemented on brepkit', () => {
    const occtOnlySuites = [
      'variableFillet',
      'multiSweepFns',
      'guidedSweepFns',
      'interferenceFns',
      'hullFns',
      'disposal',
      'minkowskiFns',
    ];
    for (const key of occtOnlySuites) {
      const div = getDivergence(key, 'brepkit');
      expect(div, `${key} should be registered for brepkit`).toBeDefined();
      expect(div?.kind).toBe('not-implemented');
    }
  });
});
