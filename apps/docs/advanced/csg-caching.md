---
title: CSG Caching, Optimization, and Serialization
description: 'What the evaluator cache key contains, how optimize() rewrites trees before evaluation, JSON round-trip, and the primitives for rebuilding trees bottom-up.'
---

# CSG Caching, Optimization, and Serialization

This page documents the parts of the `csg` namespace that the [walkthrough](/tasks/parametric-csg) doesn't get into: what the cache key actually contains, what `optimize()` rewrites, how serialization works, and how to edit trees programmatically. If you're using CSG for live preview or build-time geometry generation, the things on this page are what determine your performance ceiling.

## What the cache key contains

`ev.evaluate(node, env)` computes a string key per node:

```
{structuralHash}:{kernelId}:{projectedEnvHash}:{toleranceHash}
```

Four parts. Each one is a reason two evaluations might _not_ share a cache entry:

- **`structuralHash`**: the Merkle hash of the node and everything beneath it. Different tree shape, different literal values, even different optional flags → different hash. Computed once at build time, stored on the node.
- **`kernelId`**: the kernel id resolved at evaluator construction (e.g. `'occt'`, `'brepkit'`). Cache entries are not portable across kernels; an OCCT-evaluated `Solid` cannot be returned to a brepkit caller. The id is resolved once at `new Evaluator()` so cache keys stay stable even if the active kernel changes mid-run.
- **`projectedEnvHash`**: the FNV hash of _only the env keys this node depends on_, in canonical (sorted) order. This is the mechanism behind incremental re-evaluation: a node whose `freeParams` doesn't contain `K` cannot see its key change when `K` does.
- **`toleranceHash`**: the default tolerance configured on the evaluator, or a sentinel if undefined. Two evaluators with different tolerances cache independently.

Two consequences worth internalizing:

1. **Cache reuse is structural, not nominal.** Two separately-constructed but structurally identical trees share entries automatically. You don't need to memoize calls to `csg.box(10, 10, 10)`; every call returns a different object, but they all hash the same.
2. **A parent hit short-circuits the whole subtree.** When a node hits, its children are never visited. That's why re-evaluating a tree is roughly free: the root usually hits, and that's the only `onStep` event you see.

## Reading the cache stats

`cacheStats()` returns `{ hits, misses, entries }`. `hits` and `misses` are running totals since the evaluator was constructed or `resetStats()` was last called. `entries` is a live snapshot of the current cache size; it is **not** reset by `resetStats()` and accumulates across the evaluator's lifetime.

```typescript
import { csg } from 'brepjs/quick';

using ev = new csg.Evaluator();
const tree = csg.fuse(csg.box(10, 10, 10), csg.sphere(5));

ev.evaluate(tree);
ev.cacheStats(); // { hits: 0, misses: 3, entries: 3 }

ev.evaluate(tree);
ev.cacheStats(); // { hits: 1, misses: 3, entries: 3 }
//  one new hit at the root; children short-circuited
```

For a finer-grained trace, install an `onStep` callback. It fires per visit with the node, the cache key, and whether it was a hit:

```typescript
import { csg } from 'brepjs/quick';

const events: { kind: string; hit: boolean }[] = [];
using ev = new csg.Evaluator({
  onStep: (info) => events.push({ kind: info.node.kind, hit: info.cacheHit }),
});

const tree = csg.cut(csg.box(10, 10, 10), csg.sphere(3));
ev.evaluate(tree);
ev.evaluate(tree);

events;
// [
//   { kind: 'Box',    hit: false },
//   { kind: 'Sphere', hit: false },
//   { kind: 'Cut',    hit: false },
//   { kind: 'Cut',    hit: true  }    // ← root hit on the second eval;
// ]                                    //   Box and Sphere not re-visited
```

`onStep` is the hook for understanding _why_ something didn't hit when you expected it to. Wire it to a UI button that dumps the last evaluation's trace and the cache misses become obvious.

## Tolerance and the cache

Tolerance is part of the cache key, so two evaluators configured with different tolerances cache independently even on identical trees:

