---
title: Mesh to Solid
description: 'brepjs-mesh2solid turns an STL, OBJ, PLY or 3MF mesh into a B-Rep solid with exact surfaces, a STEP file, and a brepjs program that builds the part.'
---

# Mesh to Solid

`brepjs-mesh2solid` turns a triangle mesh into a brepjs solid. A mesh from a CAD export or a 3D scan has only triangles. The package finds the planes, cylinders and other surfaces that the triangles came from, and it joins them into a solid that you can measure, cut, and export as STEP.

[Try it in your browser](/mesh-to-solid){target="_self"}: drop a mesh on the page, and it shows the solid and the fit. Your file stays in the browser.

```bash
npm install brepjs-mesh2solid brepjs occt-wasm
```

The package reads STL (binary and text), OBJ, PLY and 3MF. Its mesh engine is Rust compiled to WebAssembly, and it is in the package, so the mesh does not leave your machine.

The package is experimental, so its API can change between minor versions.

## A first conversion

This script reads an STL file, converts it, and writes a STEP file.

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { init, exportSTEP, unwrap } from 'brepjs';
import { meshToSolid } from 'brepjs-mesh2solid';

await init();

const bytes = await readFile('bracket.stl');
const res = await meshToSolid(bytes, { fileName: 'bracket.stl' });
if (!res.ok) throw new Error(res.error.message);

const { shape, solid, report, code } = res.value;
console.log(report.tierReached); // 2
console.log(solid); // true: one closed solid
console.log(report.deviation.max); // largest distance from the mesh to the result, in mm

const step = unwrap(exportSTEP(shape));
await writeFile('bracket.step', new Uint8Array(await step.arrayBuffer()));
if (code !== undefined) await writeFile('bracket.brep.ts', code);

shape.delete();
```

`meshToSolid` takes a `File`, a `Blob`, an `ArrayBuffer` or a `Uint8Array`. It returns a `Result`, so a file that it cannot read is an `Err` with a message, not an exception.

## Three levels of result

The package tries the highest level first. When a level cannot rebuild the part, the package goes down one level. `report.tierReached` tells you which level you got.

| Tier | Result                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------- |
| 2    | Exact surfaces, and a `.brep.ts` program that builds the part from brepjs calls                 |
| 1    | Exact surfaces: planes, cylinders, cones, spheres and tori. A freeform body gets B-spline faces |
| 0    | A faceted solid: the triangles as faces, with each flat area merged into one face               |

At tier 1, a drilled hole is one cylinder, not dozens of flat strips. The radius of that cylinder is a number that you can read.

## The program

At tier 2, `res.value.code` is the source of a module that builds the part. This is the program for an L-bracket with two holes, from a mesh of 1,044 triangles:

<div data-no-playground>

```typescript
// Rebuilt from a mesh by brepjs-mesh2solid. Dimensions in millimeters.
import { box, cut, cylinder, fuse, unwrap } from 'brepjs';

export const expected = {
  volume: 16580.7,
  area: 7241.1,
  bounds: { xMin: 0, xMax: 60, yMin: 0, yMax: 30, zMin: 0, zMax: 40 },
  tolerancePct: 0.1,
};

export default () => {
  using slab1 = box(60, 30, 6);
  using hole1 = cylinder(3, 6, { at: [20, 15, 0] });
  using slab2 = unwrap(cut(slab1, hole1));
  using hole2 = cylinder(3, 6, { at: [40, 15, 0] });
  using slab3 = unwrap(cut(slab2, hole2));
  using slab4 = box(6, 30, 34, { at: [3, 15, 23] });
  return unwrap(fuse(slab3, slab4, { simplify: true }));
};
```

</div>

Change the `3` of a hole to `4` and run the module again, and you have the bracket with larger holes. The package rounds each dimension to the roundest value inside the fit tolerance, so a side comes back as `60` and not as `59.9999997`.

The program recognizes extruded slabs with holes, revolved parts, spheres, tori, fillets, chamfers, countersinks and internal cavities. A part made of other shapes stops at tier 1, and `report.tier2.fallbackReason` gives the cause.

## Check the units first

STL, OBJ and PLY files do not record their units. `meshToSolid` reads the unit of a 3MF file and assumes millimeters for the other formats. `inspectMesh` reads only the format, the triangle count and the size, so you can show them to a person before the conversion.

```typescript
import { inspectMesh, meshToSolid } from 'brepjs-mesh2solid';

const info = await inspectMesh(bytes, { fileName: 'part.stl' });
if (info.ok) {
  console.log(info.value.size); // [x, y, z] in the units of the file
  console.log(info.value.suggestions); // other units, when the size in mm is not plausible
  const res = await meshToSolid(bytes, { units: info.value.unit ?? 'mm' });
}
```

## The report

Each conversion returns a report, so you do not have to trust the result blind.

- **`report.deviation`** is the distance from the mesh to the result: the maximum, the RMS and the 95th percentile, in millimeters.
- **`report.estimate.kind`** is `'cad'` or `'scan'`. A scan has noise, so the package fits its surfaces with a tolerance of three times the noise that it measures.
- **`report.faces`** has the number of faces in the result.
- **`report.warnings`** lists each repair and each fallback.

Pass `{ heatmap: true }` to also get the input mesh with a distance at each vertex. The browser page draws its color map from that data.

## Options

| Option         | Default  | Meaning                                                                  |
| -------------- | -------- | ------------------------------------------------------------------------ |
| `tier`         | `2`      | `1` skips the program. `0` returns the faceted solid                     |
| `units`        | `'auto'` | `'um'`, `'mm'`, `'cm'`, `'m'`, `'in'` or `'ft'`                          |
| `tolerance`    | `'auto'` | Merge and decimation tolerance in mm                                     |
| `maxTriangles` | 200,000  | Triangle budget after decimation                                         |
| `fillHoles`    | `true`   | `false` leaves holes open. A number fills holes of up to that many edges |
| `heatmap`      | `false`  | Also return the input mesh with a distance at each vertex                |
| `fileName`     |          | Format hint, for content that does not identify its format               |

## In a browser

A bundler moves the engine's `.wasm` file, so give `loadMeshEngine` its new address before the first conversion. With Vite:

```typescript
import { loadMeshEngine, meshToSolid } from 'brepjs-mesh2solid';
import engineWasm from 'brepjs-mesh2solid/index_bg.wasm?url';

await loadMeshEngine(engineWasm);
```

A conversion can take seconds, so run it in a Web Worker. The [source of the browser page](https://github.com/andymai/brepjs/tree/main/apps/mesh2solid/src) is a complete example: one worker that loads the engine and the kernel, and a page that sends it files.

## Limits

- A part that has one freeform area gets B-spline faces for all of its faces, the flat ones too, and it has no program.
- A mesh with an open boundary cannot become a solid. It comes back as a faceted shell.
- A sparse or very noisy scan can stop at tier 0.
- The program does not find hole patterns or mirrored features. It writes each hole as its own call.
- A large scan that fails the exact rebuild can take minutes before it comes back with B-spline faces.

The [package README](https://github.com/andymai/brepjs/tree/main/packages/brepjs-mesh2solid#readme) describes each step of each tier.

## Next steps

- [Import & Export](../tasks/import-export): STEP, STL and glTF for the result
- [Measurement](../tasks/measurement): volume and area of the solid
- [Result and Errors](../concepts/result): what `unwrap` does and when to use `isOk`
