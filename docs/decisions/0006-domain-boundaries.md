# ADR-0006: Domain Boundaries Between brepjs and brepkit

**Status**: Proposed
**Date**: 2026-03-09

## Context

brepjs is a TypeScript CAD library with a pluggable kernel abstraction (ADR-0002). brepkit is a Rust/WASM kernel implementation. As brepkit matures, problems have emerged:

- **Duplicated logic** — 2D vector math, precision constants, point comparison, and offset algorithms exist in both TypeScript and Rust. Bugs fixed in one are not fixed in the other.
- **Unclear ownership** — No principled answer to "does this belong in TypeScript or Rust?"
- **Migration debt** — Code that predates brepkit should move to the kernel, but no plan exists.

**Relationship to ADR-0002**: ADR-0002 treats all kernels as equal peers. This ADR narrows that: brepkit is the strategic kernel. OCCT remains supported for compatibility. The `KernelAdapter` interface and mechanisms are unchanged — only the strategic priority shifts.

## Decision

### Guiding Principle

**brepkit owns computation. brepjs owns the TypeScript developer experience.**

### Decision Heuristic

When deciding where new code belongs, apply in order:

1. **Evaluates geometry or traverses topology?** → brepkit. Examples: surface intersection, point classification, curve offset, measurement.
2. **Depends on a JS library or browser API?** → brepjs. Examples: opentype.js font parsing, Web Workers, Three.js conversion.
3. **Composes kernel operations into a user workflow?** → brepjs. Examples: Sketcher DSL, Blueprint builder, assembly mate sequencing.
4. **Defines types, error handling, or memory management?** → brepjs. Examples: branded types, `Result<T,E>`, `DisposalScope`.

**When rules conflict**: Rule 1 wins for the computational core; rule 3 wins for the sequencing layer. Split accordingly. Example: assembly mate solving — distance/angle computation is brepkit (rule 1), constraint resolution order is brepjs (rule 3).

**Hot-path exception**: If a pure-TS function is called in a tight inner loop and WASM call overhead dominates computation cost, it may remain in TypeScript with a comment citing this ADR. Profile before deciding. Candidates: `samePoint()`, `distance2d()` in Blueprint boolean inner loops.

For existing code: if a pure-TS function reimplements something the kernel provides, it is a migration candidate.

### Domain Ownership

**brepkit** (Rust/WASM) — all geometry evaluation and topology traversal:

Primitives, booleans, shape modification (extrude/revolve/sweep/loft/fillet/chamfer/shell/draft/offset/thicken), tessellation, measurement, queries, healing/validation, data exchange (STEP/IGES round-trip, mesh format import into B-Rep), 2D geometry (curves/booleans/offset/vector math/precision), sketch constraint solving, projection/HLR, transforms.

**brepjs** (TypeScript) — everything between the kernel and end user:

Type system (ADRs 0003-0005, `Result<T,E>`), orchestration (composing kernel calls into workflows), `KernelAdapter` interface, memory management (`DisposalScope`, `createHandle()`), error translation, Sketching DSL, Blueprint DSL, text rendering (opentype.js), runtime integration (Web Workers, Three.js), format adapters (SVG/DXF parsing, OBJ/glTF/3MF export formatting), color/material storage (`colorFns.ts` — stays in TS unless the kernel adds native per-shape color), package distribution.

**Boundary**: Data crosses the `KernelAdapter` as numeric parameters, coordinate arrays, and `ArrayBuffer` in; opaque shape handles, vertex/index buffers, measurement scalars, and serialized bytes out. brepjs never interprets handle internals. brepkit never knows about branded types or disposal scopes.

### Batch Operations

brepkit should expose coarse-grained operations when profiling shows a common workflow makes >5 sequential kernel calls that could be a single WASM entry. Batch methods are added alongside fine-grained methods, not as replacements.

### Package Boundaries

| Package              | Contains                                        | Dependencies                              |
| -------------------- | ----------------------------------------------- | ----------------------------------------- |
| `brepjs`             | TypeScript library (types, orchestration, APIs) | `brepkit-wasm`, `opentype.js`, `flatbush` |
| `brepkit-wasm`       | Rust kernel compiled to WASM + JS bindings      | None                                      |
| `brepjs-opencascade` | OpenCascade WASM build (compatibility kernel)   | None                                      |

## Migration Plan

Each phase targets TypeScript code that evaluates geometry or reimplements kernel capabilities.

### Phase 1: Pure-TS 2D Math (target: v12)

**Target**: `src/2d/lib/vectorOperations.ts`, `src/2d/lib/precision.ts`, `src/2d/lib/utils.ts` — pure TS math (`samePoint`, `add2d`, `distance2d`, `crossProduct2d`, etc.) duplicating brepkit-math.

