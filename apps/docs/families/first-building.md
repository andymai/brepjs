---
title: 'Your First Building'
description: 'Build a storey with walls and a door as a families element tree, evaluate it to meshes, then edit a prop and watch unchanged siblings come back as the same mesh objects.'
---

# Your First Building

This walkthrough builds a one-storey model: two walls, one of them with a door opening, evaluated to meshes. By the end you'll have made a prop edit and verified, by object identity, that the evaluator only re-meshed the wall you touched.

If you haven't read **[Why a Family Layer](/families/overview)** yet, start there. This page assumes you know that families render to elements and elements project onto the [CSG IR](/concepts/csg-ir).

> **Try it live:** the <a href="/playground/examples/families-building" target="_blank" rel="noopener">Declarative Building</a> playground example is this walkthrough's model, ready to run and edit in the browser.

## The model

A `Storey` containing two `Wall`s along X, 4 m and 3 m long, 200 mm thick, 2.7 m high. The south wall carries a door void: 1 m wide, 2.1 m tall, 1.5 m along the wall. Dimensions are millimeters, matching the bim conventions.

## Step 1: The door is a family with a role

```typescript
import { family, el, tTranslate, type Element } from 'brepjs-families';

interface DoorProps {
  readonly width: number;
  readonly height: number;
  /** [along-wall, sill] in the host wall's local frame. */
  readonly at: readonly [number, number];
}

const Door = family<DoorProps>(
  'Door',
  (p) =>
    el('Box', {
      size: [p.width, 300, p.height],
      transform: [tTranslate([p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill' }
);
```

`role: 'fill'` is the detail that matters. A plain element placed in a wall's `voids` is just a boolean cut: geometry only, no identity. A **fill-role family** in `voids` additionally synthesizes an `Opening` element during resolution, with its own key path and a `Fills` relationship to the door. That distinction is what lets a BIM export later emit a real `IfcOpeningElement` instead of an anonymous hole.

The door's box is 300 mm deep against a 200 mm wall: cut tools may overshoot their host freely, only the intersection is removed.

## Step 2: Walls accept voids

```typescript
interface WallProps {
  readonly length: number;
  readonly height: number;
  readonly at: readonly [number, number, number];
  readonly voids?: readonly Element[];
}

const Wall = family<WallProps>('Wall', (p) =>
  el('Box', {
    size: [p.length, 200, p.height],
    voids: p.voids ?? [],
    transform: [tTranslate(p.at)],
  })
);

const Storey = family<{ readonly items: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.items)
);
```

Desugaring order is normative and worth internalizing: **voids are cut in the host's local frame, then `fuse` entries merge, then the host `transform` applies**. The door above is positioned relative to the wall, and the wall's own placement carries the door with it. Move a wall; its openings move too.

`Storey` renders to a `Group`: a pure container with no geometry of its own. Containers exist for structure and identity, and evaluation skips them.

## Step 3: Resolve and evaluate

```typescript
import { csg } from 'brepjs';
import { resolve, evaluateModel } from 'brepjs-families';

function building(southLength: number) {
  return resolve(
    Storey({
      key: 'ground',
      items: [
        Wall({
          key: 'south',
          length: southLength,
          height: 2700,
          at: [0, 0, 0],
          voids: [Door({ key: 'entry', width: 1000, height: 2100, at: [1500, 0] })],
        }),
        Wall({ key: 'north', length: 3000, height: 2700, at: [0, 3800, 0] }),
      ],
    })
  );
}

using evaluator = new csg.Evaluator();
const first = evaluateModel(building(4000), evaluator);

for (const [keyPath, node] of first.byKeyPath) {
  if (node.mesh.ok) {
    console.log(keyPath, node.mesh.value.triangles.length / 3, 'triangles');
  }
}
// ground/south                    ~28 triangles (a box with a doorway)
// ground/south/voids:entry        the opening's own geometry
// ground/south/voids:entry/fill   the door that fills it
// ground/north                    12 triangles (a plain box)
```

Three things to notice:

- **Key paths are the ancestor chain.** `ground/south` is the south wall; the synthesized opening lives at `ground/south/voids:entry`, adopting the void slot's key. The `:` is reserved for these synthesized segments, so they can never collide with a child key you wrote.
- **The storey has no entry.** `byKeyPath` maps geometry-bearing elements only; containers are identity, not geometry.
- **Meshes, not shapes.** Each record's `mesh` is plain data you can hand to a renderer. There is nothing to dispose in this loop; only the `Evaluator` itself is `using`-scoped.

## Step 4: Edit a prop, count what re-meshed

Stretch the south wall from 4 m to 4.2 m and evaluate again with the same evaluator:

```typescript
const second = evaluateModel(building(4200), evaluator);

const southBefore = first.byKeyPath.get('ground/south');
const southAfter = second.byKeyPath.get('ground/south');
const northBefore = first.byKeyPath.get('ground/north');
const northAfter = second.byKeyPath.get('ground/north');

if (southBefore?.mesh.ok && southAfter?.mesh.ok) {
  console.log(southAfter.mesh.value === southBefore.mesh.value); // false: re-meshed
}
if (northBefore?.mesh.ok && northAfter?.mesh.ok) {
  console.log(northAfter.mesh.value === northBefore.mesh.value); // true: SAME object
}
```

The north wall's mesh comes back as the **same object**, not an equal one: its recipe hashed identically, so the evaluator served it from the mesh cache without touching the kernel. The south wall's subtree (its box, the cut, the carried door) re-evaluated; nothing else did. This is the [subtree-caching behavior](/concepts/csg-ir#content-addressed-hashing) of the IR, surfacing per element.

The mesh cache is independent of the shape cache, so this holds even under memory pressure: a bounded evaluator can evict B-Rep shapes and still serve meshes as pure data hits.

## Where the identity went

Nothing in this walkthrough attached properties yet, but the seams are all in place: every element has a key path, the opening synthesized its own identity, and `resolve` captured relationships (`Contains`, `Voids`, `Fills`) on the way down. **[Elements, Key Paths & Identity](/families/identity)** explains the model those seams implement, and why every element that will carry identity needs an explicit key.
