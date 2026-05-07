# Contributing to brepjs

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Git

### Clone and Install

```bash
git clone https://github.com/andymai/brepjs.git
cd brepjs
npm install
```

### Build the Project

```bash
npm run build
```

The build generates ES and CommonJS distributions in the `dist/` directory.

## Architecture Overview

See the chapter [Architecture & Layers](https://andymai.github.io/brepjs/extending/architecture) for the layer structure, data flow diagrams, and key patterns.

**The one rule:** imports flow downward only (Layer 3 → 2 → 1 → 0, never the reverse). `npm run check:boundaries` enforces this.

## Documentation

The chapter-based docs live in `docs-site/` and are built with VitePress. The legacy single-page docs in `docs/` are still served and kept around for inbound-link compatibility, but new content goes in `docs-site/`.

Common docs commands:

```bash
npm run docs:dev            # local preview at http://localhost:5173
npm run docs:build          # production build (output: docs-site/.vitepress/dist)
npm run docs:extract-tests  # extract code blocks from docs into tests/docs/extracted.test.ts
npm run test:docs           # extract + run the doc tests
npm run docs:api            # build TypeDoc API reference
npm run docs:generate-lookup # regenerate docs/function-lookup.md from sources
```

When you add or modify a code block in a chapter, the doc-test harness picks it up automatically — every fenced ` ```typescript ` block becomes a test that runs against the OCCT kernel. Mark blocks with `<!-- @no-test -->` (immediately preceding) to opt out, or `<!-- @setup -->` for shared setup that's prepended to subsequent blocks in the same file.

### Docs deployment

The chapter site (`docs-site/`) is deployed to Vercel at `https://brepjs.dev` via a Vercel project rooted at `docs-site/` (config: `docs-site/vercel.json`). Pushing to `main` produces a production deploy; PRs get preview deploys.

The TypeDoc API reference is a separate deploy on GitHub Pages (`https://andymai.github.io/brepjs/`) via `.github/workflows/docs.yml`. Keeping them split lets the chapter site iterate without re-running TypeDoc.

To set up the Vercel project (one-time): in the Vercel dashboard, create a project pointed at this repo with `Root Directory: docs-site`. Vercel reads `docs-site/vercel.json` for build/output settings.

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Use descriptive branch names (e.g., `feature/box-operations`, `fix/memory-leak`, `docs/api-examples`).

### 2. Code and Commit

Make your changes and commit following [Commit Conventions](#commit-conventions) (enforced by commitlint).

### 3. Test Your Changes

```bash
npm run test              # Changed files only (fast)
npm run test:watch        # Run tests in watch mode
npm run test:full         # Full suite with coverage
```

All tests must pass before submitting a PR.

### 4. Lint and Format

```bash
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix linting issues
npm run format            # Format code with Prettier
npm run typecheck         # Check TypeScript types
```

### 5. Verify Layer Boundaries

```bash
npm run check:boundaries
```

This ensures your new code doesn't violate the layered architecture. If this fails, check your imports.

### 6. Submit a Pull Request

Push your branch and open a pull request on GitHub. See [Pull Request Process](#pull-request-process) for requirements.

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint and husky.

### Commit Format

```
<type>(<scope>): <subject>

<body>
```

### Types

- **feat**: A new feature (e.g., `feat(topology): add box operation`)
- **fix**: A bug fix (e.g., `fix(operations): prevent memory leak in mesh`)
- **docs**: Documentation changes (e.g., `docs(readme): add example`)
- **style**: Code style changes (formatting, no logic changes)
- **refactor**: Code refactoring without new features (e.g., `refactor(core): simplify memory management`)
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Build, dependencies, or tooling changes

### Examples

```bash
git commit -m "feat(sketching): add arc drawing support"
git commit -m "fix(kernel): handle null geometry in adapter"
git commit -m "docs: update architecture guide"
```

## Code Style

### TypeScript Strict Mode

- **No `any`** - Use proper types. If you must use `any` for WASM type gaps, add an ESLint disable comment with a reason:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel WASM binding lacks type
const shape: any = getKernel().BRepBuilderAPI_Box(...);
```

- **No non-null assertions** (`!`) - Properly handle nullable types
- **Consistent type imports** - Use `import type` for type-only imports:

```typescript
import type { Shape } from './shape.js';
```

- **No `var`** - Use `const` or `let`
- **Strict equality** - Always use `===` and `!==` (never `==` or `!=`)

### ESLint and Prettier

We use ESLint and Prettier to enforce code style automatically. Run these before committing:

```bash
npm run lint:fix
npm run format
```

### ESM Imports

All `.ts` imports must use `.js` extensions for ESM compatibility (Vite/esbuild transforms these at build time):

```typescript
// Correct
import { draw } from '../sketching/draw.js';
import type { Shape } from '../core/shape.js';

// Incorrect
import { draw } from '../sketching/draw';
import { Shape } from '../core/shape';
```

## Layer Boundaries

Import boundaries are enforced by:

1. **`scripts/check-layer-boundaries.sh`** - runs in pre-commit hook
2. **CI workflow** - runs on every PR
3. **ESLint `no-restricted-syntax`** - bans `.oc` access and `.wrapped.method()` calls in Layer 2+

```bash
npm run check:boundaries   # manual check
npx eslint src/ --quiet     # lint check
```

### If You Get a Boundary Error

```
Error: Layer violation in src/operations/box.ts
  Importing from src/sketching/draw.ts (Layer 3)
  But src/operations/box.ts is in Layer 2
```

You're importing from a higher layer into a lower one. Fix by moving the code to a layer that can import from both, extracting shared logic into a lower layer, or refactoring to remove the dependency.

## Testing

### Run Tests

```bash
npm run test             # Run changed-file tests (fast, no coverage)
npm run test:watch       # Watch mode for development
npm run test:full        # Full suite with coverage thresholds
```

### Test Expectations

- All existing tests must pass
- New features should have corresponding tests
- Tests run in CI and must pass before merge

### Code Coverage Requirements

brepjs enforces minimum coverage thresholds in pre-commit hooks and CI:

| Metric     | Threshold | Why This Threshold?                  |
| ---------- | --------- | ------------------------------------ |
| Functions  | **83%**   | Ensures all exported APIs are tested |
| Statements | **73%**   | Accounts for error handling branches |
| Branches   | **64%**   | Allows defensive error paths         |
| Lines      | **73%**   | Baseline code execution coverage     |

Run `npm run test:full` to see a detailed coverage report.

**If coverage drops below threshold:**

1. Add tests for new/modified functions
2. Remove untested code (may be dead code)
3. Consider if code is intentionally untested (e.g., emergency fallbacks)

**Note:** Pre-commit runs changed tests only for speed; CI runs the full test suite with coverage enforcement.

## Pull Request Process

### Before Submitting

1. Branch from `main`
2. All tests pass: `npm run test`
3. No linting issues: `npm run lint`
4. TypeScript strict: `npm run typecheck`
5. Boundaries valid: `npm run check:boundaries`
6. Code formatted: `npm run format`
7. Commit follows [Commit Conventions](#commit-conventions)

### Submission

1. Push your branch to GitHub
2. Create a pull request against `main`
3. Fill out the PR template (if available)
4. Link any related issues

### Merge Requirements

- **All CI checks must pass** (tests, linting, type checking, boundary checking)
- **At least one approval** from a project maintainer
- **Commit history** should be clean (conventional commits)

## Key Patterns

See [Architecture](docs/architecture.md#key-patterns) for detailed patterns with code examples. The essentials:

- **Kernel access:** All operations go through `getKernel()` - Layer 2+ code must never call methods on `.wrapped` directly
- **Functional API:** New code goes in `*Fns.ts` files, not class methods (class wrappers are legacy)
- **Custom kernels:** `registerKernel()` + `withKernel()` - see [Custom Kernel Guide](docs/kernel-swap.md)

## Where to Ask Questions

Open an issue on [github.com/andymai/brepjs](https://github.com/andymai/brepjs) for bug reports, feature requests, or questions. Check existing issues before opening a new one.

## Summary of Commands

```bash
# Setup
npm install
npm run build

# Development
npm run dev                # Watch mode
npm run test:watch         # Test watch mode

# Quality checks (run before committing)
npm run typecheck          # TypeScript strict check
npm run lint:fix           # Fix linting issues
npm run format             # Format code
npm run check:boundaries   # Verify layer boundaries

# Testing
npm run test               # Changed-file tests (fast)
npm run test:full          # Full suite with coverage

# Utilities
npm run knip               # Detect unused code
```
