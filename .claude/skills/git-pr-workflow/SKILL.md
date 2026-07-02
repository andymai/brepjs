---
name: git-pr-workflow
description: This skill should be used when committing, pushing, branching, or merging in the brepjs repository — when a task involves "pre-commit hook failed" (which tier ran, how to bypass), "commit rejected by commitlint", "subject may not be empty", the pre-push knip tier firing, "create a branch", "set up a worktree", "open a PR", "arm auto-merge", or deciding whether a commit needs a `!` breaking marker. Covers hook anatomy and tiers, conventional-commit message format, branching, worktrees, and the PR/merge process. For diagnosing a specific gate or lint error see quality-gates; for a red CI job see ci-triage.
---

# Git hooks, commits, and PR flow

Hooks are managed by husky (`core.hooksPath` → `.husky/_`, installed by the `prepare` script in `package.json`). The repo `CLAUDE.md` "Git hooks" section summarizes the tiers; this skill covers what to do when a gate fires and the traps around commits, worktrees, and merging.

## Quick map

| Concern              | Where it lives                                                               |
| -------------------- | ---------------------------------------------------------------------------- |
| Hook scripts         | `.husky/pre-commit`, `.husky/pre-push`, `.husky/commit-msg`                  |
| lint-staged config   | `.lintstagedrc.json` (NOT in `package.json`)                                 |
| Commit message rules | `commitlint.config.js` (`@commitlint/config-conventional`)                   |
| Local full gate      | `npm run validate` (`scripts/validate-change.sh`)                            |
| CI gate for merge    | `ci-pass` job in `.github/workflows/ci.yml` — the only required status check |
| PR template          | `.github/pull_request_template.md`                                           |
| Merge method         | Squash only; branch auto-deleted on merge                                    |

## Pre-commit anatomy

`.husky/pre-commit` runs three tiers; a `trap` prints `scripts/pre-commit-help.sh` on any failure.

**Tier 1 (parallel):**

- `npx lint-staged` — per `.lintstagedrc.json`: `src/**/*.ts` gets `eslint --fix` + `prettier --write` + the pattern checker (`scripts/check-patterns.ts`); `tests/**/*.ts` gets eslint + prettier only; `*.config.ts` and `*.md` get prettier only. The pattern checker runs only on `src/` files.
- `npm run typecheck`
- `npm run check:boundaries:staged` — the staged variant (`scripts/check-layer-boundaries.sh --staged`), not plain `check:boundaries`. On failure, see the architecture-navigation skill.

**Tier 2:** `npm run test` — changed-file tests on the occt-wasm kernel, no coverage thresholds (`vitest run --project occt-wasm --changed`). Set `FULL_TESTS=1` to run `npm run test:full` (full suite with coverage) instead. Test failures: see the writing-tests skill.

**Tier 3 (non-blocking, always exit 0):**

