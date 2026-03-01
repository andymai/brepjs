# Engineer Agent Memory

## Disposal Migration Task 4
- Migrating `src/topology/` files from `gcWithScope`/`localGC` to `DisposalScope`
- Pattern A: `gcWithScope()` -> `using scope = new DisposalScope()`, `r(x)` -> `scope.register(x)`
- Pattern B: `localGC()` -> same, plus remove `gc()` calls
