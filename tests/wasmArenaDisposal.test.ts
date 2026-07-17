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
import { readFile, access } from 'node:fs/promises';
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
  cutAll,
  rectangularPattern,
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
  polygon,
  line,
  wire,
  closedWire,
  extrude,
  revolve,
  loft,
  loftAll,
  sweep,
  guidedSweep,
  multiSectionSweep,
  thread,
  convexHull,
  hull,
  linearPattern,
  circularPattern,
  sketchCircle,
  sketchEllipse,
  sketchRectangle,
  Sketcher,
  CompoundSketch,
  isShape3D,
  cone,
  torus,
  ellipsoid,
  drill,
  pocket,
  boss,
  mirrorJoin,
  complexExtrude,
  twistExtrude,
  sketchRoundedRectangle,
  drawCircle,
  section,
  roof,
  surfaceFromGrid,
  createCamera,
  makeProjectedEdges,
  drawProjection,
  createAssemblyNode,
  addChild,
  addMate,
  solveAssembly,
  faceCenter,
  sketchText,
  loadFont,
  getWires,
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
import { subShapeCount, subShapeHashes } from '@/topology/topologyQueryFns.js';
import { adjacentFaceHashes } from '@/topology/adjacencyFns.js';
import { collectInputFaceHashes } from '@/topology/metadata/metadataPropagation.js';
import { setShapeOrigin } from '@/topology/metadata/originTrackingFns.js';
import { checkInterference, checkAllInterferences } from '@/measurement/interferenceFns.js';
import { DisposalScope } from '@/core/disposal.js';
import { makeExternalGear } from '@/gear/index.js';

const isOcctWasm = (process.env['TEST_KERNEL'] ?? 'occt') === 'occt-wasm';
let fontLoaded = false;