```typescript
import { csg } from 'brepjs/quick';

using fine = new csg.Evaluator({ tolerance: 0.01 });
using coarse = new csg.Evaluator({ tolerance: 0.1 });

const tree = csg.box(1, 1, 1);
fine.evaluate(tree);
coarse.evaluate(tree);

fine.cacheStats().entries; // 1
coarse.cacheStats().entries; // 1
```

One tree, two cache entries, one per tolerance. Intentional: kernel output can differ at boundary tolerance, and miss-and-rebuild beats returning a shape that doesn't match what the caller asked for.

Per-node `tolerance` overrides on `fuse`/`cut`/`intersect`/`fuseAll`/`cutAll` are mixed into the **structuralHash**, not the cache key's tolerance slot; the evaluator-level tolerance stays a global default, per-call overrides ride along in the tree.

## `optimize()`: tree-level rewrites

`csg.optimize(tree)` rewrites the IR before evaluation. It never touches the kernel; everything it does is constant folding and identity elimination. The current passes:

| Pass                         | What it does                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| **Expression constant fold** | `2 + 3 * 4` → `14`, `cos(0)` → `1`, `[1, 2, 3][0]` → `1`                                     |
| **Empty identity**           | `fuse(empty, x)` → `x`; `cut(x, empty)` → `x`; `cutAll` filters empties                      |
| **Translate-by-zero**        | `translate(x, [0, 0, 0])` → `x`                                                              |
| **Translate fusion**         | `translate(translate(x, [1,0,0]), [2,0,0])` → `translate(x, [3,0,0])` (literal vectors only) |
| **Compound empty filter**    | `compound([a, empty, b])` → `compound([a, b])`                                               |
| **N-ary collapse**           | `fuseAll([x])` → `x`; `cutAll(x, [])` → `x`                                                  |

A worked example:

```typescript
import { csg } from 'brepjs/quick';

const tree = csg.translate(
  csg.fuse(csg.emptySolid(), csg.box(csg.binOp('+', csg.numLit(2), csg.numLit(3)), 10, 10)),
  [0, 0, 0]
);

const opt = csg.optimize(tree);
opt.kind; // 'Box' - three rewrites collapsed to a single primitive
```

The `2 + 3` folded to `5`, the `fuse(empty, …)` short-circuited to its second argument, and the outer `translate(…, [0,0,0])` collapsed to its target, leaving a bare `Box(5, 10, 10)`.

You don't have to call `optimize`; the evaluator works on any well-formed tree. But:

- **It changes cache keys.** An optimized tree has a different `structuralHash` than the original (smaller tree = different hash), so the first post-optimize evaluation will miss even if you'd previously evaluated the un-optimized version.
- **It's cheap.** Pure tree rewrites, no kernel calls, no allocation pressure. Run it once after the tree is built and you keep its smaller form for the rest of the session.
- **It only fires on literal inputs.** `translate(x, [param('dx'), 0, 0])` will not collapse even if `dx` happens to be zero at runtime; `optimize` runs before evaluation, so it can't know.

## Serialization: `toJSON` / `fromJSON`

The IR serializes to a JSON envelope versioned by `CSG_VERSION` (currently `1`):

```typescript
import { csg, isOk, unwrap } from 'brepjs/quick';

const tree = csg.cut(csg.box(csg.param('w'), 10, 10), csg.sphere(3));
const envelope = csg.toJSON(tree);
// { csgVersion: 1, root: { kind: 'Cut', a: { kind: 'Box', ... }, ... } }

const restored = csg.fromJSON(envelope);
isOk(restored); // true
unwrap(restored).structuralHash === tree.structuralHash; // true
```

The round-trip preserves structural hashes, so a deserialized tree shares cache entries with the original. Useful for:

- **Build pipelines**: serialize the tree at design time, materialize geometry at runtime against the deployed kernel.
- **Undo/redo**: `JSON.stringify` snapshots are tiny next to materialized B-Rep data.
- **Sharing builds**: paste a JSON envelope between users without shipping STEP files.

A note on shape: `toJSON` _expands_ the DAG to a tree. If your IR has shared subtrees (the same `Box` node referenced under two `Translate` parents), the JSON contains the box twice. Sharing is rebuilt on `fromJSON`; the rebuilt nodes hash identically, so the evaluator's cache still dedupes them. The JSON is just bigger than it strictly needs to be.

