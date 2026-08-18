---
title: Why a Family Layer
description: 'brepjs-families adds an identity-preserving element tree on top of the CSG IR: reusable, validated components for buildings and assemblies, with deduplication for free underneath.'
---

# Why a Family Layer

The [CSG IR](/concepts/csg-ir) is deliberately anonymous. Two identical wall recipes hash identically, share one cache entry, and materialize once. That is exactly what you want from a geometry cache, and exactly what you cannot ship to a BIM consumer: a building needs every wall to keep its own name, its own properties, and its own stable identity across exports.

`brepjs-families` resolves that tension by adding a second tree **beside** the IR, not inside it. You describe a model as a tree of **elements**, each optionally carrying a key, properties, and property sets. Resolution projects every element onto the content-addressed IR for geometry, while identity rides on the element tree and never enters a cache key. Identical recipes still share one materialization; identities stay distinct.

```typescript
import { family, el, resolve, evaluateModel, type Element } from 'brepjs-families';
import { csg } from 'brepjs';

const Wall = family<{ readonly length: number; readonly height: number }>('Wall', (p) =>
  el('Box', { size: [p.length, 200, p.height] })
);

const Storey = family<{ readonly walls: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.walls)
);

const model = resolve(
  Storey({
    key: 'ground',
    walls: [
      Wall({ key: 'north', length: 4000, height: 2700 }),
      Wall({ key: 'south', length: 4000, height: 2700 }),
    ],
  })
);
// Two elements, two key paths: 'ground/north' and 'ground/south'.
// One IR recipe underneath: both walls share a single cache entry.
```

A `family()` is a plain function from props to an element tree. There is no React, no reconciler, no lifecycle: calling a family builds a description, and `resolve()` runs the render functions to produce a `ResolvedElement` tree. If you prefer JSX, the package ships a `jsx-runtime` export and the plain-function API stays primary.

## What a family carries

| Concern                  | Where it lives                                      |
| ------------------------ | --------------------------------------------------- |
| Geometry recipe          | The rendered IR subtree (content-addressed, cached) |
| Identity                 | The element's key path (`ground/north`)             |
| Properties               | `props`, validated by an optional Zod schema        |
| Property sets, materials | `attributes`, captured beside the geometry          |
| Containment and openings | `relationships` derived during resolution           |

The split is strict by construction: the IR node under an element carries none of the identity, so nothing you attach to an element can perturb geometry hashing or fragment the cache.

## Evaluation is mesh-first

`evaluateModel` walks the resolved tree and returns one record per geometry-bearing element. The primary output is a **mesh**: plain data with no kernel lifetimes to manage, cached by content so a re-evaluation after an edit only re-meshes what changed.

```typescript
using evaluator = new csg.Evaluator();
const evaluated = evaluateModel(model, evaluator);
for (const [keyPath, node] of evaluated.byKeyPath) {
  if (node.mesh.ok) console.log(keyPath, node.mesh.value.triangles.length / 3, 'triangles');
}
```

B-Rep shape handles are opt-in (`{ shapes: true }`) for export paths. Viewport consumers never touch a handle, which means there are no disposal rules to get wrong in rendering code.

## Copy-in, not framework

Families are distributed on the copy-in model: `npx brepjs add wall door` writes family **source files into your project**, where you own and edit them. The package supplies the vocabulary (`family`, `el`, `resolve`, `evaluateModel`); the components are yours. The boundary is deliberate:

| Ships as owned source                | Stays in the package                       |
| ------------------------------------ | ------------------------------------------ |
| Render functions (props to elements) | IR node construction and evaluation        |
| Default property sets, naming        | IFC entity writing                         |
| Material assignment                  | GlobalId derivation                        |
| Which geometry recipe to use         | Spatial aggregation, relationship emission |

A family that needs to reimplement IFC writing means the boundary was drawn wrong; that capability belongs in `brepjs-bim`.

## Installing

```sh
npm install brepjs-families
```

The package currently ships TypeScript source, so use it with a bundler (Vite, esbuild, webpack) or a TS-aware runner like `tsx`. `npm create brepjs` scaffolds a ready-to-run project with both wired up.

## Next steps

- **[Your First Building](/families/first-building)**: a storey with walls and a door, evaluated to meshes, with a prop edit that shows the cache sparing unchanged siblings.
- **[Elements, Key Paths & Identity](/families/identity)**: the mental model in depth, including why unkeyed elements cannot mint identity.
