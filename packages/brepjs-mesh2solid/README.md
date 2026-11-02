# brepjs-mesh2solid

> Experimental satellite package, published to npm. Early-stage: the API may change.

```bash
npm install brepjs brepjs-mesh2solid
```

Turn a triangle mesh into a [brepjs](https://github.com/andymai/brepjs) B-Rep shape you can measure,
boolean, and export as STEP. Reads STL (binary and text), OBJ, PLY, and 3MF, from CAD exports or 3D
scans. Everything runs locally: the mesh engine is Rust compiled to WebAssembly and ships inside this
package, and the B-Rep is built by brepjs's kernel.

```ts
import { init, exportSTEP, unwrap } from 'brepjs';
import { meshToSolid } from 'brepjs-mesh2solid';

await init();
const res = await meshToSolid(file); // File, Blob, ArrayBuffer, or Uint8Array
if (res.ok && res.value.solid) {
  // res.value.report: units, repairs, tolerance, deviation, warnings
  const step = unwrap(exportSTEP(res.value.shape)); // Blob
}
```

## What tier 0 does

1. **Reads** the file and converts units to millimeters (3MF units are honored; other formats assume
   millimeters and the report suggests other units when the size looks implausible).
2. **Repairs**: welds vertices, removes degenerate and duplicate triangles, makes winding consistent,
   fills holes, orients each closed body outward, and finds internal cavities.
3. **Measures** the mesh: CAD tessellation or scan, coordinate quantization, measurement noise, and
   tessellation chord error. The merge tolerance comes from these unless you pass one.
4. **Decimates** scans (and any mesh over `maxTriangles`) with quadric-error edge collapse, within the
   tolerance.
5. **Merges coplanar triangles** into planar regions, snaps shared vertices onto the planes so each
   region is planar to machine precision, and drops vertices that only interrupt a straight edge.
6. **Builds** shells and solids in the kernel, subtracts cavities, and asks the kernel to unify each
   planar region into one face. If the unified shape fails validation, the triangulated one is kept
   and `report.warnings` says so.
7. **Reports** the distance between the input and the result in both directions.

A closed body becomes a `Solid`, an open one a `Shell`, and several bodies a `Compound`.

## Options

| Option         | Default  | Meaning                                                               |
| -------------- | -------- | --------------------------------------------------------------------- |
| `units`        | `'auto'` | `'um' \| 'mm' \| 'cm' \| 'm' \| 'in' \| 'ft'`, or read from the file  |
| `tolerance`    | `'auto'` | Merge and decimation tolerance in mm                                  |
| `maxTriangles` | 200,000  | Triangle budget after decimation                                      |
| `fillHoles`    | `true`   | `false` leaves holes open; a number fills holes up to that many edges |
| `heatmap`      | `false`  | Also return the input mesh with each vertex's distance to the result  |
| `fileName`     |          | Format hint when the content alone is ambiguous                       |

## The report

`report.estimate.kind` says whether the mesh looked like a CAD export or a scan, and
`report.tolerance` which tolerance was used. `report.deviation` gives the max, RMS, and 95th
percentile distance from the input to the result (`reverseMax` is the other direction, sampled at each output triangle's corners and centroid).
`report.faces` counts triangles in and faces out, and `report.warnings` lists every repair and
fallback that happened.

## Quality gate

`tests/eval.test.ts` round-trips known brepjs solids through their own tessellation (CAD) and through
subdivided, noise-perturbed versions (scans), and gates validity, volume, deviation, and face count.
Set `MESH2SOLID_SCORECARD=<path>` when running it to write per-case metrics.

## Developing the engine

The engine's Rust source is in `engine/`; its build output in `wasm/` is committed. After changing
`engine/src`, rebuild and check it:

```bash
npm run build:engine --workspace=brepjs-mesh2solid   # cargo → wasm-bindgen → wasm-opt
cd packages/brepjs-mesh2solid/engine && cargo test && cargo clippy --all-targets -- -D warnings
```

The `wasm-bindgen` CLI must match the version pinned in `engine/Cargo.toml`; the build script checks.
