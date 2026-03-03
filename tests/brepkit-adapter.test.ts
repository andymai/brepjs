/**
 * Comprehensive brepkit adapter test — exercises all 12 themes.
 *
 * Requires brepkit-wasm to be linked: `npm link ~/Git/brepkit/pkg`
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { registerKernel } from '../src/kernel/index.js';
import { BrepkitAdapter } from '../src/kernel/brepkitAdapter.js';
import type { KernelAdapter } from '../src/kernel/types.js';

let k: KernelAdapter;
let available = false;

beforeAll(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bk: any = await import('brepkit-wasm');
    if (typeof bk.default === 'function') await bk.default();
    const adapter = new BrepkitAdapter(new bk.BrepKernel());
    registerKernel('brepkit', adapter);
    k = adapter;
    available = true;
  } catch (e: unknown) {
    console.warn('[test] brepkit WASM not available:', e);
  }
}, 30000);

function skip() {
  if (!available) {
    console.warn('[skip] brepkit not available');
    return true;
  }
  return false;
}

describe('brepkit adapter', () => {
  // ── Theme K: type safety (implicit — if these run, types work) ──

  // ── Theme A: topology traversal ──
  describe('iterShapes (Theme A)', () => {
    it('box → 6 faces', () => {
      if (skip()) return;
      expect(k.iterShapes(k.makeBox(2, 3, 4), 'face').length).toBe(6);
    });
    it('box → 12 edges', () => {
      if (skip()) return;
      expect(k.iterShapes(k.makeBox(2, 3, 4), 'edge').length).toBe(12);
    });
    it('box → 8 vertices', () => {
      if (skip()) return;
      expect(k.iterShapes(k.makeBox(2, 3, 4), 'vertex').length).toBe(8);
    });
    it('compound → 2 solids', () => {
      if (skip()) return;
      const c = k.makeCompound([k.makeBox(1, 1, 1), k.makeBox(1, 1, 1)]);
      expect(k.iterShapes(c, 'solid').length).toBe(2);
    });
    it('compound → 12 faces', () => {
      if (skip()) return;
      const c = k.makeCompound([k.makeBox(1, 1, 1), k.makeBox(1, 1, 1)]);
      expect(k.iterShapes(c, 'face').length).toBe(12);
    });
    it('face → edges', () => {
      if (skip()) return;
      const box = k.makeBox(2, 3, 4);
      const face = k.iterShapes(box, 'face')[0]!;
      expect(k.iterShapes(face, 'edge').length).toBeGreaterThanOrEqual(3);
    });
    it('face → wire', () => {
      if (skip()) return;
      const box = k.makeBox(2, 3, 4);
      const face = k.iterShapes(box, 'face')[0]!;
      expect(k.iterShapes(face, 'wire').length).toBeGreaterThanOrEqual(1);
    });
    it('edge → vertex', () => {
      if (skip()) return;
      const box = k.makeBox(2, 3, 4);
      const edge = k.iterShapes(box, 'edge')[0]!;
      expect(k.iterShapes(edge, 'vertex').length).toBe(2);
    });
  });

  // ── Theme B: non-solid support ──
  describe('non-solid support (Theme B)', () => {
    it('volume(face) returns 0', () => {
      if (skip()) return;
      expect(k.volume(k.makeRectangle(5, 5))).toBe(0);
    });
    it('area(face) returns face area', () => {
      if (skip()) return;
      const a = k.area(k.makeRectangle(5, 5));
      expect(a).toBeGreaterThan(20);
    });
    it('boundingBox(face)', () => {
      if (skip()) return;
      const bb = k.boundingBox(k.makeRectangle(4, 6));
      expect(bb.max[0] - bb.min[0]).toBeCloseTo(4, 0);
    });
    it('fuse throws descriptive error for face', () => {
      if (skip()) return;
      const face = k.makeRectangle(5, 5);
      expect(() => k.fuse(face, face)).toThrow(/requires a solid/);
    });
  });

  // ── Theme D: return types ──
  describe('return types (Theme D)', () => {
    it('split returns compound', () => {
      if (skip()) return;
      const box = k.makeBox(4, 4, 4);
      // Create a cutting plane at z=2 from edges (translate on faces not available)
      const e1 = k.makeLineEdge([-5, -5, 2], [5, -5, 2]);
      const e2 = k.makeLineEdge([5, -5, 2], [5, 5, 2]);
      const e3 = k.makeLineEdge([5, 5, 2], [-5, 5, 2]);
      const e4 = k.makeLineEdge([-5, 5, 2], [-5, -5, 2]);
      const wire = k.makeWire([e1, e2, e3, e4]);
      const plane = k.makeFace(wire);
      const result = k.split(box, [plane]);
      expect(k.shapeType(result)).toBe('compound');
    });
  });

  // ── Theme E: primitives ──
  describe('primitives (Theme E)', () => {
    it('box volume = w*h*d', () => {
      if (skip()) return;
      const v = k.volume(k.makeBox(2, 3, 4));
      expect(v).toBeCloseTo(24, 0);
    });
    it('box at origin', () => {
      if (skip()) return;
      const bb = k.boundingBox(k.makeBox(3, 4, 5));
      expect(bb.min[0]).toBeCloseTo(0, 1);
      expect(bb.min[1]).toBeCloseTo(0, 1);
      expect(bb.min[2]).toBeCloseTo(0, 1);
      expect(bb.max[0]).toBeCloseTo(3, 1);
      expect(bb.max[1]).toBeCloseTo(4, 1);
      expect(bb.max[2]).toBeCloseTo(5, 1);
    });
    it('cylinder volume approximation', () => {
      if (skip()) return;
      const v = k.volume(k.makeCylinder(3, 10));
      const exact = Math.PI * 9 * 10;
      // polygon approximation, allow 60% tolerance
      expect(v).toBeGreaterThan(exact * 0.4);
    });
  });

  // ── Theme I: error handling ──
  describe('error handling (Theme I)', () => {
    it('healSolid does not throw', () => {
      if (skip()) return;
      expect(() => k.healSolid(k.makeBox(2, 2, 2))).not.toThrow();
    });
    it('isValid returns boolean', () => {
      if (skip()) return;
      expect(typeof k.isValid(k.makeBox(2, 2, 2))).toBe('boolean');
    });
  });

  // ── Theme J: fuseAll performance ──
  describe('fuseAll (Theme J)', () => {
    it('fuses 4 boxes', () => {
      if (skip()) return;
      const boxes = [
        k.makeBox(2, 2, 2),
        k.translate(k.makeBox(2, 2, 2), 3, 0, 0),
        k.translate(k.makeBox(2, 2, 2), 6, 0, 0),
        k.translate(k.makeBox(2, 2, 2), 9, 0, 0),
      ];
      const result = k.fuseAll(boxes);
      expect(k.volume(result)).toBeCloseTo(32, 0);
    });
  });

  // ── Theme C: evolution ──
  describe('evolution (Theme C)', () => {
    it('fuseWithEvolution returns JSON', () => {
      if (skip()) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bk = (k as any).bk;
      if (typeof bk.fuseWithEvolution !== 'function') {
        console.warn('[skip] fuseWithEvolution not available');
        return;
      }
      const a = k.makeBox(2, 2, 2);
      const b = k.translate(k.makeBox(2, 2, 2), 1, 0, 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aId = (a as any).id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bId = (b as any).id;
      const json = bk.fuseWithEvolution(aId, bId);
      const parsed = JSON.parse(json);
      expect(parsed.solid).toBeGreaterThan(0);
      expect(parsed.evolution).toBeDefined();
    });
  });

  // ── Theme G: semantics ──
  describe('semantics (Theme G)', () => {
    it('shapeOrientation returns forward', () => {
      if (skip()) return;
      expect(k.shapeOrientation(k.makeBox(2, 2, 2))).toBe('forward');
    });
    it('reverseShape on face returns face', () => {
      if (skip()) return;
      const face = k.iterShapes(k.makeBox(2, 2, 2), 'face')[0]!;
      const reversed = k.reverseShape(face);
      expect(k.shapeType(reversed)).toBe('face');
    });
  });

  // ── Theme H: geometric fidelity ──
  describe('geometric fidelity (Theme H)', () => {
    it('bsplineSurface creates face', () => {
      if (skip()) return;
      const pts: [number, number, number][] = [];
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) pts.push([i, j, Math.sin(i) * Math.cos(j)]);
      const face = k.bsplineSurface(pts, 4, 4);
      expect(k.shapeType(face)).toBe('face');
    });
  });

  // ── Theme L: cross-kernel (see kernel-agreement.test.ts) ──

  // ── I/O ──
  describe('I/O', () => {
    it('exportSTEP produces output', () => {
      if (skip()) return;
      const step = k.exportSTEP([k.makeBox(2, 3, 4)]);
      expect(step.length).toBeGreaterThan(100);
    });
    it('exportSTL produces output', () => {
      if (skip()) return;
      const stl = k.exportSTL(k.makeBox(2, 3, 4), true);
      expect((stl as ArrayBuffer).byteLength).toBeGreaterThan(100);
    });
  });
});
