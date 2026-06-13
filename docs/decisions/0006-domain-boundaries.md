# ADR-0006: Domain Boundaries Between brepjs and brepkit

**Status**: Accepted
**Date**: 2026-03-09

## Context

brepjs is a TypeScript CAD library with a pluggable kernel abstraction (ADR-0002). brepkit is a Rust/WASM kernel implementation. As brepkit matures, problems have emerged:

- **Duplicated logic**: 2D vector math, precision constants, point comparison, and offset algorithms exist in both TypeScript and Rust. Bugs fixed in one are not fixed in the other.
- **Unclear ownership**: No principled answer to "does this belong in TypeScript or Rust?"
- **Migration debt**: Code that predates brepkit should move to the kernel, but no plan exists.

**Relationship to ADR-0002**: ADR-0002 treats all kernels as equal peers. This ADR narrows that: brepkit is the strategic kernel. OCCT remains supported for compatibility. The `KernelAdapter` interface and mechanisms are unchanged; only the strategic priority shifts.

## Decision

### Guiding Principle

**brepkit owns computation. brepjs owns the TypeScript developer experience.**

### Decision Heuristic

When deciding where new code belongs, apply in order:

1. **Evaluates geometry or traverses topology?** → brepkit. Examples: surface intersection, point classification, curve offset, measurement.
2. **Depends on a JS library or browser API?** → brepjs. Examples: opentype.js font parsing, Web Workers, Three.js conversion.
3. **Composes kernel operations into a user workflow?** → brepjs. Examples: Sketcher DSL, Blueprint builder, assembly mate sequencing.
4. **Defines types, error handling, or memory management?** → brepjs. Examples: branded types, `Result<T,E>`, `DisposalScope`.

**When rules conflict**: Rule 1 wins for the computational core; rule 3 wins for the sequencing layer. Split accordingly. Example: assembly mate solving. Distance/angle computation is brepkit (rule 1), constraint resolution order is brepjs (rule 3).

**Hot-path exception**: If a pure-TS function is called in a tight inner loop and WASM call overhead dominates computation cost, it may remain in TypeScript with a comment citing this ADR. Profile before deciding. Candidates: `samePoint()`, `distance2d()` in Blueprint boolean inner loops.

For existing code: if a pure-TS function reimplements something the kernel provides, it is a migration candidate.

### Domain Ownership

**brepkit** (Rust/WASM): all geometry evaluation and topology traversal:

Primitives, booleans, shape modification (extrude/revolve/sweep/loft/fillet/chamfer/shell/draft/offset/thicken), tessellation, measurement, queries, healing/validation, data exchange (STEP/IGES round-trip, mesh format import into B-Rep), 2D geometry (curves/booleans/offset/vector math/precision), sketch constraint solving, projection/HLR, transforms.

**brepjs** (TypeScript): everything between the kernel and end user:

Type system (ADRs 0003-0005, `Result<T,E>`), orchestration (composing kernel calls into workflows), `KernelAdapter` interface, memory management (`DisposalScope`, `createHandle()`), error translation, Sketching DSL, Blueprint DSL, text rendering (opentype.js), runtime integration (Web Workers, Three.js), format adapters (SVG/DXF parsing, OBJ/glTF/3MF export formatting), color/material storage (`colorFns.ts`, stays in TS unless the kernel adds native per-shape color), package distribution.

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

### Phase 1: Pure-TS 2D Math (target: v12), ✅ Complete

**Target**: `src/2d/lib/vectorOperations.ts`, `src/2d/lib/precision.ts`, `src/2d/lib/utils.ts`: pure TS math (`samePoint`, `add2d`, `distance2d`, `crossProduct2d`, etc.) duplicating brepkit-math.

**Not in scope**: `Curve2D.ts` and `BoundingBox2d.ts` (wrapper classes around kernel handles, not duplicated computation). Blueprint DSL (orchestration, brepjs-owned). Migration replaces lib function _implementations_ with kernel calls, not the TS API surface.

**Existing infrastructure**: The `Kernel2D` sub-interface (`src/kernel/kernel2dTypes.ts`) and brepkit implementation (`src/kernel/brepkit2d.ts`) already exist. `BoundingBox2d.ts` already uses `getKernel2D()`. This migration extends that infrastructure, not creates it from scratch.

**Acceptance criteria**: No pure-TS geometry math in `src/2d/lib/` except hot-path functions retained under the performance exception. Blueprint imports compile unchanged. Both kernel test paths pass.

**Progress**:

