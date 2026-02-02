# Contributing to brepjs

Thank you for your interest in contributing to brepjs, a Web CAD library built on OpenCascade! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 16+ and npm
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

brepjs uses a four-layer architecture with enforced import boundaries to maintain clear separation of concerns and prevent circular dependencies.

### Layer Structure

| Layer | Directories | Purpose | Can Import From |
|-------|------------|---------|-----------------|
| 0 | `kernel/`, `utils/` | Foundation & WASM bindings | External only |
| 1 | `core/` | Memory management, geometry constants | Layers 0 |
| 2 | `topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/` | Domain logic & features | Layers 0-2 |
| 3 | `sketching/`, `text/`, `projection/` | High-level API | Layers 0-3 |

**Key principle**: Imports flow **downward only** (higher layers can import from lower layers, never the reverse).

### Why This Matters

- **Layer 0** (kernel/utils): Low-level WASM bindings and utilities — must have zero dependencies on other internal code
- **Layer 1** (core): Shared abstractions for geometry and memory management
- **Layer 2** (domain layers): Feature implementations that can depend on core but not on Layer 3
- **Layer 3** (high-level API): Convenient interfaces for end users, can use all lower layers

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
npm run test
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Check coverage
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

- **No `any`** — Use proper types. If you must use `any` for OCCT type gaps, add an ESLint disable comment with a reason:

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT doesn't export geometry type
const shape: any = getKernel().BRepBuilderAPI_Box(...);
```

- **No non-null assertions** (`!`) — Properly handle nullable types
- **Consistent type imports** — Use `import type` for type-only imports:

```typescript
import type { Shape } from './shape.js';
```

- **No `var`** — Use `const` or `let`
- **Strict equality** — Always use `===` and `!==` (never `==` or `!=`)

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

The project enforces a strict layered architecture. The `npm run check:boundaries` command validates that imports follow the rules.

### How It Works

- Layer 0 modules (`kernel/`, `utils/`) cannot import from any internal code
- Layer 1 modules (`core/`) can only import from Layer 0
- Layer 2 modules can import from Layers 0-2 (and each other)
- Layer 3 modules can import from any layer

### If You Get a Boundary Error

```
Error: Layer violation in src/operations/box.ts
  Importing from src/sketching/draw.ts (Layer 3)
  But src/operations/box.ts is in Layer 2
```

This means you're trying to import from a higher layer into a lower layer, which breaks the architecture. Solutions:

1. Move the code to a layer that can import from both
2. Extract the shared logic into a lower layer
3. Refactor to remove the dependency

## Testing

### Run Tests

```bash
npm run test              # Run all tests once
npm run test:watch       # Watch mode for development
npm run test:coverage    # Generate coverage report
npm run test:affected    # Run only tests affected by changes
```

### Test Expectations

- All existing tests must pass
- New features should have corresponding tests
- Tests run in CI and must pass before merge

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

When writing code, follow these established patterns:

### Kernel Access

Use `getKernel()` from `src/kernel/index.ts` for new OCCT operations:

```typescript
import { getKernel } from '../kernel/index.js';

const kernel = getKernel();
const box = kernel.BRepBuilderAPI_Box(x, y, z);
```

For backward compatibility, `getOC()` from `src/oclib.ts` delegates to the kernel.

### Shape Methods

Shape methods (e.g., `fuse`, `cut`) should delegate to standalone functions in the `operations/` layer:

```typescript
// In core/shape.ts
cut(other: Shape): Shape {
  return cut(this, other);  // Delegates to operations/cut.ts
}
```

### WASM Dependency

The WASM binding (`brepjs-opencascade`) is an external peer dependency, not bundled. It's initialized at runtime by users:

```typescript
import opencascade from 'brepjs-opencascade';
import { setOC } from 'brepjs';

const oc = await opencascade();
setOC(oc);  // Initialize the kernel
```

## Where to Ask Questions

- **GitHub Issues**: For bug reports, feature requests, or questions — open an issue on [github.com/andymai/brepjs](https://github.com/andymai/brepjs)
- **Discussions**: Check existing issues/discussions before opening a new one
- **PRs**: Discussion in pull request comments is welcome

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
npm run test               # Run all tests
npm run test:coverage      # Coverage report

# Utilities
npm run knip               # Detect unused code
```

---

Thank you for contributing! We appreciate your help making brepjs better.
