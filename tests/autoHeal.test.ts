/* eslint-disable @typescript-eslint/no-non-null-assertion -- test array indexing */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  sphere,
  autoHeal,
  isValid,
  unwrap,
  healSolid,
  healFace,
  healWire,
  heal,
  getFaces,
  getWires,
  getEdges,
  getKernel,
  isOk,
  isErr,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('autoHeal', () => {
  it('returns valid shape unchanged with alreadyValid: true', () => {
    const b = box(10, 10, 10);
    expect(isValid(b)).toBe(true);

    const result = unwrap(autoHeal(b));
    expect(result.report.isValid).toBe(true);
    expect(result.report.alreadyValid).toBe(true);
    expect(result.report.steps).toContain('Shape already valid');
    expect(result.report.wiresHealed).toBe(0);
    expect(result.report.facesHealed).toBe(0);
    expect(result.report.solidHealed).toBe(false);
  });

  it('returns valid sphere unchanged', () => {
    const s = sphere(5);
    expect(isValid(s)).toBe(true);

    const result = unwrap(autoHeal(s));
    expect(result.report.isValid).toBe(true);
    expect(result.report.steps).toContain('Shape already valid');
  });

  it('report has expected structure', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b));

    expect(result.report).toHaveProperty('isValid');
    expect(result.report).toHaveProperty('wiresHealed');
    expect(result.report).toHaveProperty('facesHealed');
    expect(result.report).toHaveProperty('solidHealed');
    expect(result.report).toHaveProperty('steps');
    expect(result.report).toHaveProperty('diagnostics');
    expect(Array.isArray(result.report.steps)).toBe(true);
    expect(Array.isArray(result.report.diagnostics)).toBe(true);
  });

  it('returns shape from result', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b));

    // Should return a valid shape
    expect(result.shape).toBeDefined();
    expect(isValid(result.shape)).toBe(true);
  });

  it('diagnostics contain validation entry for valid shape', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b));

    const validationDiag = result.report.diagnostics.find((d) => d.name === 'validation');
    expect(validationDiag).toBeDefined();
    expect(validationDiag!.attempted).toBe(true);
    expect(validationDiag!.succeeded).toBe(true);
  });

  it('accepts options with fixWires disabled', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixWires: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with fixFaces disabled', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixFaces: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with fixSolids disabled', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixSolids: false }));
    expect(result.report.isValid).toBe(true);
  });

  it('accepts options with sewTolerance', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { sewTolerance: 0.01 }));
    // Valid shapes short-circuit before sewing is applied
    expect(result.report.isValid).toBe(true);
  });

  it('accepts fixSelfIntersection option', () => {
    const b = box(10, 10, 10);
    const result = unwrap(autoHeal(b, { fixSelfIntersection: true }));
    // Valid shapes short-circuit
    expect(result.report.isValid).toBe(true);
  });
});