- v11: Consolidated `Point2D` type, 13 vector functions, and 3 precision constants into canonical `src/utils/vec2d.ts` (Layer 0). `vectorOperations.ts`, `precision.ts`, and `definitions.ts` re-export from canonical source. (#422)
- v11: V8 CPU profiling confirmed all 13 vectorOperations functions are hot-path (~0.02µs/call); WASM call overhead would dominate computation cost. All functions retained in TS under the hot-path exception. (#421)
- v11: Documented `brepkit2d.ts` struct-field math duplication as architectural; inline `c.ox`/`c.dy` access avoids temporary tuple allocations.

**Resolution**: All 13 functions qualify for the hot-path exception. No pure-TS geometry math remains that should migrate to kernel. Acceptance criteria met.

### Phase 2: Tessellation Normals/UVs (target: v12), ✅ Complete

**Target**: OCCT mesh path in `src/kernel/meshOps.ts` that builds normals via low-level OCCT API orchestration (`Poly_Connect`, `StdPrs_ToolTriangulatedShape.Normal()`). brepkit already returns normals/UVs. Migrate the OCCT adapter to a single higher-level call matching brepkit's interface.

**Not in scope**: `threeHelpers.ts` (format conversion, brepjs-owned). Export formatters in `src/io/` (consume mesh output, don't compute geometry).

**Acceptance criteria**: Both adapters return normals and UVs as part of `KernelMeshResult`. No TS code iterates triangulation data to compute normals. Formatters and Three.js helpers work unchanged.

**Progress**:

- v11: extracted per-face mesh logic into `_meshFace()` helper, isolating normal computation into a single function mirroring brepkit's `meshSingleFace()`. (#426)
- v12: **BREAKING**: removed JS mesh fallback entirely (`meshJS`, `_meshFace`, `meshEdgesJS`, UV detection cache). C++ `MeshExtractor`/`EdgeMeshExtractor` are now required. All normal/UV computation happens in C++ via single WASM calls. Net -440 lines. (#429)

### Phase 3: Ongoing Boundary Cleanup

- **Projection**: `projectionPlanes.ts` is pure data/type definitions (lookup table, type guard); stays in TS. `cameraFns.ts` (~110 lines) performs 3D vector math for view setup; evaluated against heuristic: stays in TS (pure coordinate math on Vec3 tuples, no topology/geometry, no WASM benefit). Citation added in v11 (#427).
- **Color storage**: Migrate from TS-side `Map` to kernel storage if brepkit adds native per-shape color.
- **New capabilities**: Evaluate against decision heuristic before implementation.

### Phase 4: OCCT Adapter Alignment (Ongoing), ✅ Complete

- Core operations (booleans, extrude, fillet, measurement, IO): OCCT adapter must implement.
- New `KernelAdapter` methods after migration: OCCT adapter may throw "capability not supported" `BrepError`.
- `TEST_KERNEL` dual-test matrix continues. brepkit-only tests use `describe.skipIf(kernel === 'occt')`.

**Progress (v11)**:

- Added `UNSUPPORTED` error kind, `UNSUPPORTED_CAPABILITY` error code, and `unsupportedError()` constructor for kernel adapters to signal missing capabilities. (#424)

**Progress (v12)**:

- Comprehensive capability audit: both adapters implement all 162 KernelAdapter 3D methods and all 47 Kernel2DCapability methods. No stubs or missing implementations found.
- Behavioral differences documented (see Appendix A below).
- Comprehensive parity test suite added to `tests/kernel-agreement.test.ts` covering booleans, transforms, sweep/extrude/revolve, fillet/chamfer, measurement, and 2D geometry. On-demand via dual-kernel test runner.
- Optional capability gaps are properly type-guarded: `gridPattern?` (brepkit-only), `ProjectionCapability` (separate interface, neither adapter implements `projectShape()` yet).

**Resolution**: Both adapters are functionally complete. The remaining differences are behavioral (tolerance strategies, approximation algorithms) rather than missing capabilities. The `unsupportedError()` infrastructure is in place for future capability divergence.

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
- Single source of truth for geometry/math: no more duplicated implementations
- Numerically intensive code runs in optimized Rust/WASM
- Each domain testable independently

### Negative / Trade-offs

- **Migration effort**: Phase 1 touches ~15 files; Blueprint imports must be preserved
- **Debugging friction**: WASM is harder to debug in browser devtools than TypeScript
- **WASM boundary overhead**: Fine-grained operations may be slower via WASM; profile before migrating hot paths
- **Kernel coupling**: brepjs becomes more dependent on brepkit's release cadence
- **OCCT divergence**: As brepkit gains capabilities OCCT doesn't implement, the dual-kernel promise weakens
- **Strategic bet**: Declaring brepkit as the strategic kernel narrows optionality

## Alternatives Considered

### Keep computation in TS where "good enough"

Rejected: duplicated logic is the bigger problem. Two implementations of point comparison create divergent behavior and confusion about which is canonical.

### Make brepjs a thin wrapper

Rejected: brepjs's type system, orchestration logic, and runtime integration are genuinely valuable and don't belong in a Rust kernel.

### Maintain both kernels as equal peers indefinitely

Rejected: maintaining two implementations doubles work for new features and bug fixes. brepkit is purpose-built for WASM. OCCT remains available for compatibility.

### Migrate everything at once

Rejected: phased approach validates each step independently, catches boundary design problems early, ships incremental value.

## Appendix A: Cross-Kernel Behavioral Differences

Audit of behavioral differences between DefaultAdapter (OCCT) and BrepkitAdapter. Last updated for brepkit-wasm v1.0.8.

### Interface Coverage

| Interface            | Methods | OCCT            | brepkit        |
| -------------------- | ------- | --------------- | -------------- |
| KernelAdapter (3D)   | 162     | 161/162 (99.4%) | 162/162 (100%) |
| Kernel2DCapability   | 47      | 47/47 (100%)    | 47/47 (100%)   |
| ProjectionCapability | 1       | ✗               | ✗              |

The only OCCT gap is `gridPattern?` (optional, brepkit-exclusive). Neither adapter implements `projectShape()` from `ProjectionCapability`.

### Behavioral Differences

| Category        | Method(s)                      | OCCT Behavior                                                    | brepkit Behavior                                                                                                                                                   | Impact                                                              |
| --------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Booleans**    | `fuse`, `cut`, `intersect`     | Accepts `BooleanOptions` with configurable tolerance             | Ignores tolerance parameters (fixed internal handling)                                                                                                             | Low: default tolerances work for typical use                        |
| **Booleans**    | `fuse`, `cut` (compound tools) | Direct operation                                                 | Iteratively decomposes compound tools into child solids                                                                                                            | Medium: may produce different topology for compound inputs          |
| **Booleans**    | `section`                      | Native section with approximation parameter                      | Extracts plane from face geometry; ignores approximation                                                                                                           | Low: different algorithm, same geometric result                     |
| **Fillet**      | `fillet`                       | Full variable-radius support (array of radii)                    | Constant radius only (takes first element of array); `filletVariable` WASM API available                                                                           | Medium: adapter still uses constant fallback                        |
| **Fillet**      | `fillet` (validation)          | Fillet results pass `BRepCheck_Analyzer`                         | `validateSolidRelaxed()` accepts fillet results; strict `validateSolid()` reports NURBS artifacts                                                                  | Low: `isValid()` now returns true (relaxed mode)                    |
| **Chamfer**     | `chamfer`                      | Two-distance chamfer support                                     | Constant distance only (drops second distance)                                                                                                                     | Medium: asymmetric chamfers silently degrade                        |
| **Chamfer**     | `chamferDistAngle`             | Native dist-angle support                                        | Approximates via `d2 = d * tan(angle)`, then averages                                                                                                              | Medium: approximation may diverge for steep angles                  |
| **Shell**       | `shell`                        | Direct face ID operation; passes validation                      | Face ID resolution with normal-matching fallback; `validateSolidRelaxed()` accepts results                                                                         | Low: `isValid()` now returns true (relaxed mode)                    |
| **Meshing**     | `mesh`                         | Respects both `tolerance` and `angularTolerance`                 | Uses `tolerance` only; hardcoded `DEFAULT_DEFLECTION = 0.01`                                                                                                       | Low: slightly different tessellation density                        |
| **Meshing**     | `meshEdges`                    | Uses both tolerance parameters; returns all topology edges       | Uses `meshEdgesAll` (unfiltered) for parity; `tolerance` only, enforces `Math.max(tol, 0.001)`                                                                     | Low: tolerance-only difference remains                              |
| **Meshing**     | `hasTriangulation`             | Checks cached triangulation                                      | Always returns `false` (on-demand tessellation)                                                                                                                    | Low: behavioral, no geometric impact                                |
| **Sweep**       | `loft`                         | Takes wires directly; supports `ruled`, `startShape`, `endShape` | Converts wires to faces; ignores `ruled`/`startShape`/`endShape`                                                                                                   | Medium: loft options silently ignored                               |
| **Sweep**       | `sweep`                        | Native sweep with transition mode                                | Extracts NURBS data from spine; ignores `transitionMode`                                                                                                           | Medium: transition mode silently ignored                            |
| **Transforms**  | `generalTransform`             | Uses OCCT transform objects                                      | Expects 16-element row-major matrix; throws for other inputs                                                                                                       | Low: consistent API, different internal representation              |
| **Transforms**  | `mirror` (non-solid)           | Delegates all shapes to OCCT                                     | Solids: native `bk.mirror()`; non-solids: computed `mirrorMatrix()`                                                                                                | Low: same result, different code path                               |
| **Validity**    | `isValid`                      | OCCT `BRepCheck_Analyzer` (strict geometry + topology check)     | `validateSolidRelaxed()` for general checks (tolerates NURBS artifacts); `validateSolid()` strict mode used only for `isManifoldShell` proof via `isValidStrict()` | Low: relaxed validation aligns with OCCT acceptance of NURBS shapes |
| **Curves**      | `interpolatePoints`            | Configurable tolerance                                           | Fixed degree = min(3, n−1); ignores tolerance                                                                                                                      | Low                                                                 |
| **Curves**      | `approximatePoints`            | OCCT approximation algorithm                                     | `approximateCurveLspia()` with hardcoded max_iter=100, degree=3                                                                                                    | Low                                                                 |
| **Curves**      | `makeBezierEdge`               | Native Bezier representation                                     | Converts Bezier to NURBS (degree=n−1, uniform knots)                                                                                                               | Low: mathematically equivalent                                      |
| **Curves**      | `makeTangentArc`               | Native tangent-arc construction                                  | Approximates as cubic Bezier with control points at 1/3 distance                                                                                                   | Medium: approximation diverges for large arcs                       |
| **I/O**         | `toBREP` / `fromBREP`          | OCCT's native BREP format                                        | Proxies to STEP export/import (not OCCT BREP format). Native `toBREP` exists but returns JSON, not compatible with OCCT format                                     | High: format mismatch, round-trip not cross-kernel compatible       |
| **I/O**         | STEP/STL export (multi-shape)  | Native multi-shape export                                        | Exports each solid individually and concatenates                                                                                                                   | Low: same result, different implementation                          |
| **Measurement** | `volume`, `area`               | OCCT native measurement                                          | Uses `DEFAULT_DEFLECTION = 0.01` for tessellation-based measurement                                                                                                | Low: slight numerical differences expected                          |

### Resolved in v0.10.0–v1.0.8 (previously listed)

These differences existed in brepkit-wasm v0.7.3 but have been resolved:

- **Validity: primitives**: `validateSolid()` no longer reports false negatives for cylinders, cones, tori, and spheres. Primitives now pass validation.
- **Validity: booleans**: `fuse`, `intersect`, `fuseAll` results now pass validation. `cut` and `cutAll` results pass in most cases.
- **Validity: fillets/shells**: `validateSolidRelaxed()` (v0.10.1) tolerates NURBS approximation artifacts on fillet and shell results. `isValid()` now returns true for these shapes, matching OCCT behavior.
- **Chamfer: validation**: chamfer and `chamferDistAngle` results now pass validation.
- **Meshing: smooth-edge filtering**: brepkit-wasm v1.0.8 changed `meshEdges` to auto-filter smooth edges (tangent-continuous edges along fillets/rounds). Adapter switched to `meshEdgesAll` (unfiltered) to restore OCCT parity. Filtered `meshEdges` remains available in brepkit for future use.

### Key Takeaways

1. **No missing capabilities**: both adapters implement the full interface. Gaps are behavioral, not functional.
2. **Tolerance divergence**: brepkit generally ignores caller-provided tolerances in favor of hardcoded defaults. This is the most pervasive difference.
3. **Silent degradation**: variable-radius fillet, asymmetric chamfer, loft options, and sweep transition modes silently fall back to simpler behavior on brepkit. Warnings are emitted via `warnOnce()`.
4. **Validation divergence**: brepkit now uses a two-tier strategy: `validateSolidRelaxed()` for general `isValid()` checks (accepts NURBS approximation artifacts, matching OCCT behavior) and `validateSolid()` strict mode for `isManifoldShell` proofs via the optional `isValidStrict()` adapter method. This resolves most false negatives from v0.7.3–v0.10.0.
5. **BREP format**: `toBREP`/`fromBREP` are not cross-kernel compatible. brepkit has a native `toBREP` (JSON format) but the adapter still uses STEP proxy for round-trip compatibility.

## Related

- [ADR-0001](./0001-layered-architecture.md): Layered architecture
- [ADR-0002](./0002-kernel-abstraction.md): Pluggable kernel abstraction (this ADR narrows the strategic direction)
- [ADR-0003](./0003-branded-types.md), [ADR-0004](./0004-phantom-dimension-types.md), [ADR-0005](./0005-topological-validity-types.md): Type system (brepjs-owned)
