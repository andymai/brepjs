Add a new geometric operation to brepjs.

## Workflow

1. Ask the user what the operation does and which module it belongs to
2. Read `src/<module>/README.md` for patterns and gotchas
3. Read an existing `*Fns.ts` in that module as a template (`src/topology/booleanFns.ts` is the canonical reference)
4. Implement following the template pattern:
   - Validate inputs → `err(validationError(...))`
   - Call `getKernel().method(shape.wrapped)` — never access `.wrapped` methods directly
   - Cast with `castShape()`, verify with type guards
   - Return `ok(shape)` or `err(...)` — never throw in Layer 2+
5. Export from `src/<module>/index.ts`
6. Re-export from `src/index.ts` and the relevant sub-path entry (e.g., `src/operations.ts`)
7. Write tests in `tests/fn-<name>.test.ts` (see CLAUDE.md "Writing a test")
8. Run `npm run validate`
9. Run `npm run docs:generate-lookup`
