---
name: release-publishing
description: This skill should be used when operating releases or npm publishing in brepjs — cutting or merging a release-please PR, recovering a failed npm publish, or deciding whether a commit may carry a breaking marker. Trigger phrases include "release PR", "release-please", "autorelease: pending", "publish to npm", "npm publish failed", "republish", "ETARGET from a leaf release PR ordered ahead of root", "version bump", "why did the major version bump", "breaking change commit", "trusted publisher", "dry_run", "release tag", "manifest conflict", or editing .github/workflows/publish-*.yml or release-please-config.json.
---

# Releases and npm publishing

Every release in this repo flows through one workflow: `.github/workflows/release-please.yml`. Its inline comments are the canonical deep documentation — read them before changing anything. This skill is the operator's playbook: how a normal release flows, the hard rules that prevent outages, and the recovery recipes when a step fails.

## Mental model

- **release-please, manifest mode.** Versions live in `.release-please-manifest.json`; managed packages are declared in `release-please-config.json`. On every push to `main`, release-please opens/updates a per-package release PR (`separate-pull-requests: true`), bumping the version and CHANGELOG from Conventional Commits.
- **Six managed packages, two deliberately unmanaged.** Managed: root `.` (`brepjs`), `packages/brepjs-opencascade`, `packages/brepjs-voxel-wasm`, `packages/brepjs-cad`, `packages/brepjs-bim`, `packages/brepjs-sheetmetal`. NOT managed by release-please: `brepjs-viewer` (versioned/published manually — see below) and `packages/brepjs-voxel` (unpublished workspace consumer).
- **node-workspace re-pins cross-deps.** The `node-workspace` plugin rewrites each leaf package's `brepjs` dependency to the version of the pending root release. This is the source of the ETARGET hazard (below).
- **npm auth is OIDC trusted publishers, bound to workflow filenames.** Each package's publish authenticates via an npm trusted publisher tied to a specific `.github/workflows/publish-*.yml` filename. Renaming a publish workflow breaks auth silently.

## How a normal release flows

1. Commits land on `main` with Conventional-Commit subjects (enforced by commitlint — see `commitlint.config.js`, `.husky/commit-msg`; format detail lives in the **git-pr-workflow** skill).
2. The `release-please` job (App token, `googleapis/release-please-action@v5`) opens or updates release PRs labeled `autorelease: pending`.
3. The `auto-merge` job serializes **root before leaves**: it lists open `autorelease: pending` PRs and, per branch name:
   - `*--components--brepjs-opencascade` → **permanently held** (manual, expensive WASM build).
   - root branch `release-please--branches--main--components--brepjs` → `gh pr merge --auto --squash` (merges first).
   - any other leaf → **held while a root release PR is open**; merged on a later run after root lands.
4. Root release PR merges. CI passes trivially on release PRs — `ci.yml` skips the paths-filter for `release-please--*` branches, and `ci-pass` treats skipped jobs as pass — so `--auto` completes.
5. `publish-brepjs` runs inline in `release-please.yml`: `npm ci && npm run build && npm publish --provenance` (OIDC). This is the ONLY package published inline.
6. Merging bumps `main`. The next release-please run regenerates each leaf PR with a now-valid `brepjs` pin, auto-merges them, and each **auto-publishing** leaf's job dispatches its own `publish-brepjs-<pkg>.yml` with `-f dry_run=false --ref <release-tag>`. (`brepjs-opencascade` is the exception — always manual via `publish-opencascade.yml`; `brepjs-voxel-wasm` has no publish workflow.)

Leaves dispatch against the **immutable release tag** release-please just created, never `main`: the dispatch API accepts a tag but rejects a raw SHA, and the tag pin avoids publishing the wrong commit if another push lands mid-window.

## Hard rules

| Rule                                                                                                                                                                                                                                                      | Why                                                                                                                                                                | Where                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Never put `!`/`BREAKING CHANGE` on a commit unless intentionally breaking the `brepjs` public API.                                                                                                                                                        | Root is 18.x; any breaking marker majors the library immediately.                                                                                                  | `.release-please-manifest.json`   |
| Root `exclude-paths` are only `apps`, `packages/brepjs-cad`, `packages/brepjs-viewer`, `packages/brepjs-voxel`. A breaking commit touching root `docs/`, `README.md`, `scripts/`, `.github/`, or bim/sheetmetal/opencascade/voxel-wasm still majors root. | Those paths attribute to the root component.                                                                                                                       | `release-please-config.json:8-13` |
| Never rename or move a `publish-*.yml` file without re-registering the npm trusted publisher for that package.                                                                                                                                            | OIDC auth is bound to the exact filename; a rename makes `npm publish` fail auth.                                                                                  | comments in each `publish-*.yml`  |
| Never merge a leaf release PR while the root `brepjs` release PR is open.                                                                                                                                                                                 | node-workspace pins the leaf to an unpublished `brepjs` version → `npm install` ETARGET → Vercel deploys break. Also conflicts the root PR on the shared manifest. | `release-please.yml:57-72`        |
| Never cancel an in-flight Release Please run.                                                                                                                                                                                                             | Cancelling mid-publish leaves a tagged-but-unpublished release; the concurrency group queues, never cancels.                                                       | `release-please.yml:17-24`        |
| Manual publish dispatches default to `dry_run: true` (build-only). A real publish needs `-f dry_run=false` and a ref.                                                                                                                                     | A bare dispatch is a safe smoke build.                                                                                                                             | every `publish-*.yml`             |
| `brepjs-opencascade` is always manual.                                                                                                                                                                                                                    | ~60-min Docker WASM build from `ghcr.io/andymai/opencascade.js:v8` (needs `GHCR_TOKEN`).                                                                           | `publish-opencascade.yml`         |

