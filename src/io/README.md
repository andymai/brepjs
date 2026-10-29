# I/O

**Layer 2**: STEP, STL, and IGES file import.

## Key Files

| File           | Purpose                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `importFns.ts` | Functional API: `importSTEP(blob): Promise<Result<AnyShape>>`, `importSTL(blob): Promise<Result<AnyShape>>` |

## Gotchas

1. **Async operations**: Import functions are async; they read blobs via ArrayBuffer, write to the kernel's virtual filesystem, then parse
2. **STL sewing**: occt-wasm returns STL facets as a loose compound of faces, so `importSTL` sews them with `sewAndSolidify` (a closed mesh becomes a `Solid`) and falls back to `sew` when the downcast to solid fails (an open mesh becomes a `Shell`). Kernels that already return a solid skip the sewing
3. **IGES capability gap**: the published occt-wasm build has no IGES translator. Its adapter throws `UnsupportedKernelOperationError`, which `importIGES`/`exportIGES` map to an `UNSUPPORTED_CAPABILITY` error via `igesUnsupportedError` in `ioUtils.ts`
4. **Import-only module**: For STEP/STL _export_, see `topology/meshFns.ts` or `operations/exporterFns.ts`; this module handles import only