beforeAll(async () => {
  await initKernel();
  // Best-effort font load for the sketchText hole-glyph leak regression below.
  for (const p of [
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono.ttf',
    '/usr/share/fonts/adwaita-mono-fonts/AdwaitaMono-Regular.ttf',
    '/usr/share/fonts/TTF/DejaVuSansMono.ttf',
  ]) {
    try {
      await access(p);
      const buf = await readFile(p);
      fontLoaded = isOk(await loadFont(buf.buffer as ArrayBuffer, 'arena-test'));
      break;
    } catch {
      /* try next candidate */
    }
  }
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

    it('checkInterference / checkAllInterferences leave no arena residue (checkpoint bulk-free)', () => {
      // distance() leaves kernel-internal scratch handles brepjs can't free
      // individually; withArenaCheckpoint reclaims them. Without it this grew
      // ~16 slots per pair, O(N^2) across the batch.
      using a = box(10, 10, 10);
      using b0 = box(10, 10, 10);
      using b = translate(b0, [5, 0, 0]);
      expect(
        perIterationLeak(() => {
          checkInterference(a, b);
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          checkAllInterferences([a, b]);
        })
      ).toBe(0);
    });

    it('collectInputFaceHashes (metadata propagation) allocates no face handles', () => {
      // Runs on every WithHistory boolean/transform when inputs carry metadata.
      // Now backed by subShapeHashes, so it reads face hashes without a handle each.
      using b = box(10, 10, 10);
      setShapeOrigin(b, 1); // give it metadata so the collection actually iterates
      expect(
        perIterationLeak(() => {
          collectInputFaceHashes([b]);
        })
      ).toBe(0);
    });

    it('adjacentFaceHashes leaks nothing (native path disposes its owned results)', () => {
      // The native kernel.adjacentFaces returns owned fresh slots; adjacentFaceHashes
      // reads their hashes and disposes them, so nothing survives per call.
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const f0 = getFaces(b)[0];
          if (!f0) throw new Error('box must have a face');
          adjacentFaceHashes(b, f0);
        })
      ).toBe(0);
    });

    it('subShapeCount / subShapeHashes allocate no sub-shape handles', () => {
      // The whole point of the native fast path: read counts/hashes without
      // materialising a handle per sub-shape. Only the `using` box is allocated.
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          subShapeCount(b, 'face');
          subShapeCount(b, 'edge');
          subShapeHashes(b, 'face');
          subShapeHashes(b, 'vertex');
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

  describe('profile builders leak nothing when disposed', () => {
    // Regression: makePolygon built its edges + wire and disposed neither, and
    // makeWireFromMixed (kernel) exploded each input into edge sub-shape slots it
    // never released — 1 leaked slot per edge in *every* wire built from edges.
    it('polygon leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using f = unwrap(
            polygon([
              [0, 0, 0],
              [10, 0, 0],
              [10, 10, 0],
              [0, 10, 0],
            ])
          );
          void f;
        })
      ).toBe(0);
    });

    it('wire (assembleWire) leaks nothing per edge', () => {
      expect(
        perIterationLeak(() => {
          using e1 = line([0, 0, 0], [10, 0, 0]);
          using e2 = line([10, 0, 0], [10, 10, 0]);
          using e3 = line([10, 10, 0], [0, 0, 0]);
          const r = wire([e1, e2, e3]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('construction ops leak nothing when inputs and result are disposed', () => {
    // extrude/revolve/loft/sweep were already clean (castResultShape); these lock
    // that together with the profile-builder fixes above. thread leaked 183/call
    // pre-fix (its ~60 tooth sections × 3 edges each, via makeWireFromMixed +
    // DisposalScope.register calling the no-op .delete() instead of Symbol.dispose).
    it('extrude leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using f = unwrap(
            polygon([
              [0, 0, 0],
              [10, 0, 0],
              [10, 10, 0],
              [0, 10, 0],
            ])
          );
          const r = extrude(f, [0, 0, 10]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('revolve leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using f = unwrap(
            polygon([
              [5, 0, 0],
              [10, 0, 0],
              [10, 0, 10],
              [5, 0, 10],
            ])
          );
          const r = revolve(f, { axis: [0, 0, 1], at: [0, 0, 0] });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('loft leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using f1 = unwrap(
            polygon([
              [0, 0, 0],
              [10, 0, 0],
              [10, 10, 0],
              [0, 10, 0],
            ])
          );
          using f2 = unwrap(
            polygon([
              [0, 0, 20],
              [10, 0, 20],
              [10, 10, 20],
              [0, 10, 20],
            ])
          );
          const w1 = getWires(f1)[0];
          const w2 = getWires(f2)[0];
          if (!w1 || !w2) throw new Error('polygon faces must have wires');
          const r = loft([w1, w2]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('sweep leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using pf = unwrap(
            polygon([
              [-1, -1, 0],
              [1, -1, 0],
              [1, 1, 0],
              [-1, 1, 0],
            ])
          );
          const pw = getWires(pf)[0];
          if (!pw) throw new Error('polygon face must have a wire');
          const profile = unwrap(closedWire(pw));
          using e = line([0, 0, 0], [0, 0, 20]);
          using spine = unwrap(wire([e]));
          const r = sweep(profile, spine);
          if (isOk(r)) {
            const v = unwrap(r);
            if (Array.isArray(v)) {
              v.forEach((s) => {
                s[Symbol.dispose]();
              });
            } else {
              v[Symbol.dispose]();
            }
          }
        })
      ).toBe(0);
    });

    it('thread leaks nothing (was 183 slots/call)', () => {
      expect(
        perIterationLeak(() => {
          const r = thread({ radius: 6, pitch: 2.5, height: 7.5 });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('hull / pattern / gear / canned-sketch ops leak nothing', () => {
    // buildSolidFromFaces (hull/convexHull) leaked each triangle face slot + the
    // pre-orientation intermediate; the pattern fns never disposed their fused
    // copies and the kernel leaked the pattern compound; gear + circle/ellipse
    // sketches leaked their profile wire/edge. All fixed.
    it('convexHull leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          const r = convexHull([
            [0, 0, 0],
            [10, 0, 0],
            [0, 10, 0],
            [0, 0, 10],
            [10, 10, 10],
          ]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('hull leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using a = box(5, 5, 5);
          using b = box(5, 5, 5);
          const r = hull([a, b]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('linearPattern leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(2, 2, 2);
          const r = linearPattern(b, [1, 0, 0], 3, 5);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('circularPattern leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(2, 2, 2);
          const r = circularPattern(b, [0, 0, 1], 4, 360, [10, 0, 0]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('makeExternalGear leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          const r = makeExternalGear({ teeth: 12, moduleSize: 2, thickness: 5 });
          if (isOk(r)) r.value.solid[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('sketchCircle / sketchEllipse leak nothing', () => {
      expect(
        perIterationLeak(() => {
          const s = sketchCircle(5);
          s.wire[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          const s = sketchEllipse(5, 3);
          s.wire[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('positioned primitives + drill leak nothing', () => {
    // A positioned primitive rotates/translates the base solid; occt-wasm returns
    // a fresh slot per move and orphaned the pre-move id (a leak in every non-origin
    // cylinder/sphere/cone/torus). drill never disposed its tool cylinder.
    it('cylinder with at/axis leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using c = cylinder(1, 10, { at: [5, 5, 0], axis: [0, 1, 0] });
          void c;
        })
      ).toBe(0);
    });

    it('centered cylinder leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using c = cylinder(1, 10, { centered: true });
          void c;
        })
      ).toBe(0);
    });

    it('sphere / cone / ellipsoid with position leak nothing', () => {
      expect(
        perIterationLeak(() => {
          using s = sphere(5, { at: [3, 0, 0] });
          void s;
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using c = cone(5, 2, 10, { at: [1, 1, 0], axis: [0, 1, 0] });
          void c;
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using e = ellipsoid(5, 3, 2, { at: [1, 0, 0] });
          void e;
        })
      ).toBe(0);
    });

    it('box with at / centered leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10, { centered: true });
          void b;
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10, { at: [5, 5, 5] });
          void b;
        })
      ).toBe(0);
    });

    it('torus with position leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using t = torus(10, 2, { at: [1, 0, 0], axis: [0, 1, 0] });
          void t;
        })
      ).toBe(0);
    });

    it('drill leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10);
          const r = drill(b, { at: [5, 5, 0], radius: 1, axis: [0, 0, 1] });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('section / roof shed their JS-side intermediates', () => {
    // section's cutting-plane face (4 edges + wire + face) and roof's tooth
    // triangles are all disposed. The former +1/call residual was a downcast
    // artifact: occt-wasm <=3.6 duplicated a slot on the identity downcast in
    // castResultShape, orphaning the pre-downcast source. occt-wasm >=3.7 returns
    // the same slot on an identity downcast, so nothing is orphaned — 0/call.
    it('section leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10, { centered: true });
          const r = section(b, 'XY');
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('surfaceFromGrid leaks nothing (triangulatedSurface tri-faces)', () => {
      const heights = [
        [0, 1, 0],
        [1, 2, 1],
        [0, 1, 0],
      ];
      expect(
        perIterationLeak(() => {
          const r = surfaceFromGrid(heights, { width: 10, depth: 10 });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('roof leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using f = unwrap(
            polygon([
              [0, 0, 0],
              [10, 0, 0],
              [10, 10, 0],
              [0, 10, 0],
            ])
          );
          const w = getWires(f)[0];
          if (!w) throw new Error('polygon face must have a wire');
          const r = roof(unwrap(closedWire(w)));
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('compound-op + sweep-variant + blueprint-sketch ops leak nothing', () => {
    // Follow-up sweep: pocket/boss leaked profile-wire + face + positioned + tool;
    // mirrorJoin leaked the mirrored half; complex/twistExtrude leaked their spine
    // (+ helix + makeSpineWire's edge); blueprint sketchOnPlane leaked every
    // per-curve edge (fixed sketchRoundedRectangle and the pocket/boss profiles).
    it('mirrorJoin leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 5, 5);
          const r = mirrorJoin(b, { normal: [1, 0, 0] });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('pocket / boss leak nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(20, 20, 10, { centered: true });
          const r = pocket(b, { profile: drawCircle(3), depth: 3 });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using b = box(20, 20, 10, { centered: true });
          const r = boss(b, { profile: drawCircle(3), height: 3 });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('complexExtrude / twistExtrude leak nothing', () => {
      expect(
        perIterationLeak(() => {
          using f = unwrap(
            polygon([
              [-5, -5, 0],
              [5, -5, 0],
              [5, 5, 0],
              [-5, 5, 0],
            ])
          );
          const w = getWires(f)[0];
          if (!w) throw new Error('polygon face must have a wire');
          const cw = unwrap(closedWire(w));
          const r = complexExtrude(cw, [0, 0, 0], [0, 0, 10]);
          if (isOk(r)) {
            const v = unwrap(r);
            if (!Array.isArray(v)) v[Symbol.dispose]();
          }
        })
      ).toBe(0);
      expect(
        perIterationLeak(() => {
          using f = unwrap(
            polygon([
              [-5, -5, 0],
              [5, -5, 0],
              [5, 5, 0],
              [-5, 5, 0],
            ])
          );
          const w = getWires(f)[0];
          if (!w) throw new Error('polygon face must have a wire');
          const cw = unwrap(closedWire(w));
          const r = twistExtrude(cw, 90, [0, 0, 0], [0, 0, 10]);
          if (isOk(r)) {
            const v = unwrap(r);
            if (!Array.isArray(v)) v[Symbol.dispose]();
          }
        })
      ).toBe(0);
    });

    it('sketchRoundedRectangle (blueprint sketchOnPlane) leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          const s = sketchRoundedRectangle(10, 8, 2);
          s.wire[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('projection + assembly ops leak nothing', () => {
    // makeProjectedEdges leaked its 6 HLR result compounds (returned edges were
    // borrowed from them); it now manages them and returns independent clones.
    // drawProjection additionally leaked the edges + edgesToDrawing's plane wire.
    // solveAssembly is pure transform math and allocates no shapes.
    it('makeProjectedEdges leaks nothing (with and without hidden lines)', () => {
      const cam = unwrap(createCamera([0, 0, 100], [0, 0, 1]));
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10, { centered: true });
          const { visible, hidden } = makeProjectedEdges(b, cam, true);
          for (const e of visible) e[Symbol.dispose]();
          for (const e of hidden) e[Symbol.dispose]();
        })
      ).toBe(0);
      // withHiddenLines=false must still dispose the (always-allocated) hidden
      // result compounds — the `hidden` array is empty and needs no disposal.
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10, { centered: true });
          const { visible } = makeProjectedEdges(b, cam, false);
          for (const e of visible) e[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('drawProjection leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(10, 10, 10, { centered: true });
          drawProjection(b, 'front');
        })
      ).toBe(0);
    });

    it('solveAssembly leaks nothing', () => {
      using b1 = box(10, 10, 10);
      using b2 = box(6, 6, 6);
      const topByZ = (fs: ReturnType<typeof getFaces>, top: boolean) =>
        fs.reduce((best, f) =>
          (top ? faceCenter(f)[2] > faceCenter(best)[2] : faceCenter(f)[2] < faceCenter(best)[2])
            ? f
            : best
        );
      const f1 = getFaces(b1);
      const f2 = getFaces(b2);
      const topB1 = topByZ(f1, true);
      const botB2 = topByZ(f2, false);
      let asm = createAssemblyNode('root');
      asm = addChild(asm, createAssemblyNode('base', { shape: b1 }));
      asm = addChild(asm, createAssemblyNode('top', { shape: b2 }));
      asm = addMate(asm, { type: 'fixed', entity: { node: 'base' } });
      asm = addMate(asm, {
        type: 'coincident',
        entityA: { node: 'base', face: topB1 },
        entityB: { node: 'top', face: botB2 },
      });
      expect(perIterationLeak(() => void solveAssembly(asm))).toBe(0);
      for (const f of f1) f[Symbol.dispose]();
      for (const f of f2) f[Symbol.dispose]();
    });
  });

  describe('boolean variants leak nothing', () => {
    // fuseAll + drill are covered above. cutAll (batch cut) routes through
    // castToShape3D, which disposes the downcast source on both paths — clean.
    // rectangularPattern leaked its translated copies (3/call for a 2x2 grid),
    // handed to the immutable fuseAll but never disposed — now released.
    it('cutAll leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using base = box(20, 20, 20);
          using i1 = box(3, 3, 30);
          using t1 = translate(i1, [5, 5, 0]);
          using i2 = box(3, 3, 30);
          using t2 = translate(i2, [12, 12, 0]);
          const r = cutAll(base, [t1, t2]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('rectangularPattern leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using b = box(2, 2, 2);
          const r = rectangularPattern(b, {
            xDir: [1, 0, 0],
            xCount: 2,
            xSpacing: 5,
            yDir: [0, 1, 0],
            yCount: 2,
            ySpacing: 5,
          });
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });
  });

  describe('sweep / loft variants leak nothing', () => {
    // guidedSweep + loftAll were already clean (castResultShape; loftAll disposes
    // its makeVertex temporaries via kernel.dispose). multiSectionSweep leaked its
    // per-section positionOnCurve + downcast wires (4/call for 2 sections) — now
    // released once loftAdvanced has consumed them.
    const squareWire = (z: number, r: number) => {
      const f = unwrap(
        polygon([
          [-r, -r, z],
          [r, -r, z],
          [r, r, z],
          [-r, r, z],
        ])
      );
      const w = getWires(f)[0];
      if (!w) throw new Error('polygon face must have a wire');
      return { face: f, wire: w };
    };

    it('guidedSweep leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using pf = squareWire(0, 1).face;
          const pw = getWires(pf)[0];
          if (!pw) throw new Error('no wire');
          const profile = unwrap(closedWire(pw));
          using se = line([0, 0, 0], [0, 0, 20]);
          using spine = unwrap(wire([se]));
          using ge = line([3, 0, 0], [3, 0, 20]);
          using guide = unwrap(wire([ge]));
          const r = guidedSweep(profile, spine, [guide]);
          if (isOk(r)) unwrap(r)[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('loftAll leaks nothing (with start/end points)', () => {
      expect(
        perIterationLeak(() => {
          using f1 = squareWire(0, 5).face;
          using f2 = squareWire(20, 5).face;
          const w1 = getWires(f1)[0];
          const w2 = getWires(f2)[0];
          if (!w1 || !w2) throw new Error('no wires');
          const r = loftAll([
            { wires: [w1, w2], ruled: true, startPoint: [0, 0, -5], endPoint: [0, 0, 25] },
          ]);
          if (isOk(r)) for (const s of unwrap(r)) s[Symbol.dispose]();
        })
      ).toBe(0);
    });

    it('multiSectionSweep leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          using f1 = squareWire(0, 2).face;
          using f2 = squareWire(0, 3).face;
          const w1 = getWires(f1)[0];
          const w2 = getWires(f2)[0];
          if (!w1 || !w2) throw new Error('no wires');
          using se = line([0, 0, 0], [0, 0, 20]);
          using spine = unwrap(wire([se]));
          const r = multiSectionSweep(
            [
              { wire: w1, location: 0 },
              { wire: w2, location: 1 },
            ],
            spine
          );
          if (isOk(r)) {
            const v = unwrap(r);
            if (Array.isArray(v)) v.forEach((s) => s[Symbol.dispose]());
            else v[Symbol.dispose]();
          }
        })
      ).toBe(0);
    });
  });

  describe('sketch facade extrude/revolve/loft leak nothing', () => {
    // The facade consumes the sketch via Sketch.delete() — a no-op on occt-wasm —
    // and sketchExtrude/sketchRevolve/compoundSketchFace never disposed their
    // intermediate faces. Fixed: Sketch.delete() routes through Symbol.dispose and
    // the faces are disposed after extrude/revolve.
    it('Sketch.extrude leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          const s = sketchRectangle(10, 20).extrude(5);
          const ok = isShape3D(s);
          s[Symbol.dispose]();
          if (!ok) throw new Error('not 3d');
        })
      ).toBe(0);
    });

    it('Sketch.revolve leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          const s = new Sketcher('XZ')
            .movePointerTo([5, 0])
            .hLine(5)
            .vLine(5)
            .hLine(-5)
            .close()
            .revolve([0, 0, 1]);
          const ok = isShape3D(s);
          s[Symbol.dispose]();
          if (!ok) throw new Error('not 3d');
        })
      ).toBe(0);
    });

    it('Sketch.loftWith leaks nothing', () => {
      expect(
        perIterationLeak(() => {
          const a = sketchRectangle(10, 10);
          const b = sketchRectangle(6, 6, { plane: 'XY', origin: [0, 0, 20] });
          const s = a.loftWith(b);
          const ok = isShape3D(s);
          s[Symbol.dispose]();
          if (!ok) throw new Error('not 3d');
        })
      ).toBe(0);
    });

    it('CompoundSketch.extrude / revolve leak nothing', () => {
      expect(
        perIterationLeak(() => {
          const cs = new CompoundSketch([sketchRectangle(20, 20), sketchRectangle(8, 8)]);
          const s = cs.extrude(5);
          const ok = isShape3D(s);
          s[Symbol.dispose]();
          for (const sub of cs.sketches) sub.wire[Symbol.dispose]();
          if (!ok) throw new Error('not 3d');
        })
      ).toBe(0);
    });

    it('CompoundSketch.loftWith leaks nothing (makeSolid + weldShapes)', () => {
      const mk = (z: number) =>
        new CompoundSketch([
          sketchRectangle(20, 20, { plane: 'XY', origin: [0, 0, z] }),
          sketchRectangle(8, 8, { plane: 'XY', origin: [0, 0, z] }),
        ]);
      expect(
        perIterationLeak(() => {
          const cs1 = mk(0);
          const cs2 = mk(20);
          const s = cs1.loftWith(cs2);
          const ok = isShape3D(s);
          s[Symbol.dispose]();
          for (const sub of cs1.sketches) sub.wire[Symbol.dispose]();
          for (const sub of cs2.sketches) sub.wire[Symbol.dispose]();
          if (!ok) throw new Error('not 3d');
        })
      ).toBe(0);
    });
  });

  describe('sketchText is leak-free; CompoundSketch.wires is a disposable resource', () => {
    // sketchText itself allocates no leaking slots — earlier "hole-glyph residual"
    // reports were a probe artifact from reading the side-effecting `.wires` getter
    // (which allocates a fresh compound via makeCompound) without disposing it.
    // A hole glyph ('O') returns a CompoundSketch; dispose its per-contour wires.
    const disposeContourWires = (s: { sketches: unknown[] }): void => {
      const d = (v: unknown): void => {
        const disp = (v as { [Symbol.dispose]?: () => void })[Symbol.dispose];
        if (typeof disp === 'function') disp.call(v);
      };
      for (const item of s.sketches) {
        const sub = (item as { sketches?: { wire?: unknown }[] }).sketches ?? [
          item as { wire?: unknown },
        ];
        for (const one of sub) d(one.wire);
      }
    };

    it('sketchText hole glyph leaks nothing when disposed', (ctx) => {
      if (!fontLoaded) return ctx.skip();
      expect(
        perIterationLeak(() => {
          const s = sketchText('O', { fontFamily: 'arena-test', fontSize: 16 });
          disposeContourWires(s);
        })
      ).toBe(0);
    });

    it('CompoundSketch.wires compound is disposable to baseline', (ctx) => {
      if (!fontLoaded) return ctx.skip();
      expect(
        perIterationLeak(() => {
          const s = sketchText('O', { fontFamily: 'arena-test', fontSize: 16 }) as unknown as {
            sketches: {
              wires?: { [Symbol.dispose](): void };
              sketches?: { wire?: { [Symbol.dispose](): void } }[];
            }[];
          };
          for (const item of s.sketches) {
            // reading `.wires` allocates a fresh compound — the caller owns it
            item.wires?.[Symbol.dispose]();
            for (const one of item.sketches ?? []) one.wire?.[Symbol.dispose]();
          }
        })
      ).toBe(0);
    });

    it('Sketches.wires() leaks only its own (disposable) compound', (ctx) => {
      if (!fontLoaded) return ctx.skip();
      // Regression: wires() previously read each CompoundSketch's allocating
      // `.wires` getter and dropped those intermediate compounds — leaking one per
      // hole glyph even when the caller disposed the result. It now flattens to
      // borrowed sub-wires, so disposing the returned compound returns to baseline.
      expect(
        perIterationLeak(() => {
          const s = sketchText('O', { fontFamily: 'arena-test', fontSize: 16 });
          using combined = s.wires();
          void combined;
          // dispose the sketch's own contour wires too; only wires()'s unreachable
          // intermediate (the old bug) could survive this — the new code has none.
          disposeContourWires(s);
        })
      ).toBe(0);
    });
  });

  describe('disposal is real, not a no-op', () => {
    it('DisposalScope.register frees a registered shape via kernel.dispose', () => {
      // register() historically called the no-op .delete(); a shape registered
      // for scope cleanup leaked on occt-wasm. It now routes through Symbol.dispose.
      const before = arenaCount();
      {
        using scope = new DisposalScope();
        scope.register(box(10, 10, 10));
        expect(arenaCount()).toBeGreaterThan(before);
      }
      expect(arenaCount()).toBe(before);
    });

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

describe.skipIf(!isOcctWasm)('occt-wasm arena checkpoint / releaseSince bulk-free', () => {
  it('restoreCheckpoint frees every slot allocated since the mark in one call', () => {
    const kernel = getKernel();
    const baseline = arenaCount();
    const cp = kernel.checkpoint();
    expect(cp).toBeGreaterThanOrEqual(0);
    // Allocate a batch of intermediates, disposing none of them.
    for (let i = 0; i < 15; i++) box(1 + i, 1, 1);
    expect(arenaCount()).toBeGreaterThan(baseline);
    // A single releaseSince reclaims the whole batch.
    kernel.restoreCheckpoint(cp);
    expect(arenaCount()).toBe(baseline);
  });

  it('checkpointCount tracks open marks; discardCheckpoint keeps the handles', () => {
    const kernel = getKernel();
    const before = kernel.checkpointCount();
    const cp = kernel.checkpoint();
    expect(kernel.checkpointCount()).toBe(before + 1);
    using b = box(10, 10, 10);
    const held = arenaCount();
    kernel.discardCheckpoint(cp);
    expect(kernel.checkpointCount()).toBe(before);
    // Discard reclaims nothing — the shape stays live and meshable.
    expect(arenaCount()).toBe(held);
    expect(getFaces(b).length).toBe(6);
  });

  it('nested checkpoints restore independently (LIFO)', () => {
    const kernel = getKernel();
    const before = kernel.checkpointCount();
    const baseline = arenaCount();
    const outer = kernel.checkpoint();
    box(2, 2, 2);
    const inner = kernel.checkpoint();
    box(3, 3, 3);
    kernel.restoreCheckpoint(inner); // frees only the inner box
    expect(arenaCount()).toBeGreaterThan(baseline);
    expect(kernel.checkpointCount()).toBe(before + 1);
    kernel.restoreCheckpoint(outer); // frees the outer box too
    expect(arenaCount()).toBe(baseline);
    expect(kernel.checkpointCount()).toBe(before);
  });

  it('restoreCheckpoint rejects a stale/unknown mark instead of erasing live handles', () => {
    const kernel = getKernel();
    const cp = kernel.checkpoint();
    kernel.restoreCheckpoint(cp); // cp is now closed
    // Restoring it again — or any fabricated mark — must throw, not silently
    // releaseSince over unrelated live arena handles.
    expect(() => {
      kernel.restoreCheckpoint(cp);
    }).toThrow();
    expect(() => {
      kernel.restoreCheckpoint(-1);
    }).toThrow();
  });
});
