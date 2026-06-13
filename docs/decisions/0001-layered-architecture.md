# ADR-0001: Layered Architecture with Enforced Boundaries

**Status**: Accepted
**Date**: 2024-01-01 (retroactive)

## Context

brepjs is a CAD library with complex internal dependencies between geometry, topology, operations, and high-level APIs. Without explicit boundaries, circular dependencies and architectural erosion are inevitable.

## Decision

Adopt a strict four-layer architecture with enforced unidirectional imports:

- **Layer 0** (`kernel/`, `utils/`): Foundation, no internal imports
- **Layer 1** (`core/`): Memory management, geometry, constants, imports kernel/utils only
- **Layer 2** (`topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/`, `worker/`): Domain, imports layers 0-1 + peers
- **Layer 3** (`sketching/`, `text/`, `projection/`): High-level API, imports all lower layers

Boundaries are enforced by `npm run check:boundaries`, which runs in pre-commit hooks and CI.

## Consequences

### Positive

- Clear dependency direction prevents circular imports
- Each layer can be tested in isolation
- New contributors can reason about the architecture from the layer model
- Enables future tree-shaking by sub-package

### Negative / Trade-offs

- Some code placement decisions are constrained by layer rules
- Occasionally requires creating pass-through re-exports

## Related

- `scripts/check-boundaries.ts`: enforcement script
- `docs/architecture.md`: detailed architecture documentation