- `npm run check:readme-reminders` — lists READMEs adjacent to staged `.ts` files that may need updating.
- `bash scripts/check-function-lookup.sh` — fires when a staged path matches `src/**Fns.ts` (any depth) or an `index.ts` at one directory level (`src/index.ts` or `src/<dir>/index.ts`) without `docs/function-lookup.md`. Act on this one: run `npm run docs:generate-lookup` and stage the result. The local reminder is soft and its `index.ts` match is shallow (a deeper `src/kernel/occt/index.ts` won't trip it), but CI's `build` job is the authoritative gate at any depth — it regenerates, prettier-normalizes, and `git diff --exit-code`s the file.

Before committing multi-file changes, prefer `npm run validate` (typecheck → lint → boundaries → format:check → changed tests) and read its output — do not commit on a partially green tree.

Bypass with `git commit --no-verify` only as a last resort; CI runs strictly more than the hook, so a bypassed failure just moves to the PR.

Note: `scripts/pre-commit-help.sh` and `CONTRIBUTING.md` still say coverage thresholds are enforced "at push time" / "in pre-commit hooks". That is stale — coverage thresholds run only in the main-branch-only, non-blocking `coverage` CI job. Locally they run only via `npm run test:full`.

## commit-msg and pre-push

- `.husky/commit-msg` runs `commitlint --edit` with `@commitlint/config-conventional`. A rejected message means the format is wrong, not the content — fix the `type(scope): subject` shape.
- `.husky/pre-push` runs **only** `npm run knip` (unused-code detection, ~2 seconds). The full test suite is intentionally not re-run on push; CI's sharded `test` job is the full gate. If knip fails, either use the newly-flagged export or remove it — do not add it to `knip.config.ts` without cause.
- If a push looked odd (interrupted terminal, unusual delay), verify it landed: `git ls-remote origin <branch>`.

## Commits

Format: `type(scope): subject`. Types and examples: `CONTRIBUTING.md` "Commit Conventions" (feat, fix, docs, style, refactor, perf, test, chore).

**The `!` breaking-marker trap.** In `release-please-config.json`, the root `brepjs` package excludes only `apps`, `packages/brepjs-cad`, `packages/brepjs-viewer`, and `packages/brepjs-voxel`. Everything else at the repo root — including `docs/`, `scripts/`, and CI config — feeds the root release. Any commit with `!` (or a `BREAKING CHANGE:` footer) touching those paths major-bumps the published `brepjs` library. Never put `!` on site, docs, or tooling commits. When a change genuinely is breaking, confirm it touches the library surface before marking it. Full release pipeline: release-publishing skill.

## Branches and worktrees

- Branch naming: `<type>/<kebab-description>` where type is the conventional-commit type of the work — `feat/judge-graded-reference-verdict`, `fix/memory-leak`, `docs/api-examples`. (`CONTRIBUTING.md` shows an older `feature/` prefix; current practice uses the commit type.)
- Worktrees for parallel branches go under `.worktrees/<branch>` inside the repo — gitignored (`.gitignore`) and excluded from the root vitest suite (`vitest.config.ts` excludes `.worktrees/**` and `.claude/worktrees/**`, because a stale worktree copy without WASM set up would otherwise fail the root suite):

  ```bash
  git worktree add .worktrees/feat-my-change feat/my-change
  ```

- Run `gh pr merge` from the main repo path, never from inside the worktree — deleting the branch while its worktree has it checked out fails.
- After merge: `git worktree remove .worktrees/<branch>`, then in the main tree `git checkout main && git pull`. The repo deletes branches on merge, so the local branch goes `[gone]`; prune with `git fetch --prune`.

## PR flow

1. Push the branch and open a PR filling `.github/pull_request_template.md` (what/how-to-test/checklist).
2. CI runs the jobs feeding `ci-pass`: typecheck, lint (eslint + `format:check`), quality (`check:boundaries` + `check:patterns` + `knip`), build (including the `docs/function-lookup.md` staleness diff), playground-build, per-package jobs (viewer/verify/sheetmetal/bim), voxel-wasm-rust, the 4-way-sharded `test` job, size, and benchmark. The `coverage` job runs on main only, `continue-on-error`, and is not part of `ci-pass`. CI failures: see the ci-triage skill.
3. The benchmark job posts a PR comment comparing against main with a 25% regression threshold.
4. **Reviews:** branch protection on `main` requires only the `ci-pass` status check — zero required approvals. Two AI reviewers (Greptile, configured in `.greptile/config.json`, and cubic) review every PR but are not required checks. **Wait for both AI reviews to land before arming `gh pr merge --auto`** — auto-merge armed early merges the moment `ci-pass` goes green, and real defects have been caught in reviews that arrived post-merge.
5. Merge is squash-only; the squash commit title becomes the release-please changelog entry, so make the PR title a valid conventional commit.
6. After merge: checkout main and pull immediately (the remote branch is auto-deleted).

**Release PRs** (`release-please--*` head refs) skip the code-CI path and are auto-merged by `.github/workflows/release-please.yml` with strict ordering: the root `brepjs` release PR merges first; leaf release PRs (cad/bim/sheetmetal) are held while root is open, because the node-workspace plugin pins leaves to the pending root version — merging a leaf early leaves main pinned to an unpublished version and breaks `npm ci` with ETARGET. `brepjs-opencascade` is permanently held for manual merge. Do not manually merge release PRs out of this order.

## Symptom → cause → fix

| Symptom                                                             | Cause                                                                  | Fix                                                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Pre-commit fails with layer VIOLATION                               | Upward import across layers                                            | architecture-navigation skill; `npm run check:boundaries` for the full report   |
| Pre-commit fails in `check-patterns`                                | New pattern violation in staged `src/` file                            | See quality-gates (fix vs. baseline)                                            |
| Every open PR fails `quality`/`check:patterns`                      | Unbaselined violation reached main (CI checks the PR merged with main) | See quality-gates (baseline-bump-first recovery)                                |
| CI `build` fails on `git diff --exit-code docs/function-lookup.md`  | Stale generated lookup after `*Fns.ts` change                          | See adding-operations (function-lookup gate)                                    |
| Commit rejected: "subject may not be empty" / "type must be one of" | Message not `type(scope): subject`                                     | Rewrite per `CONTRIBUTING.md` commit types                                      |
| Published `brepjs` unexpectedly major-bumped                        | `!` or `BREAKING CHANGE:` on a docs/tooling commit                     | Never mark non-library commits breaking; `docs/` is not in root `exclude-paths` |
| P1 review comment appears after merge                               | Auto-merge armed before AI reviews landed                              | Wait for Greptile + cubic before `gh pr merge --auto`                           |
| `npm ci` fails ETARGET after a release merge                        | Leaf release PR merged while root `brepjs` release was open            | Merge root first; let the workflow regenerate leaf PRs                          |
| `git worktree remove` or branch delete fails                        | Branch checked out in a worktree / merge run from inside it            | Operate from the main repo path; remove the worktree first                      |
| Local branch shows `[gone]` after merge                             | `delete_branch_on_merge` removed the remote branch                     | `git checkout main && git pull && git fetch --prune`, delete the local branch   |

## Additional resources

- `CLAUDE.md` — "Git hooks" and "Commits" sections (concise summary of the above)
- `CONTRIBUTING.md` — Development Workflow, Commit Conventions, Pull Request Process
- `.claude/commands/verify.md` — wraps `npm run validate` + the function-lookup reminder
- Sibling skills: `architecture-navigation` (boundary failures), `writing-tests` (test failures), `quality-gates` (lint/pattern/knip details), `ci-triage` (CI job debugging), `release-publishing` (release-please pipeline)
