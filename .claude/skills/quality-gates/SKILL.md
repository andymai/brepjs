---
name: quality-gates
description: This skill should be used when a local brepjs quality gate or `npm run validate` step fails and the specific rule's fix or escape hatch is needed — ESLint errors like "no-explicit-any" or "Direct .oc access is banned", pattern-checker "check:patterns" violations (no-double-cast, max-function-lines, require-using-for-handles), a pattern-baseline update, knip flagging an unused export, or the boundary check printing "Layer boundary violations found". Also covers the pattern-baseline trap where an unbaselined violation on main fails every open PR. Not for a red CI run in general (ci-triage) or for hook orchestration and merges (git-pr-workflow).
---

# Quality gates

Pass `npm run validate`, understand every gate's failure output, and reach for the
right escape hatch instead of `--no-verify`. `CLAUDE.md` already lists the headline
rules and hook tiers; this skill adds the failure-output recipes, escape-hatch
mechanics, and the traps those summaries omit.

## The gate map

| Gate            | Command                              | Runs in validate |      Runs in pre-commit       | Elsewhere                 |
| --------------- | ------------------------------------ | :--------------: | :---------------------------: | ------------------------- |
| Typecheck       | `npm run typecheck` (`tsc --noEmit`) |       1/5        |       Tier 1 (parallel)       | CI `typecheck`            |
| ESLint          | `npm run lint` (`eslint src/`)       |       2/5        |    Tier 1 via lint-staged     | CI `lint`                 |
| Boundaries      | `npm run check:boundaries`           |       3/5        |      Tier 1 (`:staged`)       | CI `quality`              |
| Format          | `npm run format:check`               |       4/5        |    Tier 1 via lint-staged     | CI `lint`                 |
| Changed tests   | `npm run test`                       |       5/5        |            Tier 2             | CI `test` (sharded, full) |
| Pattern checker | `npm run check:patterns`             |        —         | lint-staged (staged src only) | CI `quality`              |
| knip            | `npm run knip`                       |        —         |               —               | pre-push + CI `quality`   |

`validate` is `scripts/validate-change.sh`: five steps, **in order, fail-fast**
(`set -e`) — it stops at the first red step and prints nothing after it. Fix
step N before step N+1 is reachable. On success it prints `=== All checks passed ===`.

Pre-commit (`.husky/pre-commit`) runs Tier 1's three checks **in parallel**, so
their output interleaves — read carefully to attribute an error to the right gate.
For hook anatomy, `FULL_TESTS=1`, pre-push, commit-msg, and `--no-verify`, see the
**git-pr-workflow** skill. (Note: `scripts/pre-commit-help.sh` prints "coverage
thresholds enforced at push time" — that line is stale; pre-push runs only knip.)

## ESLint failures

Full config: `eslint.config.js` (flat config, `strictTypeChecked` base). Rules
actually hit in practice and their sanctioned escapes:

| Symptom                                     | Rule                          | Fix / escape                                                                                                                               |
| ------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| "Unexpected any"                            | `no-explicit-any`             | Type it. Only for a real WASM type gap: `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel WASM binding lacks type` |
| "Forbidden non-null assertion"              | `no-non-null-assertion`       | Narrow with a guard; for `noUncheckedIndexedAccess` array reads, add a bounds check or disable-comment                                     |
| "must be imported using a type-only import" | `consistent-type-imports`     | Use `import type { ... }`                                                                                                                  |
| unused var                                  | `no-unused-vars`              | Prefix with `_` (`argsIgnorePattern`/`varsIgnorePattern` = `^_`)                                                                           |
| "Unnecessary conditional"                   | `no-unnecessary-condition`    | The condition is provably always true/false — remove it, don't disable                                                                     |
| switch not exhaustive                       | `switch-exhaustiveness-check` | Handle every union case; a `default` counts as exhaustive                                                                                  |
| "Do not use '// @ts-ignore'"                | `ban-ts-comment`              | Use `// @ts-expect-error -- reason` (the `-- reason` suffix is mandatory); `@ts-ignore`/`@ts-nocheck` are fully banned                     |
| console call                                | `no-console`                  | Only `console.error`/`console.warn` are allowed                                                                                            |
| `export let` / `enum`                       | `no-restricted-syntax`        | Use a getter fn or `const`; use `as const` object + literal union                                                                          |

Two Layer-2+ bans — **"Direct .oc access is banned"** and **"Direct method calls on
.wrapped are banned"** — fire in the domain/high-level dirs. The fix for both is
`getKernel().method(shape.wrapped)`, **never** a disable-comment. The rule mechanics
and the exact directory list live in the **architecture-navigation** skill; for the
correct kernel-method call pattern see **kernel-abstraction**.

`npm run lint` only covers `src/`. Tests are linted at commit time via lint-staged
(`.lintstagedrc.json`), not by `npm run lint`. Prettier config (`.prettierrc.json`):
semicolons, single quotes, `trailingComma: es5`, width 100, LF.

## Pattern checker deep-dive

`scripts/check-patterns.ts` — AST checks ESLint can't express. Five rules, all
severity `error`:

| Rule id                     | Fires when                                                          | Threshold / excusal                                                                                                                |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `no-double-cast`            | `as unknown as T`, `as any as T`, `<T><unknown>expr`                | Use a guard, generic, or branded constructor                                                                                       |
| `no-async-withkernel`       | async callback passed to `withKernel(id, fn)` (bare or member call) | Use `getKernel(id)` for async code (kernel-abstraction skill)                                                                      |
| `require-using-for-handles` | `createHandle()`/`createKernelHandle()` not bound with `using`      | Excused when: `return`ed, passed **directly** as a call argument, or placed in an object/array literal (memory-and-disposal skill) |
| `max-function-lines`        | function body > **60 effective** lines                              | Blanks, comments, and lone-brace lines don't count; extract helpers                                                                |
| `max-nesting-depth`         | > **4** levels of if/for/for-in/for-of/while/do/switch/try          | Depth resets inside nested function bodies; use early returns                                                                      |

The rule id is `require-using-for-handles` (not "missing using") — that exact string
goes in baselines and disable-comments.

**Inline disable:** `// brepjs-patterns-disable: <rule-id>` on the line above the
violation or inline on the same line. `<rule-id>` may be a specific rule or `*` for
all rules on that line.

**Baseline** (`.pattern-baseline.json`, version-2): only _new_ (non-baselined)
violations fail; exit 1 if any. Currently 30 entries (15 `max-function-lines`,
14 `no-double-cast`, 1 `max-nesting-depth`). Fingerprints are content-based
(`file|rule|normalized-80char-snippet|#occurrenceIdx`), so:

- Editing code **above** a violation does NOT reshuffle fingerprints.
- Editing **the violating line itself** (rename, signature change, cast text)
  changes the fingerprint → it reports as "new". This is intended: touch it, own it.

Regenerate after intentionally adding/removing violations:
`npm run check:patterns:baseline` (= `--update-baseline`). Other flags:
`--no-baseline` (report everything, ignore baseline), `--json`, `--sarif`.
Only `src/**/*.ts` is ever scanned (no `.d.ts`, no `src/kernel/wasm/`). Console
failure output ends with the two escape hatches printed verbatim: the disable-comment
format and the `--update-baseline` command.

## TRAP: an unbaselined violation on main fails every open PR

CI's `quality` job runs `check:patterns` over **all** of `src/` and checks out the
PR-merged-with-main commit. So a `max-function-lines`/`no-double-cast` violation that
lands on `main` without a matching baseline entry fails the `quality` job — and thus
the required `ci-pass` aggregate — on **every open PR at once**, even PRs that never
touched that file.

Recovery: land a tiny baseline-bump PR first (`npm run check:patterns:baseline`,
commit `.pattern-baseline.json`). That PR passes because its own merge commit contains
the new baseline; once merged, the other PRs go green. This happens because
lint-staged only runs the pattern checker on **staged** files locally, so a long
function can slip in via a large refactor and only bite in full-src CI. See the
**ci-triage** skill for other `quality`-job failure modes.

## TRAP: function-lookup CI diff after adding a `*Fns.ts` export

Adding a `*Fns.ts` export makes CI's `build` job flag a `docs/function-lookup.md` diff unless the file is regenerated and prettier-normalized before commit — full recipe in the **adding-operations** skill.

## knip (unused exports)

Runs on pre-push and in CI's `quality` job. Config: `knip.config.ts`.

- **Export used only by tests?** knip can't trace `tests/` (separate tsconfig, `@/`
  alias). Tag it `@testOnly` in a JSDoc comment — `tags: ['-testOnly']` treats it as
  used. This is the correct escape, not deleting the export.