## Recovery playbook

**Root `brepjs` publish failed (release tagged, npm empty).** Do NOT re-run the failed push job — release-please would try to re-tag. Instead re-dispatch the whole workflow in republish mode:

```
gh workflow run release-please.yml -f republish=true
```

This skips the `release-please` job and runs only `publish-brepjs` against the current `main` `package.json` version. Republish covers **root brepjs only**.

**A leaf publish failed (`brepjs-cad`/`bim`/`sheetmetal`).** Re-dispatch that leaf's own publish workflow against the release tag:

```
gh workflow run publish-brepjs-<pkg>.yml -f dry_run=false --ref <release-tag>
```

**`brepjs-opencascade` needs publishing.** Manual only:

```
gh workflow run publish-opencascade.yml -f dry_run=false --ref <release-tag>
```

**Conflicted release PRs (serializer bypassed — e.g. a human merged a leaf early).** Not tooled; manual fix. For each still-open release PR: merge `main` into its branch, take the union of `.release-please-manifest.json` (keep every package's highest intended version), resolve CHANGELOG/package.json, push. Then let the `auto-merge` job re-arm on the next run.

**`npm install`/CI fails with ETARGET after a merge.** A leaf on `main` is pinned to a `brepjs` version not yet on npm. Confirm root actually published (`npm view brepjs version`); if root is fine, the leaf pin is ahead — publish root first (republish above), or bump the leaf's pin down to a published version and open a fix PR. Related consumer-side symptoms are covered in **ci-triage** and **companion-packages**.

**Pack validation failed (`prepack`).** Root `npm pack`/`npm publish` runs `scripts/validate-pack.sh` (wired as `prepack`, with `prepublishOnly: npm run build`). It fails on more than 500 files or any `.d.ts.map` sidecar. Inspect with `npm pack --dry-run`. `.d.ts.map` files mean `declarationMap` got re-enabled — check `vite.config.ts`.

## Package publish matrix

| Package              | Managed?                 | Auto-merge?       | Auto-publish?               | Publish route                                    |
| -------------------- | ------------------------ | ----------------- | --------------------------- | ------------------------------------------------ |
| `brepjs` (root)      | yes                      | yes (first)       | yes, inline                 | `release-please.yml` job `publish-brepjs` (OIDC) |
| `brepjs-cad`         | yes                      | yes (after root)  | yes, dispatched             | `publish-brepjs-cad.yml`                         |
| `brepjs-bim`         | yes                      | yes (after root)  | yes, dispatched             | `publish-brepjs-bim.yml`                         |
| `brepjs-sheetmetal`  | yes                      | yes (after root)  | yes, dispatched             | `publish-brepjs-sheetmetal.yml`                  |
| `brepjs-opencascade` | yes                      | **held (manual)** | **manual only**             | `publish-opencascade.yml` (Docker WASM)          |
| `brepjs-voxel-wasm`  | yes (bumps `Cargo.toml`) | yes (after root)  | **no workflow, not on npm** | none                                             |
| `brepjs-viewer`      | **no**                   | n/a               | manual                      | `publish-brepjs-viewer.yml`                      |
| `brepjs-voxel`       | no                       | n/a               | not published               | none                                             |

Build prerequisites baked into the publish workflows: `brepjs-cad` restores OCCT WASM (`scripts/ensure-wasm.sh`, 3× retry) then builds root + `brepjs-viewer` + itself (viewer is a build-time devDep whose dist is bundled into the `brepjs-cad` build output). `bim` and `sheetmetal` build root `brepjs` first (their `vite-plugin-dts` needs root's emitted types). `brepjs-viewer` uses `npm ci --ignore-scripts` and publishes `--access public`.

## Notes and gotchas

- **`brepjs-viewer` is intentionally de-managed** from release-please. node-workspace kept re-pinning `brepjs-cad`'s build-time `brepjs-viewer` devDep (`"brepjs-viewer": "*"`) to viewer's pending unpublished version, breaking monorepo `npm ci`. Version and publish it by hand via `publish-brepjs-viewer.yml`.
- **The Claude-plugin marketplace version is independent of the npm version.** release-please does not bump `packages/brepjs-cad/.claude-plugin/plugin.json`; the plugin version and the npm `brepjs-cad` version move separately.
- **Docs deploy is not release-triggered.** `.github/workflows/docs.yml` chains off successful CI on `main` (`workflow_run`); emergency redeploy is a main-only `workflow_dispatch`.
- **`scripts/publish-all.sh` is a legacy manual OTP fallback** (opencascade → root only, `--no-provenance`). The OIDC workflows supersede it; use only as a local last resort, and note it does not cover cad/bim/sheetmetal/viewer.

## Additional resources

- Commit format and the `!` decision: `git-pr-workflow` skill.
- CI job failure modes (npm ci EUSAGE/ETARGET, release PR won't merge, publish red): `ci-triage` skill.
- Which package to edit and how a change ripples to consumers: `companion-packages` skill.
- Canonical deep reference: the inline comments in `.github/workflows/release-please.yml`.
