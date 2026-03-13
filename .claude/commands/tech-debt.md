# Tech Debt Reduction — brepjs

You are working on the brepjs codebase to systematically reduce tech debt. Each session, pick **one item** from the prioritized list below and complete it as a standalone PR. Work incrementally — ship small, safe changes.

## Before Starting

1. Run `git status` to confirm a clean working tree
2. Read this file and CLAUDE.md to refresh context
3. Pick the highest-priority **unfinished** item (check GitHub issues with `gh issue list --label tech-debt`)
4. Create a branch: `git checkout -b tech-debt/<item-slug>`

## After Completing Each Item

1. Run `npm run validate` (typecheck + lint + boundaries + format + affected tests)
2. Run `npm run test:coverage` to confirm no coverage regressions
3. Commit with `fix(tech-debt): <description>` or `refactor(tech-debt): <description>`
4. Open a PR with the tech-debt label

---

## Priority 1 — High Impact

### 1.1 Split brepkitAdapter into submodules

**Goal**: Break `src/kernel/brepkitAdapter.ts` (5,687 lines) into a `src/kernel/brepkit/` directory with logical submodules.

**Structure**:

```
src/kernel/brepkit/
├── index.ts          # re-exports BrepkitAdapter class (public interface unchanged)
├── adapter.ts        # main class definition, delegates to submodules
├── booleanOps.ts     # boolean/cut/fuse/common operations
├── constructors.ts   # shape construction (box, cylinder, sphere, etc.)
├── transforms.ts     # translate, rotate, mirror, scale
├── meshOps.ts        # meshing and tessellation
├── queryOps.ts       # measurement, property queries
├── ioOps.ts          # import/export (STEP, BREP, etc.)
└── utils.ts          # shared helpers, enum conversions, WASM interop
```

**Steps**:

1. Read `src/kernel/brepkitAdapter.ts` and categorize all methods
2. Read `src/kernel/defaultAdapter.ts` for comparison — use similar logical groupings
3. Create the directory structure above
4. Move methods into submodules, keeping the adapter class as a thin facade
5. Update `src/kernel/brepkitAdapter.ts` to re-export from `src/kernel/brepkit/index.ts` (backward compat)
6. Run full test suite with `TEST_KERNEL=brepkit npm run test`
7. Verify no import changes needed in consuming code

**Constraints**: External imports of `brepkitAdapter` must not change. The `KernelAdapter` interface must remain satisfied.

---

### 1.2 Blueprint module type safety (incremental, one file per PR)

**Goal**: Replace `eslint-disable` comments for `no-non-null-assertion` in `src/2d/blueprints/` with proper Result/Option types and type guards.

**Order** (by disable count):

1. `src/2d/blueprints/boolean2D.ts` — 17 disables
2. `src/2d/blueprints/lib.ts` — 14 disables
3. `src/2d/blueprints/offset.ts` — 12 disables
4. Remaining files in descending order

**Per-file approach**:

1. Read the file and understand each assertion's context
2. For array index assertions (`arr[i]!` where modulo guarantees bounds): create a `safeIndex<T>(arr: T[], i: number): T` helper in `src/2d/blueprints/helpers.ts` that throws with a descriptive error instead of silently asserting
3. For nullable returns from kernel methods: use `Result<T, E>` from `src/core/result.ts`
4. For "known non-empty" arrays: add runtime validation at the entry point and use proper narrowing
5. Remove each `eslint-disable` comment as the assertion is replaced
6. Run `tests/fn-blueprint*.test.ts` and `tests/fn-2d.test.ts` after each file

**Constraints**: No behavioral changes — only type safety improvements. Every existing test must pass unchanged.

---

### 1.3 Migrate test skip logic from vitest config to per-file guards

**Goal**: Remove the hardcoded `occtOnlyTests` list from `vitest.config.ts` and move skip logic into individual test files.

**Pattern**:

```typescript
import { currentKernel } from './setup.js';

describe.skipIf(currentKernel !== 'occt')('OCCT-specific: <module>', () => {
  // all tests
});
```

**Steps**:

1. Read `vitest.config.ts` and extract the full `occtOnlyTests` list
2. Export `currentKernel` from `tests/setup.ts` (or `tests/setup-kernel.ts`)
3. For each file in the list:
   a. Wrap the top-level `describe` in `describe.skipIf(currentKernel !== 'occt')`
   b. Remove the file from the `occtOnlyTests` array in vitest config
4. Once the list is empty, remove the `occtOnlyTests` variable and simplify vitest config
5. Run `npm run test` and `TEST_KERNEL=brepkit npm run test` to verify skip behavior is identical