`fromJSON` is the trust boundary: every field is validated, every expression is reconstructed via builders so `structuralHash` and `freeParams` are correct. Invalid envelopes return `Result.err`, not throw.

## Editing trees: `replaceNode`, `forEachNode`, `nodeCount`

The IR is immutable. Edits rebuild from the bottom up via builders, which keeps hashes and free-params correct.

`csg.replaceNode(root, predicate, replacement)` walks the tree and substitutes any node matching the predicate:

```typescript
import { csg } from 'brepjs/quick';

const original = csg.fuse(csg.box(10, 10, 10), csg.sphere(5));
const swapped = csg.replaceNode(original, (n) => n.kind === 'Sphere', csg.cylinder(3, 8));
// swapped is a new Fuse(Box, Cylinder); structuralHash differs from original
```

For traversal and metrics:

```typescript
import { csg } from 'brepjs/quick';

const tree = csg.fuse(csg.box(1, 1, 1), csg.cut(csg.sphere(1), csg.cylinder(0.5, 2)));

csg.nodeCount(tree); // 5

const kinds: string[] = [];
csg.forEachNode(tree, (n) => kinds.push(n.kind));
// ['Fuse', 'Box', 'Cut', 'Sphere', 'Cylinder']
```

`replaceNode` is structural; it can't reach into expressions to change a `Param` name, for instance. For parameter changes, just re-evaluate with a new env; that's what the cache is built for.

## What doesn't cache

A few things are deliberately _not_ cached, and it's worth knowing why:

- **The kernel adapter's internal state.** Cached shapes are kernel handles, but cache entries don't persist across kernels. Re-binding the active kernel after evaluation builds a fresh cache if you construct a new `Evaluator`.
- **Errors.** `Result.err` values aren't cached. A re-evaluation of a node that previously failed will retry. Useful when the failure was transient (e.g. boolean tolerance issue resolved by a parent's tolerance override), but it does mean a persistently broken subtree will repeat its work each call.
- **`Empty` nodes.** They have no kernel realization; trying to evaluate one alone returns `Result.err`. `Empty` exists as the identity element for booleans; `fuse`/`cut` short-circuit on it as a correctness invariant (not just an optimization), so `fuse(empty, x)` evaluates to `x` directly without needing `optimize()`. The optimizer can still strip them eagerly to shrink trees before they reach the cache.
- **DOM-side mesh data.** The cache holds kernel handles, not tessellated meshes. If you tessellate after evaluation, that work isn't cached. Run your mesh cache on the same key the evaluator uses (`node.structuralHash` is a fine starting point).

## Cache lifecycle

`Evaluator` is a `Disposable`. The cache and all its borrowed kernel handles release when you dispose it, either explicitly via `[Symbol.dispose]()`, automatically via the `using` keyword, or implicitly inside `withEvaluator`.

```typescript
import { csg } from 'brepjs/quick';

// Pattern 1: long-lived evaluator (live UI, REPL)
const ev = new csg.Evaluator();
try {
  /* many evaluations… */
} finally {
  ev[Symbol.dispose]();
}

// Pattern 2: scoped evaluator (one-off build)
using ev = new csg.Evaluator(); // disposed at block exit

// Pattern 3: one-shot
csg.withEvaluator({}, (ev) => {
  /* synchronous body */
});
```

After disposal, every shape returned by `evaluate` is invalid; they were _borrowed_ from the evaluator's `DisposalScope`, not transferred out. Copy out any persistent data (volumes, mesh arrays, exported STEP strings) before the evaluator's lifetime ends.

## Where to go next

- **[The walkthrough](/tasks/parametric-csg)**: if you skipped here from the index, the gridfinity-bin walkthrough is where the surface API gets exercised end-to-end.
- **[Migrating from a hand-rolled cache](/migration/manual-csg-cache)**: for projects that already built a `Map<key, Solid>` cache around the eager API.
- **[Memory Management](/advanced/memory)**: for the `DisposalScope`/`using` pattern that `Evaluator` itself is built on.
