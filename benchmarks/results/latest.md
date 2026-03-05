# brepkit-wasm vs OCCT Kernel Comparison

**Date:** 2026-03-04
**brepkit-wasm version:** 0.4.0
**Test:** `benchmarks/kernel-comparison.bench.test.ts`
**Environment:** Node.js 24, Linux (x86_64), 5 iterations per benchmark

---

## Results

### Primitives

| Benchmark                    | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup         |
| ---------------------------- | -------- | ----------- | --------- | -------- | --------------- |
| [occt] makeBox(10,20,30)     | 4.7      | 4.9         | 5.4       | 6.6      | —               |
| [brepkit] makeBox(10,20,30)  | 0.2      | 0.2         | 0.4       | 0.7      | **25x faster**  |
| [occt] makeCylinder(5,20)    | 2.1      | 2.3         | 2.3       | 2.4      | —               |
| [brepkit] makeCylinder(5,20) | 0.1      | 0.1         | 0.1       | 0.1      | **23x faster**  |
| [occt] makeSphere(10)        | 1.3      | 1.3         | 1.4       | 1.5      | —               |
| [brepkit] makeSphere(10)     | 0.4      | 0.5         | 0.8       | 2.2      | **2.6x faster** |

### Booleans

| Benchmark                       | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup            |
| ------------------------------- | -------- | ----------- | --------- | -------- | ------------------ |
| [occt] fuse(box,box)            | 80.1     | 83.2        | 83.4      | 86.9     | —                  |
| [brepkit] fuse(box,box)         | 1.1      | 1.2         | 1.2       | 1.3      | **69x faster**     |
| [occt] cut(box,cyl)             | 120.8    | 122.8       | 123.1     | 125.6    | —                  |
| [brepkit] cut(box,cyl)          | 75.9     | 76.4        | 77.4      | 81.4     | **1.6x faster**    |
| [occt] intersect(box,sphere)    | 106.1    | 106.3       | 106.4     | 106.7    | —                  |
| [brepkit] intersect(box,sphere) | 16621.4  | 16677.4     | 16680.4   | 16762.2  | ⚠️ **157x SLOWER** |

> **Critical finding:** brepkit's `intersect` with sphere geometry is catastrophically slow (16.7s vs 106ms).
> This appears to be a missing analytic fast-path for curved surface intersection. OCCT has specialized
> `BRepAlgoAPI_Common` paths for plane×sphere, cylinder×plane, etc. brepkit appears to fall back to a
> general mesh-based or NURBS solver for this case.

### Transforms

| Benchmark                 | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup         |
| ------------------------- | -------- | ----------- | --------- | -------- | --------------- |
| [occt] translate ×1000    | 66.8     | 69.9        | 69.4      | 70.8     | —               |
| [brepkit] translate ×1000 | 16.4     | 16.5        | 16.6      | 16.9     | **4.2x faster** |
| [occt] rotate ×100        | 7.2      | 7.3         | 7.4       | 7.9      | —               |
| [brepkit] rotate ×100     | 1.7      | 1.8         | 1.8       | 2.0      | **4.1x faster** |

### Meshing

| Benchmark                        | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup        |
| -------------------------------- | -------- | ----------- | --------- | -------- | -------------- |
| [occt] mesh box (tol=0.1)        | 0.8      | 0.8         | 0.8       | 0.9      | —              |
| [brepkit] mesh box (tol=0.1)     | 0.0      | 0.0         | 0.1       | 0.3      | **>8x faster** |
| [occt] mesh sphere (tol=0.01)    | 61.4     | 61.8        | 62.0      | 62.9     | —              |
| [brepkit] mesh sphere (tol=0.01) | 0.8      | 0.8         | 0.9       | 0.9      | **77x faster** |

### Measurement

| Benchmark                  | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup         |
| -------------------------- | -------- | ----------- | --------- | -------- | --------------- |
| [occt] volume ×100         | 7.8      | 7.9         | 7.9       | 8.1      | —               |
| [brepkit] volume ×100      | 0.4      | 0.4         | 0.4       | 0.4      | **20x faster**  |
| [occt] boundingBox ×100    | 2.5      | 2.6         | 2.6       | 2.7      | —               |
| [brepkit] boundingBox ×100 | 0.3      | 0.3         | 0.3       | 0.3      | **8.7x faster** |

