# OCCT V8.0.0 RC4 Benchmark Baseline

**Date:** 2026-03-24
**OCCT:** V8.0.0 RC4
**Emscripten:** 5.0.3
**WASM size:** 19.2 MB (single build)

> V8 improvements vs V7 (per taucad benchmarks): 22-31% faster booleans, 16-19% faster fillets, 23-29% faster complex models.

## Results

| Artifact | Size (MB) | Size (KB) | Bytes |
| [occt] makeBox(10,20,30) | 14.8 | 15.7 | 15.8 | 0.78 | 16.8 | 4.3% | 5 |
| [occt] makeCylinder(5,20) | 5.2 | 5.3 | 5.9 | 1.40 | 7.8 | 20.6% | 5 |
| [occt] makeSphere(10) | 3.3 | 3.4 | 3.4 | 0.07 | 3.5 | 1.9% | 5 |
| cold: import glue JS | 44.0 | 44.0 | 44.0 | 0.00 | 44.0 | 0.0% | 1 |
| cold: WASM compile+instantiate | 142.8 | 142.8 | 142.8 | 0.00 | 142.8 | 0.0% | 1 |
| cold: initFromOC (adapter) | 0.2 | 0.2 | 0.2 | 0.00 | 0.2 | 0.0% | 1 |
| cold: first box() | 462.0 | 462.0 | 462.0 | 0.00 | 462.0 | 0.0% | 1 |
| cold: first mesh() | 15.5 | 15.5 | 15.5 | 0.00 | 15.5 | 0.0% | 1 |
| cold: TOTAL start → first mesh | 664.5 | 664.5 | 664.5 | 0.00 | 664.5 | 0.0% | 1 |
| warm: WASM re-instantiate | 163.7 | 163.7 | 163.7 | 0.00 | 163.7 | 0.0% | 1 |
| warm: TOTAL re-init → first mesh | 168.1 | 168.1 | 168.1 | 0.00 | 168.1 | 0.0% | 1 |
| [occt] getEdges(box) | 0.5 | 0.6 | 0.6 | 0.03 | 0.6 | 5.1% | 5 |
| [occt] getFaces(box) | 0.4 | 0.5 | 0.5 | 0.02 | 0.5 | 3.8% | 5 |
| [occt] getEdges(fused) | 21.1 | 24.4 | 24.5 | 2.85 | 28.1 | 10.2% | 5 |
| [occt] getFaces(fused) | 17.8 | 20.6 | 20.5 | 2.50 | 23.3 | 10.7% | 5 |
| [occt] box+cylinder fuse | 20.9 | 21.5 | 22.0 | 1.44 | 24.0 | 5.7% | 5 |
| [occt] box-sphere cut | 10.1 | 11.3 | 11.1 | 0.72 | 11.8 | 5.7% | 5 |
| [occt] cylinder intersect | 44.2 | 46.8 | 48.5 | 5.59 | 56.0 | 10.1% | 5 |
| [occt] edgeFinder cold (box) | 0.3 | 0.4 | 0.4 | 0.02 | 0.4 | 5.7% | 5 |
| [occt] edgeFinder cached 10x (box) | 0.4 | 0.4 | 0.4 | 0.01 | 0.4 | 2.3% | 5 |
| [occt] faceFinder cold (fused) | 17.1 | 17.7 | 17.9 | 1.00 | 19.2 | 4.9% | 5 |
| [occt] faceFinder cached 10x (fused) | 16.6 | 17.6 | 17.8 | 0.89 | 18.8 | 4.4% | 5 |
| [occt] all topo queries (box) | 0.4 | 0.4 | 0.5 | 0.14 | 0.6 | 26.5% | 5 |
| [occt] adjacentFaces 6x (box) | 0.6 | 0.7 | 0.7 | 0.10 | 0.8 | 12.0% | 5 |
| [occt] edge mesh box | 2.5 | 2.6 | 2.7 | 0.14 | 2.9 | 4.4% | 5 |
| [occt] edge mesh fused | 60.5 | 62.3 | 62.8 | 2.45 | 66.0 | 3.4% | 5 |
| [occt] edge mesh cached | 53.6 | 54.0 | 54.9 | 1.70 | 57.0 | 2.7% | 5 |
| [occt] box() x100 (create+dispose) | 15.7 | 16.2 | 16.4 | 0.75 | 17.4 | 4.0% | 5 |
| [occt] mesh sphere cold (triangulate+extract) | 37.3 | 37.4 | 37.8 | 0.66 | 38.7 | 1.5% | 5 |
| [occt] mesh sphere hot (extract only) | 0.0 | 0.0 | 0.0 | 0.00 | 0.0 | 62.7% | 5 |
| [occt] measureVolume+Area x20 (per-shape) | 0.0 | 0.0 | 0.0 | 0.00 | 0.0 | 36.4% | 5 |
| [occt] getEdges + measureLength per edge | 0.0 | 0.0 | 0.0 | 0.00 | 0.0 | 68.1% | 5 |
| [occt] translate x100 | 33.3 | 33.3 | 37.9 | 6.96 | 47.3 | 16.1% | 5 |
| [occt] rotate x100 | 29.9 | 31.7 | 31.5 | 1.40 | 33.0 | 3.9% | 5 |
| [occt] scale x100 | 26.5 | 28.8 | 28.7 | 1.67 | 30.6 | 5.1% | 5 |
| [occt] getBounds x200 | 0.2 | 0.2 | 0.2 | 0.01 | 0.3 | 5.1% | 5 |
| [occt] box+cyl fuse | 17.9 | 18.9 | 19.4 | 1.83 | 21.9 | 8.3% | 5 |
| [occt] box-sphere cut | 8.7 | 9.4 | 9.5 | 0.52 | 10.1 | 4.8% | 5 |
| [occt] getFaces+getEdges x50 | 411.0 | 413.0 | 416.4 | 7.68 | 424.0 | 2.1% | 3 |
| [occt] getBounds x1000 same | 0.3 | 0.4 | 0.4 | 0.06 | 0.5 | 13.5% | 5 |
| [occt] getBounds x50 unique | 11.3 | 13.2 | 13.1 | 1.14 | 14.1 | 7.6% | 5 |
| [occt] faceFinder.findAll | 17.6 | 20.2 | 20.8 | 2.57 | 24.7 | 7.7% | 10 |
| [occt] meshEdges fused | 23.6 | 25.7 | 25.4 | 1.04 | 26.2 | 3.6% | 5 |
| [occt] meshEdges 4-hole | 183.2 | 188.0 | 188.9 | 6.15 | 194.7 | 3.7% | 3 |
| [occt] translate x200 no-origins | 53.0 | 53.6 | 53.7 | 0.58 | 54.4 | 0.9% | 5 |
| [occt] fillet x10 no-metadata | 280.9 | 286.7 | 284.9 | 3.42 | 287.0 | 1.4% | 3 |
| [occt] mesh UV x5 cached | 1.6 | 1.7 | 1.7 | 0.04 | 1.7 | 2.1% | 5 |
| [occt] measure x100 cached | 3.9 | 3.9 | 4.0 | 0.19 | 4.3 | 4.1% | 5 |
| [occt] rotate x100 | 27.2 | 27.6 | 27.8 | 0.83 | 28.7 | 3.4% | 3 |
| [occt] interference 10 separated | 4.6 | 4.6 | 4.6 | 0.06 | 4.7 | 1.1% | 5 |
| [occt] fuse(box,box) | 193.1 | 205.4 | 207.0 | 15.92 | 227.7 | 6.7% | 5 |
| [occt] cut(box,cyl) | 287.9 | 290.9 | 291.1 | 2.82 | 294.7 | 0.8% | 5 |
| [occt] intersect(box,sphere) | 239.9 | 242.4 | 242.0 | 1.70 | 244.0 | 0.6% | 5 |
| [occt] fuseAll N=4 | 56.3 | 59.4 | 59.8 | 3.81 | 64.7 | 5.6% | 5 |
| [occt] fuseAll N=8 | 120.5 | 121.1 | 121.2 | 0.81 | 122.3 | 0.6% | 5 |
| [occt] fuseAll N=16 | 243.4 | 248.3 | 247.3 | 3.24 | 251.0 | 1.1% | 5 |
| [occt] fuseAll N=32 | 497.5 | 501.7 | 507.3 | 10.94 | 521.9 | 1.9% | 5 |
| [occt] translate ×1000 | 250.5 | 254.1 | 253.2 | 1.97 | 254.9 | 0.7% | 5 |
| [occt] rotate ×100 | 25.7 | 25.9 | 26.5 | 1.23 | 28.1 | 4.1% | 5 |
| [occt] cutAll N=4 | 20.4 | 22.8 | 22.7 | 2.07 | 25.3 | 8.0% | 5 |
| [occt] cutAll N=8 | 36.6 | 36.9 | 36.9 | 0.23 | 37.1 | 0.5% | 5 |
| [occt] cutAll N=16 | 71.9 | 72.1 | 72.3 | 0.61 | 73.1 | 0.7% | 5 |
| [occt] mesh box (tol=0.1) | 1.8 | 1.8 | 2.0 | 0.23 | 2.3 | 10.4% | 5 |
| [occt] mesh sphere (tol=0.01) | 228.8 | 232.1 | 231.3 | 1.96 | 233.0 | 0.7% | 5 |
| [occt] volume ×100 | 46.4 | 46.6 | 47.1 | 1.08 | 48.6 | 2.0% | 5 |
| [occt] boundingBox ×100 | 3.9 | 4.0 | 4.0 | 0.05 | 4.0 | 1.2% | 5 |
| [occt] exportSTEP ×10 | 35.7 | 37.5 | 37.4 | 0.98 | 38.2 | 2.3% | 5 |
| [occt] box+chamfer | 27.3 | 27.4 | 27.7 | 0.58 | 28.5 | 1.8% | 5 |
| [occt] box+fillet | 27.9 | 28.0 | 28.0 | 0.10 | 28.1 | 0.3% | 5 |
| [occt] multi-boolean model | 135.8 | 136.0 | 136.0 | 0.16 | 136.2 | 0.1% | 5 |
| [occt] native N=4 | 59.1 | 65.3 | 65.1 | 6.53 | 73.4 | 8.8% | 5 |
| [occt] pairwise N=4 | 117.0 | 119.4 | 120.8 | 3.20 | 124.4 | 2.3% | 5 |
| [occt] native N=8 | 112.0 | 112.7 | 113.2 | 1.31 | 115.0 | 1.0% | 5 |
| [occt] pairwise N=8 | 298.8 | 304.4 | 306.2 | 7.00 | 314.1 | 2.0% | 5 |
| [occt] native N=16 | 238.3 | 241.9 | 241.3 | 2.13 | 243.4 | 0.8% | 5 |
| [occt] pairwise N=16 | 693.0 | 695.7 | 698.4 | 6.41 | 707.1 | 0.8% | 5 |
| [occt] bracket model | 2975.6 | 2986.7 | 3014.6 | 58.18 | 3072.0 | 2.2% | 3 |
| [occt] fuse simplify=false | 27.0 | 27.1 | 27.1 | 0.08 | 27.2 | 0.3% | 5 |
| [occt] fuse simplify=true | 30.6 | 30.7 | 30.8 | 0.13 | 31.0 | 0.4% | 5 |
| [occt] fuseAll(8) simplify=false | 106.9 | 107.0 | 107.0 | 0.13 | 107.2 | 0.1% | 5 |
| [occt] fuseAll(8) simplify=true | 117.5 | 117.7 | 117.7 | 0.15 | 117.8 | 0.1% | 5 |
| [occt] cut simplify=false | 7.7 | 7.7 | 7.8 | 0.05 | 7.8 | 0.6% | 5 |
| [occt] cut simplify=true | 8.6 | 8.6 | 8.7 | 0.07 | 8.7 | 0.7% | 5 |
| [occt] mesh box | 2.6 | 3.1 | 3.1 | 0.45 | 3.7 | 12.6% | 5 |
| [occt] mesh sphere | 4632.7 | 4641.3 | 4642.5 | 7.78 | 4651.3 | 0.1% | 5 |
| [occt] mesh fused | 52.9 | 53.6 | 53.6 | 0.69 | 54.5 | 1.1% | 5 |
| [occt] mesh sphere fine | 1110.0 | 1120.0 | 1119.5 | 9.24 | 1127.6 | 0.9% | 3 |
| [occt] mesh sphere (no cache) | 4575.0 | 4639.1 | 4628.5 | 30.90 | 4651.7 | 0.6% | 5 |
| [occt] mesh box (no cache) | 1.6 | 1.6 | 1.6 | 0.03 | 1.6 | 1.6% | 5 |
