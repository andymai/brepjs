# Tech Debt Reduction

You are working on this codebase to systematically reduce tech debt. Each session, pick **one item** from the GitHub issue backlog and complete it as a standalone PR. Work incrementally — ship small, safe changes.

## Before Starting

1. Run `git status` to confirm a clean working tree
2. Check open issues for the highest-priority unfinished item:
   ```bash
   gh issue list --label tech-debt --state open
   ```
3. If completed items are still open, close them before starting new work
4. Create a branch: `git checkout -b tech-debt/<item-slug>`

## After Completing Each Item

1. Run `npm run validate` to confirm all checks pass
2. Run `npm run test:full` to confirm no coverage regressions
3. Commit with `fix(tech-debt): <description>` or `refactor(tech-debt): <description>`
4. Open a PR with the tech-debt label and close the corresponding issue

---

## How to Approach Common Types of Debt

### Type safety improvements

- Read the file and understand the context of each unsafe pattern before changing it
- Prefer adding runtime guards or proper types over simply suppressing lint rules
- Make one file's changes per PR; don't batch multiple files
- Run the file's specific test suite after each change, not just typecheck

### Dead code removal

- Use `npx knip` to identify candidates; verify each is truly unreachable before removing
- Check for dynamic references (e.g., string-keyed access, plugin registration) that static analysis misses
- Remove in small batches; run the full test suite after each batch

### Refactoring large files/modules

- Read the existing file completely before restructuring
- Preserve the public interface exactly — external imports must not change
- Move code into submodules incrementally; verify the build after each move
- Check that all consuming code still compiles without changes

### Script / config consolidation

- Audit all references before removing a script (CI, hooks, docs, README)
- Update references atomically in the same commit as the removal
- Verify hooks still work end-to-end after changes

### Dependency and tooling upgrades

- Check the changelog for breaking changes before upgrading
- Pin to a specific version in the PR; widen the range only after tests pass
- Run the full test suite — not just affected tests — after dependency changes

---

## Tracking

The authoritative backlog lives in GitHub issues with the `tech-debt` label. Create new items with:

```bash
gh issue create --title "tech-debt: <item title>" --label tech-debt --body "<description>"
```

When starting an item, assign yourself. When the PR merges, close the issue.

---

## Ground Rules

- **One item per PR** — keep changes reviewable
- **No behavioral changes** — tech debt PRs must not change functionality
- **Tests must pass** — `npm run validate` is the minimum bar
- **Coverage must not drop** — check `npm run test:full` thresholds
- **Don't boil the ocean** — if an item is larger than expected, split it further
