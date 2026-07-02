# brepjs-opencascade WASM build

Deep reference for the `src/kernel/occt/` backend's native side: the C++ facade classes
compiled into the WASM module, the emcc flags, and the Docker build flow. Read this only
when editing `packages/brepjs-opencascade/build-config/brepjs.yml` or reasoning about why a
facade returns what it does. The default kernel is occt-wasm (an external package); this
reference is for the brepjs-opencascade fallback only.

## Build flow

- One-command build: `pnpm run buildWasm` (in `packages/brepjs-opencascade/`) =
  `buildSingle` then `optimizeWasm`.
- `buildSingle` runs the opencascade.js compiler in Docker
  (`ghcr.io/andymai/opencascade.js:v8`) over `brepjs.yml`, producing `brepjs_single.*`.
- `optimizeWasm` runs `wasm-opt -O4 --strip-debug --strip-producers --enable-exception-handling`.
- **Only `brepjs_single` is built.** `brepjs.yml` declares a single `mainBuild: name:
brepjs_single.js`; any `brepjs_threaded.*` / `brepjs_with_exceptions.*` files present
  locally are legacy — package.json exports only `.` / `./single` / `./src/*` with
  `main: src/brepjs_single.js`.
- A Docker rebuild is on the order of hours. Land every C++ facade edit and run review
  before starting. Reproduce suspected kernel bugs in JS/TS against the installed WASM
  first — a rebuild is the last resort.

## emcc flags (brepjs.yml `emccFlags`)

```
-flto                     link-time optimization
-fwasm-exceptions         native WASM exceptions (not JS-based)
-sEXPORT_ES6=1            ES module output
-sALLOW_MEMORY_GROWTH=1   heap can grow — WHY heap views go stale after a WASM call
-sEXPORTED_RUNTIME_METHODS=["FS","HEAP32","HEAPU32","HEAPF32","HEAPF64","HEAPU8"]
-msimd128 -mrelaxed-simd  SIMD IS enabled (docs/compatibility.md's "SIMD not used" is stale)
-mtail-call
-sWASM_BIGINT
-sEVAL_CTORS=2
-O3
-sINITIAL_MEMORY=134217728    128 MB
-sMAXIMUM_MEMORY=4294967296   4 GB
```

No `-pthread` flag — the module is single-threaded, so `SetRunParallel(Standard_True)`
inside the facade degrades to sequential.

The exported heap views (`HEAPF32`, `HEAPU32`, `HEAP32`, …) are how the TS side reads
facade-returned pointers. Combined with `ALLOW_MEMORY_GROWTH`, this is why
`src/kernel/occt/meshOps.ts` must `.slice()` a heap view into an owned array _before any
other WASM call_.

## C++ facade classes (bulk extraction and batch ops)

The facade lives in `brepjs.yml`'s `additionalBindCode` / `additionalCppCode`. Each class
does a single bulk WASM call to avoid per-element boundary crossings, returns raw
pointers + sizes, and frees on `.delete()`.

| Facade class                                                | Purpose                                                                                                                                                                                                                                                                                | TS consumer                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `MeshExtractor` / `MeshData`                                | Mesh a shape; vertices/normals/UVs/face groups in one call                                                                                                                                                                                                                             | `occt/meshOps.ts`          |
| `EdgeMeshExtractor` / `EdgeMeshData`                        | Tessellate edges                                                                                                                                                                                                                                                                       | `occt/meshOps.ts`          |
| `MeshBatchExtractor` / `MeshBatchData`                      | Mesh many shapes at once                                                                                                                                                                                                                                                               | `occt/meshOps.ts`          |
| `BooleanBatch`                                              | Batched booleans (`SetRunParallel` set here)                                                                                                                                                                                                                                           | `occt/booleanOps.ts`       |
| `BooleanPipeline`                                           | Chained boolean pipeline                                                                                                                                                                                                                                                               | `occt/booleanOps.ts`       |
| `EvolutionExtractor` / `EvolutionData`                      | Fillet/chamfer generated/modified/deleted tracking                                                                                                                                                                                                                                     | lineage ops                |
| `TopologyExtractor` / `TopologyResult`                      | Sub-shape enumeration                                                                                                                                                                                                                                                                  | `occt/topologyOps.ts`      |
| `MeasurementExtractor` / `MeasurementData`                  | Volume/area/inertia in one call                                                                                                                                                                                                                                                        | measure ops                |
| `TransformBatch`                                            | Batched transforms                                                                                                                                                                                                                                                                     | transform ops              |
| `LoftBatch` / `ExtrudeBatch` / `ShellBatch` / `FilletBatch` | Batched op families (feature-detected — see `initFromOC` cache resets)                                                                                                                                                                                                                 | operations                 |
| `TopoDS_Cast`                                               | Downcast a generic `TopoDS_Shape` to its concrete subtype                                                                                                                                                                                                                              | `occt/geometryQueryOps.ts` |
| `Bnd_Box`                                                   | Manual bounding-box bindings                                                                                                                                                                                                                                                           | query ops                  |
| `BRepToolsWrapper` / `GeomToolsWrapper`                     | BREP/Geom serialization helpers                                                                                                                                                                                                                                                        | io ops                     |
| `StepStreamIO`                                              | In-memory STEP read/write                                                                                                                                                                                                                                                              | io ops                     |
| `Curve2dBatchEval`                                          | 2D curve batch evaluation                                                                                                                                                                                                                                                              | 2d ops                     |
| `SpatialIndex3D`                                            | 3D spatial queries                                                                                                                                                                                                                                                                     | query ops                  |
| `HelixWireBuilder`                                          | Native helix wire construction — **not currently compiled** (`brepjs.yml` symbol commented out; `TKHelix` not in the opencascade.js filter, needs a Docker image update). `makeHelixWire` in `occt/extendedConstructorOps.ts` feature-detects it and falls back to manual construction | operations                 |

When a feature-detected batch class (`LoftBatch`, `FilletBatch`, …) is added or removed,
`initFromOC()` in `src/kernel/index.ts` resets the matching detection cache — keep the two
in sync or capability flags go stale.
