# brepjs-mesh2solid

> In development in the brepjs monorepo. It stays off npm until every tier of the plan is done, and
> the API will change until then.

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
  // res.value.code: the part as an editable .brep.ts module (tier 2)
}
```

`meshToSolid` runs tier 2 by default. Each tier falls back to the one below when it can't rebuild
the part, and `report.tierReached` says which one you got.

To confirm units before converting, `inspectMesh` reads only the file's format, the unit it declares
(3MF), its triangle count, and its size in its own units, with the units worth offering when it
declares none and its size as millimeters looks implausible:

```ts
import { inspectMesh, meshToSolid } from 'brepjs-mesh2solid';

const info = await inspectMesh(file);
if (info.ok) {
  // info.value.size: [x, y, z] in the file's units; info.value.unit: 'cm' (3MF) or null
  // info.value.suggestions: e.g. [{ unit: 'm', largestDimensionMm: 40, reason: '...' }]
  const res = await meshToSolid(file, { units: info.value.unit ?? 'mm' });
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

## What tier 1 does

Tier 1 rebuilds the part from exact surfaces instead of facets, so a drilled hole comes back as one
cylinder rather than dozens of strips.

1. **Segments** the repaired mesh into regions that each lie on one plane, cylinder, cone, sphere, or
   torus, within a tolerance derived from the file's coordinate precision. Regions grow from the
   largest triangles; a facet that turns more than 45° from a candidate surface, or whose edges would
   sit farther from it than a tessellator leaves them, can't join it.
2. **Snaps** surfaces into the relations a designer drew. Surfaces that meet tangentially (fillets)
   touch exactly: fillet axes sit one radius from their planes, corner spheres share the fillet
   radius and sit on the fillet axes. Surfaces of revolution that share an axis (a countersink and
   its hole) get one exact axis, and directions within a microradian of a world axis snap onto it.
3. **Arranges** the surfaces: one oversized patch per surface, split along every exact intersection by
   the kernel, then keeps the pieces that lie on the mesh.
4. **Sews** each body's pieces into a solid, subtracts cavities, unifies faces, and checks the result
   against the mesh in both directions.

When triangles fit no analytic surface, a closed mesh is rebuilt from B-spline faces instead (see
Freeform shapes below). Tier 1 falls back to tier 0 when a body is open, or when both rebuilds fail
or stray from the mesh. `report.tier1.fallbackReason` says why, and `report.warnings` records the
fallback.

### Freeform shapes

A sculpted or organic shape has no planes or cylinders to find, so tier 1 rebuilds it from B-spline
faces:

1. **Charts** each body: splits it into discs whose facets stay within about 40° of the disc's mean
   direction and that span at most half the body's diagonal (flat discs can be any size). Edges
   sharper than 50° bound them.
2. **Fits** one cubic B-spline surface to each chart: the mesh points on it and just past its edge,
   and the boundaries it shares with its neighbours.
3. **Trims** each surface along its chart's boundary, then sews each body's faces into a solid
   within their fit error and checks it against the mesh in both directions.

The blob, peanut, and bumpy ring in the eval come back as valid solids of 18 to 57 faces, with their
volume within 0.015% of the smooth shape the mesh was sampled from. A part with a freeform region
is rebuilt this way throughout, flat faces included, and tier 2 has no feature program for it. On a
scan, more than 16 sphere and torus fits mark a freeform part, and the analytic rebuild stops there.

### Scans

On a scan the fit tolerance is three times the measured noise, and every test allows for a few
points past it:

- A surface fits a region when 95% of its points are within tolerance. A triangle joins a region when
  its centroid lies on the surface and its corners are within twice the tolerance.
- Regions are found on the decimated mesh, but surfaces are fitted to the scan's own vertices: each
  goes to the region of its nearest decimated triangle. Decimation leaves a flat face a few large
  triangles and flattens the start of each fillet, so fits to the decimated vertices are biased.
- Regions covering less than 0.2% of the area are noise fragments, and each of their triangles goes to
  the face that accepts it. Neighbouring regions merge while one plane, cylinder, or sphere fits the
  points no other surface explains (a fillet split into strips), and small regions whose points their
  neighbours explain are dropped. Up to 3% of the area may fit no surface (decimated triangles that
  bridge a crease).
- Tangency is read off the fitted surfaces rather than the noisy boundary between their regions.
  Directions within 0.01 rad of a world axis snap onto it, turning about the region they fit.
- A part with fillets is built sharp from its other surfaces and then filleted by the kernel with the
  fitted radii (radii within the tolerance of each other share their mean), since along a scanned
  fillet both the face and the blend lie within noise of the mesh.

A scanned box, a plate with a drilled hole, a sphere, and a filleted box come back at tier 2 with
their drawn dimensions.

## What tier 2 does

Tier 2 turns the exact tier 1 solid into a feature program: a `.brep.ts` module whose default export
rebuilds the part with brepjs calls, so you can change a hole diameter or a slab height and re-run
it. A filleted 30 by 20 by 15 mm block comes back as:

```ts
export default () => {
  using slab1 = box(30, 20, 15);
  return unwrap(fillet(slab1, 3));
};
```

1. **Strips finishing features** by defeaturing, which restores what they replaced: curved faces
   tangent to all their neighbours become fillets, planar strips that cut off an edge at an equal
   setback (and the corners where they meet) become chamfers, and a concave cone opening a hole onto
   a face becomes a countersink.
2. **Splits off cavities**: each internal void is recognized on its own and cut from the part. A
   mesh with several bodies becomes one program that returns them as a compound.
3. **Describes the rest** as slabs extruded along one direction (every face a cap square to it or a
   wall along it; circular holes become cylinder cuts), or, for a turned part, as a half-section
   revolved about its axis. Spheres and tori stay primitives. Countersinks, chamfers, then fillets
   are put back on top.
4. **Snaps** every dimension to the roundest value within the fit tolerance (40, not 39.9999997) and
   every direction within a microradian of an axis onto it.
5. **Checks** the solid the program builds against the mesh, with the same gate tier 1 uses, and
   returns that solid. `res.value.code` holds the source, with an `expected` block (volume, area,
   bounds) that brepjs-cad's verifier reads. Every intermediate shape in it is bound with `using`,
   so running it repeatedly releases them.

It stops at tier 1 when no direction or axis describes every face, or when the program misses the
mesh; `report.tier2.fallbackReason` says why.

## Options

| Option         | Default  | Meaning                                                               |
| -------------- | -------- | --------------------------------------------------------------------- |
| `tier`         | `2`      | `1` skips the feature program; `0` returns the faceted tier 0 solid   |
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
fallback that happened. `report.tier1` lists the fitted surfaces with their residuals, the tangent
pairs found, and the arrangement's piece counts; after a freeform rebuild, `report.tier1.freeform`
counts the charts, the boundaries between them, and the faces, and says why the analytic rebuild
failed. `report.tier2.features` lists the recognized features in build order.

## Quality gate

`tests/eval.test.ts` round-trips known brepjs solids through their own tessellation (CAD) and through
subdivided, noise-perturbed versions (scans), and gates validity, volume, deviation, and face count.
The tier 1 cases also gate the fitted surface kinds and require the source solid's volume to within
one part in a million. The tier 2 cases import each generated program, run it, and require the
calls a person would write (`box(30, 20, 15)`, `fillet(slab1, 3)`) and the source solid's volume to
within one part in a billion. The scan cases sample each solid evenly by area, as a scanner does, add
Gaussian noise, run at the default tier, and require the same calls and volume from the scanned box,
plate, sphere, and filleted box. The organic cases (a blob, a peanut, and a bumpy ring, sampled
from formulas, clean and with scan noise) require a valid tier 1 solid of B-spline faces, at most 64
of them, and the smooth shape's volume; on the clean meshes it must land at least four times closer
to it than the mesh's own facets do.
Set `MESH2SOLID_SCORECARD=<path>` when running it to write per-case metrics.

## Developing the engine

The engine's Rust source is in `engine/`; its build output in `wasm/` is committed. After changing
`engine/src`, rebuild and check it:

```bash
npm run build:engine --workspace=brepjs-mesh2solid   # cargo → wasm-bindgen → wasm-opt
cd packages/brepjs-mesh2solid/engine && cargo test && cargo clippy --all-targets -- -D warnings
```

The `wasm-bindgen` CLI must match the version pinned in `engine/Cargo.toml`; the build script checks.