### I/O

| Benchmark                | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup        |
| ------------------------ | -------- | ----------- | --------- | -------- | -------------- |
| [occt] exportSTEP ×10    | 19.4     | 20.3        | 20.8      | 22.4     | —              |
| [brepkit] exportSTEP ×10 | 0.8      | 0.9         | 0.9       | 1.1      | **22x faster** |

### End-to-end Model

| Benchmark                     | Min (ms) | Median (ms) | Mean (ms) | Max (ms) | Speedup            |
| ----------------------------- | -------- | ----------- | --------- | -------- | ------------------ |
| [occt] multi-boolean model    | 52.3     | 53.0        | 53.1      | 53.7     | —                  |
| [brepkit] multi-boolean model | 270.2    | 272.5       | 272.7     | 274.5    | ⚠️ **5.1x SLOWER** |

> **Note:** The multi-boolean model cuts 4 cylinder holes into a box plate (9 sequential `cut` calls).
> Each brepkit `cut` (~30ms) is faster than OCCT (~14ms per step), but the cumulative overhead
> suggests arena memory growth or non-incremental re-allocation between operations.

> **Note:** `box+chamfer` and `box+fillet` benchmarks failed with both kernels. The benchmark calls
> `k.chamfer(box, k.iterShapes(box, 'edge'), 1)` which passes raw `TopoDS_Shape` handles where
> `TopoDS_Edge` is required — a pre-existing bug in the benchmark, not a kernel regression.

---

## Coverage Gap Analysis

`BrepkitAdapter` v0.4.0 implements all methods in the `KernelAdapter` interface. The class-level
doc comment ("not yet implemented: \*WithHistory, Kernel2D") is **outdated** — both features are
present in the codebase:

- **`*WithHistory` methods**: Implemented via `buildEvolution()` helper. For transforms, this
  returns identity face mappings (arena IDs are stable across transforms). For booleans, it uses
  `fuseWithEvolution?`/`cutWithEvolution?` WASM methods when available, with a JS fallback.
- **`Kernel2DCapability`**: Implemented in pure TypeScript in `brepkit2d.ts` — no WASM calls needed.

### Methods with known limitations

| Method                        | Status                | Notes                                                                                                                                           |
| ----------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `intersect` (curved geometry) | ⚠️ Severe regression  | 16.7s for box∩sphere; likely missing analytic fast-path                                                                                         |
| `meshEdges`                   | ⚠️ Stub               | Returns empty result; brepkit doesn't expose per-edge tessellation                                                                              |
| `section`                     | Limited               | Only works with planar section planes (extracts plane from face)                                                                                |
| `importSTEP` / `importIGES`   | Unverified            | STEP/IGES output format compatibility with OCCT not validated                                                                                   |
| `chamferDistAngle`            | Unverified            | Uses fixed dist=distance, angle not applied (brepkit API gap)                                                                                   |
| `volume` / `area` (curved)    | ⚠️ Tessellation error | brepkit uses tessellation-based measurement (not analytic). Cone volume error=228%, cut(box,cyl) error=8.1%. OCCT uses exact analytic geometry. |

---

## Verdict: Not Ready as Default Kernel Replacement

brepkit-wasm 0.4.0 shows strong performance for analytic geometry (primitives, flat-face booleans,
meshing, transforms, measurement) but has critical regressions:

1. **`intersect` with spheres**: 157x slower — would break any workflow using curved-body intersection
2. **Complex multi-boolean models**: 5x slower — gridfinity-style patterns would regress severely
3. **Geometric correctness**: Not yet validated against OCCT (see `tests/brepkit-validation.test.ts`)

**Recommendation:** brepkit-wasm is viable as an opt-in secondary kernel for specific workloads
(flat-face booleans, large-scale meshing, simple transforms), but cannot replace OCCT as the default
without resolving the curved-geometry intersection performance issue.
