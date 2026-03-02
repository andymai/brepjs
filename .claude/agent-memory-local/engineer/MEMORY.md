# Engineer Agent Memory

## Kernel Abstraction (Complete)

- All OCCT access goes through `getKernel()` / `getKernel2D()` — Layer 2+ code never calls methods on `.wrapped`
- ESLint `no-restricted-syntax` enforces this in Layer 2+ files
- OCCT Emscripten returns enum objects with `.value` property — use `typeof val === 'number' ? val : Number(val?.value ?? val)`
- `Curve2D.adaptor()` removed — use kernel methods: `getCurve2dType`, `getCurve2dBounds`, `getCurve2dCircleData`, etc.

## Disposal Patterns

- Use `using scope = new DisposalScope()` + `scope.register(x)` for kernel object cleanup
- `gcWithScope()`/`localGC()` are deprecated — use DisposalScope
