# ADR-0007: Kernel Interface Segregation

**Status**: Accepted
**Date**: 2026-03-14
**Authors**: Andy Aragon

## Context

The `KernelAdapter` interface in `src/kernel/types.ts` grew to 204 methods covering
boolean operations, shape construction, sweeps, transforms, meshing, I/O, measurement,
topology, geometry, repair, and evolution tracking. Both adapters (OCCT and brepkit)
implement the full interface at 100% coverage.

While the code was healthy, the monolithic interface violated the Interface Segregation
Principle (ISP):

- **Cognitive overhead**: New contributors faced a 900-line interface with no domain
  grouping beyond inline comments.
- **Documentation**: JSDoc for cross-kernel behavioral differences (22 items from
  ADR-0006 Appendix A) had no structural home — notes floated between unrelated methods.
- **Partial implementations**: A future lightweight kernel (e.g., measurement-only or
  mesh-only) would be forced to stub hundreds of irrelevant methods.
- **OCCT alignment**: OCCT itself organizes into modular packages (BRepAlgoAPI,
  BRepPrimAPI, BRepFilletAPI, BRepOffsetAPI, GProp, etc.). Our monolith obscured
  the natural domain boundaries.

## Decision

Decompose `KernelAdapter` into 12 domain-aligned sub-interfaces composed via
TypeScript intersection type. Additionally:

- Extract adapter implementations into module-level functions (completing the
  delegation pattern for DefaultAdapter, and creating `src/kernel/brepkit/` for
  BrepkitAdapter).
- Add runtime Promise detection to `withKernel()` for async safety.
- Consolidate `round2.ts` and `round5.ts` into `precisionRound.ts`.

### Sub-interface mapping

| Interface               | Count | CAD Domain Analog                                                                                                          |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------- |
| `KernelCore`            | 8     | Kernel lifecycle, identity, batch execution, arena management                                                              |
| `KernelBooleanOps`      | 8     | BRepAlgoAPI (boolean algebra + splitting + mesh booleans)                                                                  |
| `KernelConstructionOps` | 42    | BRepPrimAPI + BRepBuilderAPI (primitives, edges, wires, faces, hulls, surfaces, geometry factories)                        |
| `KernelSweepOps`        | 12    | BRepOffsetAPI (extrude, revolve, loft, sweep, pipe shell, draft prism)                                                     |
| `KernelModifierOps`     | 12    | BRepFilletAPI + BRepOffsetAPI (fillet, chamfer, shell, offset, draft, defeature, simplify, reverse)                        |
| `KernelTransformOps`    | 11    | BRepBuilderAPI_Transform (transforms, patterns, positionOnCurve)                                                           |
| `KernelEvolutionOps`    | 15    | Shape history tracking (\*WithHistory variants + composed transforms)                                                      |
| `KernelMeshOps`         | 4     | BRepMesh (tessellation + mesh preparation)                                                                                 |
| `KernelIOOps`           | 23    | STEPControl + IGESControl + XCAF (import/export + serialization + export helpers)                                          |
| `KernelMeasureOps`      | 10    | GProp + BRepBndLib (volume, area, length, bbox, distance, curvature)                                                       |
| `KernelTopologyOps`     | 14    | TopExp + BRepTools (iteration, comparison, hashing, adjacency, sewing)                                                     |
| `KernelGeometryOps`     | 31    | BRep_Tool + BRepAdaptor + BRepClass (vertex/face/edge/curve queries, classification, NURBS, feature detection, projection) |
| `KernelRepairOps`       | 10    | ShapeFix + ShapeAnalysis (validation, healing, fixing)                                                                     |
| `Kernel2DCapability`    | 70+   | 2D geometry (unchanged, stays in `kernel2dTypes.ts`)                                                                       |

### Composition

```typescript
export type KernelAdapter = KernelCore &
  KernelBooleanOps &
  KernelConstructionOps &
  KernelSweepOps &
  KernelModifierOps &
  KernelTransformOps &
  KernelEvolutionOps &
  KernelMeshOps &
  KernelIOOps &
  KernelMeasureOps &
  KernelTopologyOps &
  KernelGeometryOps &
  KernelRepairOps &
  Kernel2DCapability;
```

### File layout

```
src/kernel/
  interfaces/
    index.ts          # Barrel — composes KernelAdapter, re-exports all
    core.ts           # KernelCore
    boolean-ops.ts    # KernelBooleanOps
    construction-ops.ts
    sweep-ops.ts
    modifier-ops.ts
    transform-ops.ts
    evolution-ops.ts
    mesh-ops.ts
    io-ops.ts
    measure-ops.ts
    topology-ops.ts
    geometry-ops.ts
    repair-ops.ts
  brepkit/            # Extracted BrepkitAdapter implementations
    helpers.ts
    booleanOps.ts
    constructionOps.ts
    sweepOps.ts
    modifierOps.ts
    transformOps.ts
    evolutionOps.ts
    meshOps.ts
    ioOps.ts
    measureOps.ts
    topologyOps.ts
    geometryOps.ts
    repairOps.ts
  types.ts            # Shared types + re-exports KernelAdapter
  kernel2dTypes.ts    # Kernel2DCapability (unchanged)
```

## Consequences

### Positive

- **Better documentation**: Each sub-interface has focused JSDoc with cross-kernel
  notes, `@see` references, and OCCT package analogs.
- **Partial kernel implementations**: A measurement-only kernel need only implement
  `KernelCore & KernelMeasureOps`.
- **Clearer dependency graph**: Layer 2+ code can import specific sub-interfaces
  for documentation purposes (runtime still uses full `KernelAdapter`).
- **Adapter decomposition**: BrepkitAdapter goes from 5,622 LOC monolith to
  ~13 focused module files.
- **Async safety**: `withKernel()` now throws at runtime if a Promise is returned,
  preventing silent kernel-switch bugs.

### Negative / Trade-offs

- **More files**: 13 sub-interface files + 13 brepkit module files added.
- **Indirection**: Method assignment to sub-interfaces is a judgment call;
  some methods could reasonably belong in multiple domains.
- **No runtime effect**: Sub-interfaces are erased at compile time. The
  intersection type produces the same runtime shape as the original interface.

## Alternatives Considered

### Namespace-based grouping

Group methods under namespaced objects (`kernel.boolean.fuse()` instead of
`kernel.fuse()`). Rejected because it would break every callsite in the codebase
and add runtime overhead for property access.

### Mixin classes

Use abstract base classes with `implements` for each domain. Rejected because
TypeScript mixins have complex prototype chain semantics and the existing
adapters already use `class implements KernelAdapter`.

### Keep monolithic + better comments

Just add section headers and JSDoc to the existing interface. Rejected because
it doesn't enable partial implementations or sub-interface-level type narrowing.

## Related

- ADR-0002: Kernel Abstraction — established the KernelAdapter pattern
- ADR-0006: Domain Boundaries — documented 22 cross-kernel behavioral differences
  that informed sub-interface JSDoc
- OCCT package structure: BRepAlgoAPI, BRepPrimAPI, BRepFilletAPI, BRepOffsetAPI,
  GProp, BRepBndLib, TopExp, BRep_Tool, ShapeFix
