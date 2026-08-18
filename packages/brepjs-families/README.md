# brepjs-families

> Experimental satellite package, published to npm. Early-stage; the API may change.

```bash
npm install brepjs-families brepjs
```

The declarative family layer for [brepjs](https://github.com/andymai/brepjs): element trees, key paths, and projection onto the content-addressed CSG IR. You describe a model as a tree of typed elements; resolution turns it into geometry plus durable identity that a BIM export can rely on.

Pipeline: **author families → element tree → `resolve()` (geometry + key paths + relationships) → `evaluateModel()` (meshes for the viewport) or `familiesToBim()` in [brepjs-bim](https://www.npmjs.com/package/brepjs-bim) (IFC export).**

## The model in one example

```typescript
import { csg } from 'brepjs';
import { family, el, resolve, evaluateModel, tTranslate, type Element } from 'brepjs-families';

const Door = family<{ width: number; height: number; at: readonly [number, number] }>(
  'Door',
  (p) =>
    el('Box', {
      size: [p.width, 300, p.height],
      transform: [tTranslate([p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill' }
);

const Wall = family<{ length: number; height: number; voids?: readonly Element[] }>('Wall', (p) =>
  el('Box', { size: [p.length, 200, p.height], voids: p.voids ?? [] })
);

const Storey = family<{ items: readonly Element[] }>('Storey', (p) => el('Group', {}, p.items));

const tree = resolve(
  Storey({
    key: 'ground',
    items: [
      Wall({
        key: 'south',
        length: 4000,
        height: 2700,
        voids: [Door({ key: 'entry', width: 1000, height: 2100, at: [1500, 0] })],
      }),
    ],
  })
);

using ev = new csg.Evaluator();
const model = evaluateModel(tree, ev);
model.byKeyPath.get('ground/south'); // mesh + identity for the wall
```

What the pieces buy you:

- **Families** are typed, validated constructors (`family(name, render, { props })` takes a zod schema). Invalid props fail at construction, not at export.
- **Key paths** (`ground/south/voids:entry`) are order-independent identity. Reorder siblings and every element keeps its identity; a BIM projection derives stable IFC GlobalIds from them.
- **The CSG IR** is content-addressed: two identical walls evaluate once and share one materialization, while each keeps its own identity.
- **Fill roles** make openings real: a `role: 'fill'` family inside a wall's `voids` synthesizes an `Opening` element with a `Fills` relationship, which a BIM export turns into `IfcOpeningElement` + `IfcRelFilledElement` rather than an anonymous boolean hole.
- **JSX optional**: `jsxImportSource: "brepjs-families"` lets you write the same trees as JSX. The plain-function API is primary.

## Starter registry

A copy-in starter registry (storey, wall, slab, column, beam, roof, door, window, and room families, spec-shaped props feeding the IFC specs in brepjs-bim 1:1) is distributed shadcn-style, not inside this package: the families become source files you own. `npm create brepjs` scaffolds a working project, then `npx brepjs add wall room` copies family sources into `src/families/`, resolving the registry from GitHub by default or from any static host via `--registry`. See [Copy-In Distribution](https://brepjs.dev/families/copy-in).

## BIM projection

`brepjs-bim`'s `familiesToBim()` projects a resolved tree into a `BimModel`: storeys, walls, slabs, columns, beams, roofs, and wall openings, with property sets, materials, spatial containment, and reorder-stable GlobalIds, exportable to IFC with independent validation. See the [families docs](https://brepjs.dev/families/overview) and [for BIM professionals](https://brepjs.dev/families/for-bim-professionals).

## Docs

- [Families overview](https://brepjs.dev/families/overview)
- [Your first building](https://brepjs.dev/families/first-building)
- [Identity and key paths](https://brepjs.dev/families/identity)
- [Openings](https://brepjs.dev/families/openings)
- [Props and validation](https://brepjs.dev/families/props-and-validation)
- [IFC export](https://brepjs.dev/families/ifc-export)

MIT
