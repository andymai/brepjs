/**
 * occt-wasm arena disposal — proves `using`/Symbol.dispose actually reclaims
 * arena slots on the occt-wasm kernel.
 *
 * occt-wasm shapes are arena-allocated: a handle's own `.delete()` is a no-op,
 * so a slot is only reclaimed via `kernel.dispose()` (→ `k.release(id)`).
 * `createHandle` routes disposal through the kernel, so a `using`-scoped shape
 * frees its slot. `getShapeCount()` is the ground-truth oracle — the JS-side
 * `getDisposalStats().liveHandles` is blind to orphaned pre-downcast slots.
 *
 * Gated to occt-wasm: no other kernel exposes the arena counter (brepkit is a
 * no-free arena; occt/manifold have different memory models).
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  cylinder,
  sphere,
  translate,
  clone,
  cut,
  fuse,
  intersect,
  fuseAll,
  compound,
  fillet,
  chamfer,
  shell,
  offset,
  thicken,
  rotate,
  mirror,
  scale,
  applyMatrix,
  locate,
  getFaces,
  getEdges,
  getVertices,
  getShells,
  fixShape,
  solidFromShell,
  autoHeal,
  edgesOfFace,
  verticesOfFace,
  facesOfEdge,
  adjacentFaces,
  sharedEdges,
  measureVolume,
  isOk,
  unwrap,
} from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import { getKernel } from '@/kernel/index.js';

const isOcctWasm = (process.env['TEST_KERNEL'] ?? 'occt') === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** occt-wasm's live-shape arena counter, the ground-truth leak oracle. */
function arenaCount(): number {
  const adapter = getKernel() as unknown as {
    retainedKernelOwner?: { getRawKernel?: () => { getShapeCount?: () => number } };
  };
  const raw = adapter.retainedKernelOwner?.getRawKernel?.();
  const n = typeof raw?.getShapeCount === 'function' ? raw.getShapeCount() : undefined;
  if (typeof n !== 'number') throw new Error('arena counter unavailable');
  return n;
}

function disposeAll(arr: AnyShape<Dimension>[]): void {
  for (const h of arr) h[Symbol.dispose]();
}

/** Run `op` once to warm caches, then N times; return net arena growth per iteration. */
function perIterationLeak(op: () => void, iterations = 20): number {
  op();
  const before = arenaCount();
  for (let i = 0; i < iterations; i++) op();
  return (arenaCount() - before) / iterations;
}