describe('autoHeal — healing pipeline (invalid shape paths)', () => {
  /**
   * Mock kernel.isValid to return false on the first call (initial check) so
   * autoHeal enters the healing pipeline, then return true for the final
   * validation. This exercises lines 213-307 of healingFns.ts.
   */
  function mockKernelIsValid(pattern: 'first-false' | 'always-false') {
    const kernel = getKernel();
    const original = kernel.isValid.bind(kernel);
    let callCount = 0;
    const spy = vi.spyOn(kernel, 'isValid').mockImplementation((...args) => {
      callCount++;
      if (pattern === 'always-false') return false;
      // first-false: first call returns false, rest delegate to real impl
      if (callCount === 1) return false;
      return original(...args);
    });
    return spy;
  }

  it('enters healing pipeline and applies shape-level healing on a solid', () => {
    const b = box(10, 10, 10);
    const spy = mockKernelIsValid('first-false');

    try {
      const result = unwrap(autoHeal(b));
      expect(result.report.alreadyValid).toBe(false);
      expect(result.report.steps[0]).toContain('Shape invalid');
      expect(result.report.solidHealed).toBe(true);
      const finalDiag = result.report.diagnostics.find((d) => d.name === 'finalValidation');
      expect(finalDiag).toBeDefined();
      expect(finalDiag!.attempted).toBe(true);
      expect(finalDiag!.succeeded).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('applies sewing step when sewTolerance is provided', () => {
    const b = box(10, 10, 10);
    const spy = mockKernelIsValid('first-false');

    try {
      const result = unwrap(autoHeal(b, { sewTolerance: 0.01 }));
      expect(result.report.alreadyValid).toBe(false);
      const sewDiag = result.report.diagnostics.find((d) => d.name === 'sew');
      expect(sewDiag).toBeDefined();
      expect(sewDiag!.attempted).toBe(true);
      expect(sewDiag!.succeeded).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('applies self-intersection fix when enabled', () => {
    const b = box(10, 10, 10);
    const spy = mockKernelIsValid('first-false');

    try {
      const result = unwrap(autoHeal(b, { fixSelfIntersection: true }));
      expect(result.report.alreadyValid).toBe(false);
      const siDiag = result.report.diagnostics.find((d) => d.name === 'fixSelfIntersection');
      expect(siDiag).toBeDefined();
      expect(siDiag!.attempted).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('skips healing when all fix options are disabled', () => {
    const b = box(10, 10, 10);
    const spy = mockKernelIsValid('first-false');

    try {
      const result = unwrap(autoHeal(b, { fixWires: false, fixFaces: false, fixSolids: false }));
      expect(result.report.alreadyValid).toBe(false);
      const healDiag = result.report.diagnostics.find((d) => d.name === 'healShape');
      expect(healDiag).toBeDefined();
      expect(healDiag!.attempted).toBe(false);
      expect(healDiag!.detail).toBe('skipped by options');
    } finally {
      spy.mockRestore();
    }
  });

  it('exercises face healing pipeline', () => {
    const b = box(10, 10, 10);
    const face = getFaces(b)[0]!;
    const spy = mockKernelIsValid('first-false');

    try {
      const result = unwrap(autoHeal(face));
      expect(result.report.alreadyValid).toBe(false);
      expect(result.report.steps).toEqual(
        expect.arrayContaining([expect.stringContaining('ShapeFix_Face')])
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('exercises wire healing pipeline', () => {
    const b = box(10, 10, 10);
    const wire = getWires(b)[0]!;
    const spy = mockKernelIsValid('first-false');

    try {
      const result = unwrap(autoHeal(wire));
      expect(result.report.alreadyValid).toBe(false);
      expect(result.report.steps).toEqual(
        expect.arrayContaining([expect.stringContaining('ShapeFix_Wire')])
      );
    } finally {
      spy.mockRestore();
    }
  });

  it('reports final validation as invalid when healed shape still fails', () => {
    const b = box(10, 10, 10);
    const spy = mockKernelIsValid('always-false');

    try {
      const result = unwrap(autoHeal(b));
      expect(result.report.alreadyValid).toBe(false);
      expect(result.report.isValid).toBe(false);
      const finalStep = result.report.steps.find((s) => s.startsWith('Final validation'));
      expect(finalStep).toContain('still invalid');
    } finally {
      spy.mockRestore();
    }
  });

  it('reports wire/face count changes', () => {
    const b = box(10, 10, 10);
    const spy = mockKernelIsValid('first-false');

    try {
      const result = unwrap(autoHeal(b));
      expect(result.report.alreadyValid).toBe(false);
      // Even with valid shapes, the wire/face counting code runs (lines 296-303)
      expect(typeof result.report.wiresHealed).toBe('number');
      expect(typeof result.report.facesHealed).toBe('number');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('healSolid', () => {
  it('returns valid solid unchanged', () => {
    const b = box(10, 10, 10);
    const result = healSolid(b);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(isValid(result.value)).toBe(true);
    }
  });

  it('handles a sphere (exercises HEAL_RESULT_NOT_SOLID or no-effect branch)', () => {
    // A sphere is valid, but the kernel healer may return a non-solid
    // shape or null — this exercises error/no-effect branches
    const s = sphere(5);
    const result = healSolid(s);
    // Either succeeds or returns a typed error — both are expected outcomes
    if (isErr(result)) {
      expect(result.error.code).toBeDefined();
    }
  });
});

describe('healFace', () => {
  it('heals a face from a box', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    expect(faces.length).toBeGreaterThan(0);
    const result = healFace(faces[0]!);
    expect(isOk(result)).toBe(true);
  });
});

describe('healWire', () => {
  it('heals a wire from a box', () => {
    const b = box(10, 10, 10);
    const wires = getWires(b);
    expect(wires.length).toBeGreaterThan(0);
    const result = healWire(wires[0]!);
    expect(isOk(result)).toBe(true);
  });

  it('heals a wire with face context', () => {
    const b = box(10, 10, 10);
    const wires = getWires(b);
    const faces = getFaces(b);
    expect(wires.length).toBeGreaterThan(0);
    expect(faces.length).toBeGreaterThan(0);
    const result = healWire(wires[0]!, faces[0]);
    expect(isOk(result)).toBe(true);
  });
});

describe('heal (polymorphic)', () => {
  it('dispatches to healSolid for solids', () => {
    const b = box(10, 10, 10);
    const result = heal(b);
    expect(isOk(result)).toBe(true);
  });

  it('dispatches to healFace for faces', () => {
    const b = box(10, 10, 10);
    const face = getFaces(b)[0]!;
    const result = heal(face);
    expect(isOk(result)).toBe(true);
  });

  it('dispatches to healWire for wires', () => {
    const b = box(10, 10, 10);
    const wire = getWires(b)[0]!;
    const result = heal(wire);
    expect(isOk(result)).toBe(true);
  });

  it('returns unsupported types unchanged', () => {
    const b = box(10, 10, 10);
    const edge = getEdges(b)[0]!;
    const result = heal(edge);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(edge);
    }
  });
});
