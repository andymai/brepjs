---
title: Stable References (Topological Naming)
description: 'Name a face, edge, or vertex by its stable adjacent-neighbour roles instead of a kernel hash, so a selection survives the edits that re-hash the model. The brepjs/shapeRef API for edit-after-reference parametrics.'
---

# Stable References

A [finder](/tasks/finders) answers "which face points up _right now_?" against the shape in front of it. That's exactly what you want while building a part. It's exactly what you _don't_ want when you need to remember a selection across an edit: rerun the build with a different parameter and the kernel hands back a topologically equivalent solid whose faces, edges, and vertices all carry **different hashes**. A finder re-queries and finds the new face; a saved hash or face index points at nothing, or worse, at the wrong thing.

`brepjs/shapeRef` is the durable counterpart to a finder. Instead of capturing a face's identity (its hash) or its position (an index), it captures a face's **name** — a description stable enough to re-find the same logical entity on a rebuilt model. This is what makes "fillet _this_ edge, then let the user change the box height and keep filleting the same edge" work: edit-after-reference parametrics.

## The idea: name by your neighbours

A hash is assigned by the kernel and changes when anything upstream changes. A name should instead be derived from things that _don't_ move:

- A **face** is named by a semantic role within the operation that made it (`box:top`, `cylinder:side`) plus a geometric snapshot — its surface type, outward normal, centroid, and area.
- An **edge** is named by the roles of the **two faces it bounds**. An edge _is_ the intersection of its two faces, so it's re-found as the edge shared by whatever faces now carry those roles — no edge hash involved.
- A **vertex** is named by the roles of the **≥3 faces that meet at it** (two faces meet along an edge, not a point, so a corner needs three).
- A **generated face** — a fillet round or chamfer bevel that didn't exist when you captured the reference — is named by the **two faces it bridges**, and re-found as the new face whose normal blends both.

The through-line: identity rides on the already-stable face roles, not on the fragile hash of the entity itself. That also sidesteps a real kernel limitation — on the OCCT kernels, fillet/chamfer evolution is empty, so generated geometry has no traceable hash at all; naming it by its neighbours is the only thing that survives.

## Naming and resolving a face

```typescript
import { box, faceFinder } from 'brepjs/quick';
import { createRef, resolveRef } from 'brepjs/shapeRef';

// Author time: pick a face however you like, then give it a stable name.
const part = box(20, 20, 20);
const topFace = faceFinder().inDirection([0, 0, 1]).findAll(part)[0];
const topRef = createRef('box', 'box:top', topFace); // captures a geometric hint of that face

// Later, an upstream edit rebuilds the model — every face hash is now different.
const taller = box(20, 20, 30);

// Resolve the *name* against the new shape. With no maintained role table it
// matches on the captured hint (surface type, outward normal, centroid, area).
const hit = resolveRef(topRef, new Map(), taller);
if ('face' in hit) {
  // hit.face is the top face of the taller box.
  // hit.confidence is 'exact' (matched a role table) or 'geometric-fallback' (matched the hint).
} else {
  // hit.reason: 'deleted' | 'ambiguous' | 'not-found'
}
```

A `ShapeRef` is a plain, serializable object (`{ origin, role, hint }`) — store it, send it over a worker boundary, or write it into a feature-tree node. There's no kernel handle inside it to dispose.

### Two ways resolution can succeed

`resolveRef` returns a `confidence`:

- **`exact`** — the reference matched through a **role table**, the robust path. `assignRoles(shape, 'box')` builds the `role → face-hash` map for a shape, and `updateRoles` propagates it across an edit's evolution records, so a rebuild can resolve the role to its exact successor face. This is what a replay engine maintains under the hood.
- **`geometric-fallback`** — no role table was available (or it didn't cover this entity), so resolution matched on the captured hint: the face with the same surface type whose normal, centroid, and area are closest. This is the designed recovery path for when hash chains drift across many operations — pass an empty `new Map()` and you opt into it directly, as above.

## When a reference can't resolve

Resolution never throws and never silently returns the wrong entity. A failure is a typed result carrying _why_:

- **`not-found`** — nothing matched. For a face this usually means the edit deleted it; for an edge or vertex it means the named faces no longer share an edge/corner.
- **`ambiguous`** — several candidates tied (the `candidates` array carries them). The edit duplicated the feature, and the name no longer picks one.
- **`deleted`** — _face refs only._ A role table had the role, but its successor was removed by the edit. Edge and vertex refs never report `deleted`: they track their adjacent faces, not their own hash, so a vanished edge or corner surfaces as `not-found` instead.

That distinction is the point: a replay engine can treat a removed selection (`deleted` for a face, `not-found` for an edge or vertex) as "expected — skip this op," while surfacing `ambiguous` as "warn the author — your selection got duplicated."

## Parametric replay

The reason all of this exists is to let a recorded operation re-target the live entity after an upstream change. An op stores a lineage ref in its params (`{ edges: [edgeRef], ... }`); on rebuild, you swap each ref for the entity it now resolves to before re-running the op:

```typescript
import { resolveRefParams, resolveRefIn } from 'brepjs/shapeRef';

declare const filletParams: { edges: unknown[]; radius: number };
declare const rebuiltShape: import('brepjs').Shape3D;

// Resolve every lineage ref in a params bag against the rebuilt shape, recursing
// into arrays and nested option objects. Unresolvable refs are left as-is.
const live = resolveRefParams(filletParams, rebuiltShape);
// live.edges are now the edges on rebuiltShape — re-run the fillet with them.
```

`resolveRefParams` walks a params object and replaces any face/edge/vertex/generated-face ref with its live entity; `resolveRefIn(ref, shape)` resolves a single ref against a freshly rebuilt shape, re-deriving roles from `ref.origin` (so the origin must name the role-assignment scheme, e.g. `'box'`). `resolveLineageRef(ref, roles, shape)` is the lower-level form when you maintain the role table yourself. Type guards (`isFaceRef`, `isEdgeRef`, `isVertexRef`, `isDerivedFaceRef`, `isLineageRef`) discriminate the four kinds.

The [history replay](/tasks/parametric-csg) path uses exactly this to keep selections valid as you edit earlier steps.

## Kernel support

Resolution leans on adjacency and geometry the kernel can report reliably, plus the captured hint as a fallback — not on entity hashes, which kernels assign inconsistently. The generated-face path is the clearest example: because fillet/chamfer evolution is empty on OCCT, a fillet face is found by the normal-blend of the faces it bridges rather than by any hash. Behaviour is tracked per kernel in the [conformance suite](/extending/conformance); a few cases are skipped on occt-wasm where the kernel can't supply the needed evolution data.

## See also

- **[Finders & Queries](/tasks/finders)**: the in-the-moment selection API that stable references outlive.
- **[Parametric CSG](/tasks/parametric-csg)**: the rebuild-on-parameter-change loop these references are built for.
- **[Import & Export](/tasks/import-export)**: a `ShapeRef` is plain JSON — it serializes alongside your build recipe.
