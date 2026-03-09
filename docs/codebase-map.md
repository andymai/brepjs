# Codebase Map

Quick reference for navigating the brepjs source. See `CLAUDE.md` for rules and patterns.

## Entry Points

| Entry                | Purpose                                  | Import                                               |
| -------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `src/index.ts`       | Main public API (re-exports all modules) | `import { box, fuse } from 'brepjs'`                 |
| `src/quick.ts`       | Auto-init convenience (ESM only)         | `import { box } from 'brepjs/quick'`                 |
| `src/operations.ts`  | Operations sub-path                      | `import { extrude } from 'brepjs/operations'`        |
| `src/2d.ts`          | 2D operations sub-path                   | `import { makeCircle2D } from 'brepjs/2d'`           |
| `src/io.ts`          | Import/export sub-path                   | `import { importSTEP } from 'brepjs/io'`             |
| `src/result.ts`      | Result type sub-path                     | `import { ok, err, unwrap } from 'brepjs/result'`    |
| `src/vectors.ts`     | Vector math sub-path                     | `import { vecAdd } from 'brepjs/vectors'`            |
| `src/core.ts`        | Core types sub-path                      | `import type { Solid } from 'brepjs/core'`           |
| `src/topology.ts`    | Topology sub-path                        | `import { fuse } from 'brepjs/topology'`             |
| `src/sketching.ts`   | Sketching sub-path                       | `import { Sketcher } from 'brepjs/sketching'`        |
| `src/query.ts`       | Query sub-path                           | `import { findFaces } from 'brepjs/query'`           |
| `src/measurement.ts` | Measurement sub-path                     | `import { measureVolume } from 'brepjs/measurement'` |
| `src/worker.ts`      | Worker sub-path                          | `import { createWorkerClient } from 'brepjs/worker'` |

## Module → Key Files

### Layer 0: Foundation

| Module     | Key Files                                | Purpose                                           |
| ---------- | ---------------------------------------- | ------------------------------------------------- |
| **kernel** | `types.ts`                               | `KernelAdapter` interface (~164 methods)          |
|            | `DefaultAdapter.ts`                      | OpenCascade kernel adapter                        |
|            | `brepkitAdapter.ts`                      | brepkit kernel adapter                            |
|            | `index.ts`                               | `getKernel()`, `initFromOC()`, `registerKernel()` |
|            | `*Ops.ts` (19 files)                     | Raw kernel API calls grouped by domain            |
| **utils**  | `bug.ts`, `precisionRound.ts`, `uuid.ts` | Shared utilities                                  |

### Layer 1: Core

| Module   | Key Files           | Purpose                                                             |
| -------- | ------------------- | ------------------------------------------------------------------- |
| **core** | `shapeTypes.ts`     | Branded types: `Solid`, `Face`, `Edge`, etc. + type guards          |
|          | `result.ts`         | `Result<T,E>`, `ok()`, `err()`, `unwrap()`, `match()`, `pipeline()` |
|          | `errors.ts`         | `BrepError`, `BrepErrorCode`, error constructors                    |
|          | `disposal.ts`       | `createHandle()`, `DisposalScope`, `using` support                  |
|          | `types.ts`          | `Vec3`, `Vec2`, `PointInput`, `Direction`                           |
|          | `vecOps.ts`         | Pure vector math: add, cross, normalize, etc.                       |
|          | `planeOps.ts`       | Pure plane operations: create, transform, project                   |
|          | `kernelBoundary.ts` | Vec3 ↔ kernel geometry conversions                                  |
|          | `kernelCall.ts`     | `kernelCall()`, `kernelCallScoped()` wrappers                       |

### Layer 2: Domain

| Module          | Functional API (`*Fns.ts`)                                                                                                                                                                                                                    | Tests                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **topology**    | `booleanFns` `primitiveFns` `modifierFns` `shapeFns` `faceFns` `curveFns` `surfaceFns` `healingFns` `meshFns` `colorFns` `faceTagFns` `adjacencyFns` `chamferAngleFns` `compoundOpsFns` `hullFns` `minkowskiFns` `polyhedronFns` `wrapperFns` | `fn-booleanFns` `fn-shapeFns` `fn-modifierFns` etc. |
| **operations**  | `extrudeFns` `loftFns` `guidedSweepFns` `multiSweepFns` `patternFns` `roofFns` `assemblyFns` `mateFns` `historyFns` `exporterFns`                                                                                                             | `fn-extrudeFns` `fn-loftFns` etc.                   |
| **2d**          | `curve2dFns` `blueprintFns`                                                                                                                                                                                                                   | `fn-curve2dFns` `fn-svgPath` etc.                   |
| **query**       | `finderFns`                                                                                                                                                                                                                                   | `fn-finderFns` `faceFinder` etc.                    |
| **measurement** | `measureFns` `interferenceFns`                                                                                                                                                                                                                | `fn-measureFns` `fn-interferenceFns`                |
| **io**          | `importFns` `dxfExportFns` `dxfImportFns` `gltfExportFns` `objExportFns` `objImportFns` `svgImportFns` `threemfExportFns` `threemfImportFns`                                                                                                  | `fn-importFns` `fn-dxfExport` etc.                  |
| **worker**      | (infrastructure, no Fns)                                                                                                                                                                                                                      | `fn-workerProtocol` etc.                            |

### Layer 3: High-Level API

| Module         | Functional API (`*Fns.ts`) | Tests                                |
| -------------- | -------------------------- | ------------------------------------ |
| **sketching**  | `sketchFns` `drawFns`      | `fn-sketchFns` `fn-drawFns` `sketch` |
| **text**       | (uses `textBlueprints.ts`) | `fn-textBlueprints` `fn-textMetrics` |
| **projection** | `cameraFns`                | `fn-cameraFns` `projection`          |

## Documentation Index

| Doc                         | What it answers                                      |
| --------------------------- | ---------------------------------------------------- |
| `CLAUDE.md`                 | Rules, patterns, commands — read first               |
| `docs/function-lookup.md`   | "Where is function X exported from?" (381+ symbols)  |
| `docs/architecture.md`      | Layer diagrams, data flow, key patterns              |
| `docs/errors.md`            | All error codes with recovery hints                  |
| `docs/which-api.md`         | "Should I use Sketcher, functional API, or Drawing?" |
| `docs/cookbook.md`          | Recipes for common CAD workflows                     |
| `docs/memory-management.md` | Disposal patterns, `using`, scopes                   |
| `src/<module>/README.md`    | Per-module architecture, file tables, gotchas        |