- `ignoreExportsUsedInFile: true`; `duplicates` and `optionalPeerDependencies` are off
  (intentional API aliases + the `brepjs-opencascade` optional peer).
- Root workspace checks `src/**/*.ts` only. Companion workspaces (`brepjs-opencascade`,
  `brepjs-voxel-wasm`, `brepjs-viewer`, `brepjs-cad`, `apps/playground`) are fully
  ignored; `brepjs-bim` ignores `examples/**`. See **companion-packages**.

## Boundary check

`scripts/check-layer-boundaries.sh` enforces downward-only imports (target layer ≤
source layer), handling both `@/` alias and relative imports. Violation output:

```
Layer boundary violations found:

  VIOLATION: src/topology/foo.ts (layer 2: topology) imports from '@/sketching/bar.js' (layer 3: sketching)
```

The script's layer map is a superset of the `CLAUDE.md` table — it also places
`csg/voxel/implicit` in Layer 2 and `gear/ns/lattice` in Layer 3. Unrecognized
top-level dirs and root files (`src/index.ts`) are skipped. `--staged` mode
(`check:boundaries:staged`, used by pre-commit) checks only staged files; env
`BOUNDARY_SRC_DIR` overrides the scan root for fixture testing. For where new code
belongs and how to restructure to fix a violation, see **architecture-navigation**.

## Not gated locally (surfaces only in CI)

- **Coverage**: `test` runs `--changed` (changed files, no coverage); `test:full` runs
  the whole suite with `--coverage`. Thresholds run on **main pushes only**,
  `continue-on-error` — informational, never a PR gate. See **writing-tests**.
- **Full test suite**: only the sharded CI `test` job (`test:ci`, no coverage) runs
  everything. Pre-commit runs `--changed` only.
- **size / benchmark**: PR-only CI jobs (`.size-limit.json` budgets; benchmark
  regression vs main). Not in `validate`.

## Additional resources

Adjacent skills own the neighboring facts: `git-pr-workflow` (hook tiers,
conventional commits, `--no-verify`), `architecture-navigation` (layer map, the
`.oc`/`.wrapped` rule + directory list), `kernel-abstraction` (`withKernel` vs
`getKernel`), `memory-and-disposal` (`using` handles), `ci-triage` (CI job failure
modes), `writing-tests` (coverage and the vitest runner config), `adding-operations`
(function-lookup gate), `companion-packages` (workspace layout).
