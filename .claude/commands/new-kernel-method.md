Add a new method to the kernel abstraction layer.

## Workflow

1. Ask the user what kernel capability is needed and why
2. Read `src/kernel/types.ts` (`KernelAdapter` interface), the relevant `*Ops.ts`, and `DefaultAdapter.ts`

## Implementation Steps

1. **Add to interface** in `src/kernel/types.ts`
   - Use branded types for shape parameters, accept `OcShape` for raw handles
   - Return `OcShape` or primitives — Layer 2 wraps in `Result`
2. **Implement in `*Ops.ts`**
   - Receives `oc` instance as parameter (not via `getKernel()`)
   - All kernel methods are synchronous
   - Handle OCCT enum values: `typeof val === 'number' ? val : Number(val?.value ?? val)`
3. **Wire in `DefaultAdapter.ts`** — delegate to the `*Ops` function
4. **Use in Layer 2+** via `getKernel().methodName()` — never import `*Ops` directly outside kernel

Tests go through Layer 2 functional API, not by testing `*Ops` directly.