**Not in scope**: `Curve2D.ts` and `BoundingBox2d.ts` (wrapper classes around kernel handles, not duplicated computation). Blueprint DSL (orchestration, brepjs-owned) — migration replaces lib function _implementations_ with kernel calls, not the TS API surface.

**Existing infrastructure**: The `Kernel2D` sub-interface (`src/kernel/kernel2dTypes.ts`) and brepkit implementation (`src/kernel/brepkit2d.ts`) already exist. `BoundingBox2d.ts` already uses `getKernel2D()`. This migration extends that infrastructure, not creates it from scratch.

**Acceptance criteria**: No pure-TS geometry math in `src/2d/lib/` except hot-path functions retained under the performance exception. Blueprint imports compile unchanged. Both kernel test paths pass.

### Phase 2: Tessellation Normals/UVs (target: v12)

**Target**: OCCT mesh path in `src/kernel/meshOps.ts` that builds normals via low-level OCCT API orchestration (`Poly_Connect`, `StdPrs_ToolTriangulatedShape.Normal()`). brepkit already returns normals/UVs. Migrate the OCCT adapter to a single higher-level call matching brepkit's interface.

**Not in scope**: `threeHelpers.ts` (format conversion, brepjs-owned). Export formatters in `src/io/` (consume mesh output, don't compute geometry).

**Acceptance criteria**: Both adapters return normals and UVs as part of `KernelMeshResult`. No TS code iterates triangulation data to compute normals. Formatters and Three.js helpers work unchanged.

### Phase 3: Ongoing Boundary Cleanup

- **Projection**: `projectionPlanes.ts` is pure data/type definitions (lookup table, type guard) — stays in TS. `cameraFns.ts` (~110 lines) performs 3D vector math for view setup — evaluate against heuristic to determine if computation should move to kernel.
- **Color storage**: Migrate from TS-side `Map` to kernel storage if brepkit adds native per-shape color.
- **New capabilities**: Evaluate against decision heuristic before implementation.

### Phase 4: OCCT Adapter Alignment (Ongoing)

- Core operations (booleans, extrude, fillet, measurement, IO) — OCCT adapter must implement.
- New `KernelAdapter` methods after migration — OCCT adapter may throw "capability not supported" `BrepError`.
- `TEST_KERNEL` dual-test matrix continues. brepkit-only tests use `describe.skipIf(kernel === 'occt')`.

### Migration Protocol

For each capability:

1. Implement in brepkit, expose through WASM bindings
2. Add `KernelAdapter` methods, implement in both adapters (or throw `BrepError` for OCCT)
3. Update brepjs functional APIs to call kernel instead of TS implementations
4. Deprecate TS implementations (`@deprecated` + console warning)
5. Remove deprecated code in next major version
6. Update tests: verify both kernel paths or skip OCCT where needed

## Consequences

### Positive

- Clear ownership via decision heuristic
- Single source of truth for geometry/math — no more duplicated implementations
- Numerically intensive code runs in optimized Rust/WASM
- Each domain testable independently

### Negative / Trade-offs

- **Migration effort** — Phase 1 touches ~15 files; Blueprint imports must be preserved
- **Debugging friction** — WASM is harder to debug in browser devtools than TypeScript
- **WASM boundary overhead** — Fine-grained operations may be slower via WASM; profile before migrating hot paths
- **Kernel coupling** — brepjs becomes more dependent on brepkit's release cadence
- **OCCT divergence** — As brepkit gains capabilities OCCT doesn't implement, the dual-kernel promise weakens
- **Strategic bet** — Declaring brepkit as the strategic kernel narrows optionality

## Alternatives Considered

### Keep computation in TS where "good enough"

Rejected: duplicated logic is the bigger problem. Two implementations of point comparison create divergent behavior and confusion about which is canonical.

### Make brepjs a thin wrapper

Rejected: brepjs's type system, orchestration logic, and runtime integration are genuinely valuable and don't belong in a Rust kernel.

### Maintain both kernels as equal peers indefinitely

Rejected: maintaining two implementations doubles work for new features and bug fixes. brepkit is purpose-built for WASM. OCCT remains available for compatibility.

### Migrate everything at once

Rejected: phased approach validates each step independently, catches boundary design problems early, ships incremental value.

## Related

- [ADR-0001](./0001-layered-architecture.md) — Layered architecture
- [ADR-0002](./0002-kernel-abstraction.md) — Pluggable kernel abstraction (this ADR narrows the strategic direction)
- [ADR-0003](./0003-branded-types.md), [ADR-0004](./0004-phantom-dimension-types.md), [ADR-0005](./0005-topological-validity-types.md) — Type system (brepjs-owned)
