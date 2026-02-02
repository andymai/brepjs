# I/O

**Layer 2** — STEP and STL file import.

## Key Files

| File           | Purpose                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| `importFns.ts` | Functional API — `importSTEP(blob): Promise<Result<AnyShape>>`, `importSTL(blob): Promise<Result<AnyShape>>` |
| `importers.ts` | Legacy class-based import API (deprecated, use `importFns.ts`)                                               |

## Gotchas

1. **Async operations** — Import functions are async; they read blobs via ArrayBuffer, write to OCCT virtual filesystem, then parse
2. **STL auto-upgrade** — STL imports are automatically upgraded to solids via `ShapeUpgrade_UnifySameDomain`
3. **Import-only module** — For STEP/STL _export_, see `topology/meshFns.ts` or `operations/exporterFns.ts`; this module handles import only
4. **Prefer functional API** — Use `importFns.ts` over legacy `importers.ts` for new code
