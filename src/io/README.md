# I/O

**Layer 2** — STEP, STL, and IGES file import.

## Key Files

| File           | Purpose                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `importFns.ts` | Functional API — `importSTEP(blob): Promise<Result<AnyShape>>`, `importSTL(blob): Promise<Result<AnyShape>>` |

## Gotchas

1. **Async operations** — Import functions are async; they read blobs via ArrayBuffer, write to OCCT virtual filesystem, then parse
2. **STL auto-upgrade** — STL imports are automatically upgraded to solids via `ShapeUpgrade_UnifySameDomain`
3. **Import-only module** — For STEP/STL _export_, see `topology/meshFns.ts` or `operations/exporterFns.ts`; this module handles import only
