# I/O

**Layer 2**: STEP, STL, and IGES file import.

## Key Files

| File           | Purpose                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `importFns.ts` | Functional API: `importSTEP(blob): Promise<Result<AnyShape>>`, `importSTL(blob): Promise<Result<AnyShape>>` |

## Gotchas

1. **Async operations**: Import functions are async; they read blobs via ArrayBuffer, write to the kernel's virtual filesystem, then parse
2. **Mesh sewing**: occt-wasm returns STL facets as a loose compound of faces, so `importSTL` (like the OBJ/3MF importers via `sewMeshToSolid`) sews them with `sewFacesIntoSolids` in `ioUtils.ts`, giving a `Solid` per closed body and a `Shell` per open one. On a kernel with the `sewKeepsOrientation` capability (both OCCT kernels), `sewableTopology` first reads the triangles in JS (`analyzeMesh` in `meshTopology.ts`, STL parsed by `stlTriangles.ts`). When every shared edge joins exactly two triangles that run it in opposite directions, sewing keeps that orientation, so if the sewn faces, edges, vertices, and shells match the analysis, each closed body becomes a solid straight from its shell (reversed first when it faces inward). OBJ and 3MF triangles reach the kernel as a text STL: its reader is the only way to build faces that already share edges, which makes the sewing cheap. On a kernel without the capability, 3MF builds each object with `buildSolidFromFaces` instead. Any other mesh takes the repairing path: `sewAndSolidify` when its result is a single solid (judge by type: occt-wasm throws on the solid downcast, opencascade.js returns the sewn compound), else `sew` plus a per-shell `sewAndSolidify`. On occt-wasm the checked path takes about 0.3 s per 10,000 triangles (1.7 s for 50,000), mostly the STL reader and the sewing; the repairing path takes about 2 s per 10,000 (13 s for 50,000), nearly all of it ShapeFix's orientation pass. Carving a sealed cavity adds a boolean cut, about 1 s for two 5,000-triangle shells. Kernels whose STL reader already returns a solid skip the sewing
3. **IGES capability gap**: the published occt-wasm build has no IGES translator. Its adapter throws `UnsupportedKernelOperationError`, which `importIGES`/`exportIGES` map to an `UNSUPPORTED_CAPABILITY` error via `igesUnsupportedError` in `igesSupport.ts`
4. **Import-only module**: For STEP/STL _export_, see `topology/meshFns.ts` or `operations/exporterFns.ts`; this module handles import only
