---
title: Function Lookup
description: "Auto-generated alphabetical index of every brepjs export. Find a function by name when you don't remember which file it's in."
---

# Function Lookup

A pointer to brepjs's auto-generated alphabetical index. The full table is regenerated from source on every release and lives at `docs/function-lookup.md` in the repository.

## How to use it

Each entry maps a symbol to its sub-path:

```
box                   topology
cylinder              topology
fillet                topology
sketchCircle          sketching
exportSTEP            io
measureVolume         measurement
edgeFinder            query
```

To import any symbol, you can either go through the main entry:

```typescript
import { box, fillet, sketchCircle, exportSTEP } from 'brepjs';
```

…or use the sub-path for smaller autocomplete:

<!-- @no-test -->

```typescript
import { box, fillet } from 'brepjs/topology';
import { sketchCircle } from 'brepjs/sketching';
import { exportSTEP } from 'brepjs/io';
```

## Read the full lookup

The complete index is one of:

- **In the repository**: `docs/function-lookup.md` on the [main branch](https://github.com/andymai/brepjs/blob/main/docs/function-lookup.md)
- **Searchable API reference**: [andymai.github.io/brepjs](https://andymai.github.io/brepjs/): full TypeDoc with type signatures, examples, source links

## Available sub-paths

| Sub-path             | Contents                                                   |
| -------------------- | ---------------------------------------------------------- |
| `brepjs/core`        | `Result`, errors, vectors, planes, branded types, disposal |
| `brepjs/topology`    | Primitives, booleans, modifiers, mesh, healing             |
| `brepjs/operations`  | Extrude, loft, sweep, patterns, assembly, history          |
| `brepjs/2d`          | Drawings, 2D curves, 2D booleans                           |
| `brepjs/sketching`   | Sketcher, drawing-to-sketch, sketch-to-shape ops           |
| `brepjs/query`       | Edge / face / wire / vertex finders                        |
| `brepjs/measurement` | Volume, area, length, distance, curvature                  |
| `brepjs/io`          | STEP, IGES, BREP, STL, OBJ, glTF, DXF, 3MF, SVG            |
| `brepjs/worker`      | Worker RPC client / server                                 |
| `brepjs/quick`       | Auto-init re-export of everything (top-level await)        |

## When the lookup says one thing and TypeDoc says another

The lookup is regenerated on every release; TypeDoc is regenerated on every CI build of `main`. They should agree, but in transitional periods (between a function being added and the lookup being regenerated) there can be a window where the lookup is stale. **TypeDoc is authoritative.** If the two disagree, file an issue and the lookup will be regenerated.

## Regenerating the lookup

If you're a contributor:

```bash
npm run docs:generate-lookup
```

The pre-commit hook reminds you to run this when `*Fns.ts` files have changed.

## Next steps

- [TypeDoc API Reference](https://andymai.github.io/brepjs/): searchable type-level reference
- [Cheat Sheet](../getting-started/cheat-sheet): task-oriented code snippets
- [Glossary](./glossary): concept-oriented terms
