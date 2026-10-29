# I/O

**Layer 2**: STEP, STL, and IGES file import.

## Key Files

| File           | Purpose                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `importFns.ts` | Functional API: `importSTEP(blob): Promise<Result<AnyShape>>`, `importSTL(blob): Promise<Result<AnyShape>>` |

## Gotchas

1. **Async operations**: Import functions are async; they read blobs via ArrayBuffer, write to the kernel's virtual filesystem, then parse
2. **Mesh sewing**: occt-wasm returns STL facets as a loose compound of faces, so `importSTL` (like the OBJ/3MF importers via `sewMeshToSolid`) sews them with `sewFacesIntoSolids` in `ioUtils.ts`: `sewAndSolidify` when its result is a single solid (judge by type: occt-wasm throws on the solid downcast, opencascade.js returns the sewn compound), else `sew` plus a per-shell `sewAndSolidify`, giving a `Solid` per closed body and a `Shell` per open one. The time is in `sewAndSolidify`'s ShapeFix orientation pass, not the sewing (about 0.1 s of the ~2.5 s per 10,000 triangles). Kernels whose STL reader already returns a solid skip the sewing
3. **IGES capability gap**: the published occt-wasm build has no IGES translator. Its adapter throws `UnsupportedKernelOperationError`, which `importIGES`/`exportIGES` map to an `UNSUPPORTED_CAPABILITY` error via `igesUnsupportedError` in `igesSupport.ts`
4. **Import-only module**: For STEP/STL _export_, see `topology/meshFns.ts` or `operations/exporterFns.ts`; this module handles import only