describe.skipIf(!isOcctWasm)('occt-wasm arena disposal', () => {
  describe('using-scoped ops reclaim their arena slots', () => {
    it('primitives leak nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          void b;
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using c = cylinder(5, 10);
          void c;
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using s = sphere(5);
          void s;
        })
      ).toBe(0);
    });

    it('transform leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          using m = translate(b, [1, 0, 0]);
          void m;
        })
      ).toBe(0);
    });

    it('sub-shape extraction (getFaces/getEdges) leaks nothing when disposed', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          for (const f of getFaces(b)) f[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          for (const e of getEdges(b)) e[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('clone leaks nothing when disposed', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = clone(b);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('booleans leak nothing when inputs and result are disposed', () => {
      // Every intermediate is `using`-disposed; the only survivor would be a
      // leak inside the boolean itself. (An undisposed intermediate here would
      // read as a false "+1" — the arena counter sees the whole arena.)
      expect(
        perIterationLeak(() => {
          using a = box(10, 10, 10);
          using inner = box(5, 5, 20);
          using tool = translate(inner, [3, 3, 0]);
          const r = cut(a, tool);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using a = box(10, 10, 10);
          using inner = box(5, 5, 20);
          using tool = translate(inner, [3, 3, 0]);
          const r = fuse(a, tool);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using a = box(10, 10, 10);
          using inner = box(5, 5, 20);
          using tool = translate(inner, [3, 3, 0]);
          const r = intersect(a, tool);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('N-way and multi-solid-tool booleans leak nothing', () => {
      expect(
        perIterationLeak(() => {
          using b1 = box(10, 10, 10);
          using i2 = box(10, 10, 10);
          using b2 = translate(i2, [5, 0, 0]);
          using i3 = box(10, 10, 10);
          using b3 = translate(i3, [10, 0, 0]);
          const r = fuseAll([b1, b2, b3]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using a = box(20, 20, 20);
          using i1 = box(3, 3, 30);
          using i2 = box(3, 3, 30);
          using pillar2 = translate(i2, [8, 0, 0]);
          using tool = compound([i1, pillar2]);
          const r = cut(a, tool);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('adjacency queries leak nothing per call (warm cache)', () => {
      // Shared parent with a warm adjacency cache: each query's per-call
      // allocation must return to baseline. The parent + borrowed sub-shape
      // handles are intentionally kept alive for the duration.
      const parent = box(10, 10, 10);
      const faces = getFaces(parent);
      const edges = getEdges(parent);
      const f0 = faces[0];
      const f1 = faces[1];
      const e0 = edges[0];
      if (!f0 || !f1 || !e0) throw new Error('box must have faces and edges');

      expect(
        perIterationLeak(() => {
          disposeAll(edgesOfFace(f0));
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          disposeAll(verticesOfFace(f0));
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          disposeAll(facesOfEdge(parent, e0));
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          disposeAll(adjacentFaces(parent, f0));
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          disposeAll(sharedEdges(f0, f1));
        })
      ).toBe(0);

      disposeAll(faces);
      disposeAll(edges);
      parent[Symbol.dispose]();
    });
  });

  describe('disposing a parent releases its cached topology', () => {
    it('a warm topology + adjacency cache is freed with the parent', () => {
      // No manual disposal of the borrowed sub-shape handles — the parent's
      // disposal must release the whole cache (extractors + adjacency maps).
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          getFaces(b);
          getEdges(b);
          getVertices(b);
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const es = getEdges(b);
          const fs = getFaces(b);
          const e0 = es[0];
          const f0 = fs[0];
          if (!e0 || !f0) throw new Error('box must have edges and faces');
          disposeAll(facesOfEdge(b, e0));
          disposeAll(adjacentFaces(b, f0));
        })
      ).toBe(0);
    });
  });

  describe('healing ops leak nothing', () => {
    it('fixShape / solidFromShell / autoHeal return the arena to baseline', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = fixShape(b);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const shells = getShells(b);
          const s0 = shells[0];
          if (s0) {
            const r = solidFromShell(s0);
            if (isOk(r)) unwrap(r)[Symbol.dispose]();
          }
          disposeAll(shells);
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = autoHeal(b);
          if (isOk(r)) r.value.shape[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('modifier ops leak nothing when inputs and result are disposed', () => {
    // Modifiers return a fresh solid whose orphaned pre-downcast slot is released
    // by castResultShape/finalizeShape3D; the caller disposes the final result and
    // the source box. Any survivor is a leak inside the modifier itself.
    // draft/variableFillet are excluded: they don't run on occt-wasm (brepkit-only
    // / divergent), so their success path can't be exercised by this oracle.
    it('fillet leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = fillet(b, 1);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('chamfer leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = chamfer(b, 1);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('shell leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const f0 = getFaces(b)[0];
          if (!f0) throw new Error('box must have faces');
          const r = shell(b, [f0], 1);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('offset leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = offset(b, 1);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('thicken leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const f0 = getFaces(b)[0];
          if (!f0) throw new Error('box must have faces');
          const r = thicken(f0, 1);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('transform ops leak nothing when inputs and result are disposed', () => {
    // rotate/mirror/scale return a fresh shape directly (evolution metadata is
    // propagated, not retained); applyMatrix/locate return via castResultShape.
    // translate is covered above; these are its siblings.
    it('rotate leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          using r = rotate(b, 30, [0, 0, 0], [0, 0, 1]);
          void r;
        })
      ).toBe(0);
    });

    it('mirror leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          using r = mirror(b, [0, 1, 0], [0, 0, 0]);
          void r;
        })
      ).toBe(0);
    });

    it('scale leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          using r = scale(b, 2, [0, 0, 0]);
          void r;
        })
      ).toBe(0);
    });

    it('applyMatrix leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = applyMatrix(b, [
            [1, 0, 0, 5],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1],
          ]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('locate leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          using r = locate(b, { type: 'translate', v: [5, 0, 0] });
          void r;
        })
      ).toBe(0);
    });
  });

  describe('disposal is real, not a no-op', () => {
    it('creating then disposing a box returns the arena to baseline', () => {
      const before = arenaCount();
      const b = box(10, 10, 10);
      expect(arenaCount()).toBeGreaterThan(before);
      b[Symbol.dispose]();
      expect(arenaCount()).toBe(before);
    });
  });

  describe('clone is independent of its source (PR-1 + PR-2 integration)', () => {
    it('disposing a clone does not free the original', () => {
      using original = box(10, 10, 10);
      const cloned = unwrap(clone(original));
      cloned[Symbol.dispose]();
      // Source must survive the clone's disposal — before the copyShape fix the
      // clone aliased the source's arena slot, so this freed the original.
      expect(unwrap(measureVolume(original))).toBeCloseTo(1000, 0);
    });
  });
});