**Constraints**: Test behavior must be identical before and after. No test should newly pass or fail.

---

## Priority 2 — Medium Impact

### 2.1 Targeted type cast reduction

**Goal**: Reduce `as` casts in files with 10+ occurrences, focusing on unnecessary ones.

**High-cast files** (audit in this order):

1. `src/topology/shapeFns.ts` — 38 casts
2. `src/2d/blueprints/approximations.ts`
3. `src/2d/blueprints/offset.ts`
4. Other files with 10+ casts

**Approach per file**:

1. Read the file and categorize each cast:
   - **Trust cast** (branded types like `as ClosedWire`): Leave if invariant holds by construction per ADR-0005
   - **Generic preservation** (`as T`): Try to fix with better generic constraints or overloads
   - **WASM type gap** (`as any`): Leave with eslint-disable comment
   - **Unnecessary**: Remove and let TypeScript infer
2. Only remove casts where the compiler can prove correctness without them
3. Run typecheck after each file

---

### 2.2 Consolidate test scripts

**Goal**: Simplify `package.json` test scripts from 5 to 3.

**Keep**:

- `test` — changed files only, no coverage (**new behavior** — currently `test:affected`; the old full-suite `test` script will be replaced)
- `test:full` — all tests + coverage thresholds (current `test:coverage`)
- `test:brepkit` — brepkit kernel tests (current `test:brepkit`)

**Remove**:

- `test:coverage:changed` — redundant with the new `test` (both run changed files without coverage thresholds)
- `test:all` — can be done with `test:full` + `TEST_KERNEL=brepkit npm run test`

**Steps**:

1. Update `package.json` scripts
2. Update any references in CI (`.github/workflows/ci.yml`), git hooks, and CLAUDE.md
3. Verify `npm run validate` still works (it calls test scripts)

---

### 2.3 Audit public API surface with knip

**Goal**: Identify exports in `src/index.ts` that are unused by consumers and consider moving them to subpath exports.

**Steps**:

1. Run `npx knip --include exports` and review results
2. For any flagged exports, check if they're used in the test suite or docs
3. Categorize: keep (used), move to subpath (internal but needed), remove (dead)
4. For "move to subpath" items, add them to a `brepjs/internals` subpath export in `package.json`
5. Update `src/index.ts` to remove moved exports
6. Update the public API test (`tests/public-api-types.test.ts`)

---

### 2.4 Relax Node.js engine constraint

**Goal**: Change `"engines": { "node": ">=24 <25" }` to `"node": ">=24"`.

**Steps**:

1. Update `package.json` engines field
2. Check CI matrix (`.github/workflows/ci.yml`) — ensure it tests on Node 24
3. Grep for any Node-version-specific code or polyfills
4. Update CLAUDE.md if it references the engine constraint

---

## Priority 3 — Build & Bundle

### 3.1 Tree-shaking and bundle audit

**Goal**: Verify tree-shaking works correctly and identify optimization opportunities.

**Steps**:

1. Run `npm run build` and check output sizes per entry point
2. Compare against size-limit config in `package.json` — are limits tight or loose?
3. Check if `minify: false` in `vite.config.ts` is intentional — if so, document why. If not, enable for production builds.
4. Use `npx vite-bundle-visualizer` (or similar) to identify unexpectedly large chunks
5. Check that internal-only code isn't accidentally included in entry points
6. Tighten size-limit thresholds if there's headroom

### 3.2 Dead code sweep

**Goal**: Run knip in strict mode and remove any dead code.

**Steps**:

1. Run `npx knip` and review all findings
2. For each finding, verify it's truly unused (not just dynamically referenced)
3. Remove confirmed dead code
4. Update exports and imports accordingly
5. Run full test suite

---

## Tracking

Each item should have a corresponding GitHub issue with the `tech-debt` label. Create issues with:

```bash
gh label create tech-debt --description "Tech debt reduction" --color "D4C5F9"
gh issue create --title "tech-debt: <item title>" --label tech-debt --body "<description from above>"
```

When starting an item, assign yourself and move to "In Progress". When the PR merges, close the issue.

---

## Ground Rules

- **One item per PR** — keep changes reviewable
- **No behavioral changes** — tech debt PRs must not change functionality
- **Tests must pass** — `npm run validate` is the minimum bar
- **Coverage must not drop** — check `npm run test:coverage` thresholds
- **Boundary rules still apply** — `npm run check:boundaries` must pass
- **Don't boil the ocean** — if an item is larger than expected, split it further
