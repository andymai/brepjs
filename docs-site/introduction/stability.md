---
title: Status, Stability & Versioning
---

# Status, Stability & Versioning

brepjs is at major version 18. The OpenCascade kernel is production-ready and powers [gridfinitylayouttool.com](https://gridfinitylayouttool.com). The brepkit (Rust) kernel is in active development as a faster replacement and is not yet recommended for production.

## Versioning policy

brepjs follows [Semantic Versioning](https://semver.org/). The version number is `MAJOR.MINOR.PATCH`:

- **PATCH** — bug fixes, internal refactors, performance improvements that do not change observed behaviour
- **MINOR** — new exports, new methods, new error codes, new parameters with safe defaults; backwards-compatible
- **MAJOR** — removals, signature changes, behavioural changes, kernel-version bumps that change geometric output

What counts as a breaking change:

- Removing or renaming an exported function, type, or constant
- Changing a function's signature in a way that breaks existing callsites
- Changing the runtime behaviour of an operation in a way that produces visibly different geometry for the same inputs
- Bumping the underlying kernel (occt-wasm or brepkit-wasm) to a version that changes geometric output, even if the brepjs API is unchanged

What does **not** count as breaking:

- Adding new error codes to `BrepError` (the type is structural, not exhaustive)
- Adding new methods to the fluent `shape()` wrapper
- Adding new optional parameters to existing functions
- Pattern-checker baseline updates and internal lint rules
- Changes to `*.d.ts` files that loosen rather than tighten types

Breaking changes ship under conventional commit prefix `feat!:` or `fix!:` and are documented in `CHANGELOG.md`.

## Supported environments

| Environment                                               | Status                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Node.js 24+                                               | Supported (CI tested)                                                           |
| Modern browsers (Chrome 113+, Firefox 113+, Safari 16.4+) | Supported                                                                       |
| Cloudflare Workers / Deno                                 | Untested but expected to work — WASM-only                                       |
| TypeScript 5.9+                                           | Recommended (for `using` syntax and stricter branded types)                     |
| TypeScript 5.0+                                           | Supported with workarounds (use `DisposalScope` instead of `using`)             |
| Server-side rendering                                     | Client-only; see [Compatibility](../integration/compatibility) for SSR patterns |

The `using` keyword (TypeScript 5.2+, browsers/Node since 2024) is the recommended way to manage WASM resources. `DisposalScope` is the manual fallback.

## Kernel compatibility

| brepjs version | OpenCascade kernel                                | brepkit kernel            |
| -------------- | ------------------------------------------------- | ------------------------- |
| 18.x           | `occt-wasm` 3.x or `brepjs-opencascade` 0.16+     | `brepkit-wasm` 2.x        |
| 17.x           | `occt-wasm` 3.x or `brepjs-opencascade` 0.16+     | `brepkit-wasm` 2.x        |
| 16.x           | `occt-wasm` 2.x or `brepjs-opencascade` 0.13–0.16 | `brepkit-wasm` 2.x        |
| 15.x           | `brepjs-opencascade` 0.12–0.15                    | `brepkit-wasm` 1.x or 2.x |

A kernel version bump is treated as a breaking change for brepjs even if the brepjs API is unchanged — geometric output can shift between kernel versions.

## Deprecation policy

When a function or type is being removed:

1. It is marked `@deprecated` in TypeDoc with a one-line replacement guide
2. ESLint warns on use (when the project's lint config supports it)
3. The deprecation ships in a minor release
4. The next major release removes the symbol

The legacy class-based API (`Shape`, `Solid`, `Edge`, `Face` classes in `src/topology/`) is in this state today: still present, marked deprecated, scheduled for removal. New code should use the functional API (`*Fns` files) and the fluent wrapper (`shape()`).

## What is not stable

These surfaces may change without a major bump:

- Internal-only modules under `src/kernel/occt/` and `src/kernel/brepkit/` — only the `KernelInterface` from `src/kernel/types.ts` is public-stable
- Pattern checker baseline and rule set
- The exact wording of error messages (codes are stable; messages may improve)
- The structure of internal `.wrapped` handles — Layer 2+ code must never touch them

## Release cadence

Releases are managed by [release-please](https://github.com/googleapis/release-please) — every commit on `main` that follows Conventional Commits accumulates into the next version. Patch releases are typically weekly when fixes accumulate; minor releases land as features ship; majors are rare and announced in advance.

See `CHANGELOG.md` in the repository for the full history.

## Reporting bugs

- **Bug reports**: [github.com/andymai/brepjs/issues](https://github.com/andymai/brepjs/issues) — include a minimal reproduction, ideally a playground link
- **Security**: see `SECURITY.md` in the repository

## Next steps

- [What brepjs is NOT](./non-goals) — explicit non-goals before adoption
- [Compatibility Matrix](../integration/compatibility) — tested environments in detail
- [Custom Kernels](../extending/custom-kernel) — how to swap or write your own kernel
