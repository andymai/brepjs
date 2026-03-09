# ADR-0002: Pluggable Kernel Abstraction Layer

**Status**: Accepted
**Date**: 2024-06-01 (retroactive)

## Context

brepjs originally depended directly on OpenCascade (OCCT) via Emscripten WASM. This created tight coupling to a single geometry kernel, preventing alternative implementations and limiting performance optimization opportunities.

## Decision

Introduce a `KernelAdapter` interface that abstracts all kernel operations. Domain code (Layer 2+) calls `getKernel().method()` instead of accessing OCCT directly. Kernel implementations are registered via `registerKernel()` and selected via `withKernel()`.

## Consequences

### Positive

- Multiple kernels can coexist (OCCT, brepkit, future GPU-accelerated)
- Enables benchmarking kernels against each other
- Domain code is kernel-agnostic — cleaner separation of concerns
- ESLint rules enforce the abstraction (`no-restricted-syntax` bans `.oc` access)

### Negative / Trade-offs

- Adapter interface is large (~100 methods) and must be kept in sync
- Some OCCT-specific optimizations are harder to express through the abstraction
- `withKernel()` is sync-only — async code must use `getKernel(id)` directly

## Related

- ADR-0001 (kernel is Layer 0)
- ADR-0006 (narrows strategic direction — brepkit is the primary kernel)
- `src/kernel/types.ts` — `KernelAdapter` interface
- `docs/kernel-swap.md` — user-facing guide
