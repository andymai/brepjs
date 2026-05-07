---
title: Types That Prove Geometry Is Valid
description: 'Branded types, phantom dimensions, and validity brands prove your geometry compiles only when it is structurally valid.'
---

# Types That Prove Geometry Is Valid

This is the chapter that explains what makes brepjs different. Most code-CAD libraries treat shapes as a single "thing" — `Shape`, `Geometry`, `Solid` — and let runtime errors find your bugs. brepjs uses TypeScript's type system to encode topological invariants at compile time. A wire that hasn't been proven closed cannot be passed to `face()`. A face whose normal hasn't been determined cannot be passed to `extrude()`. The compiler refuses, and you find the bug while typing.

There are three layers of types that work together: **branded types** for shape kind, **phantom dimension types** for 2D/3D safety, and **validity brands** for topological invariants.

## Layer 1: branded types for shape kind

A B-Rep shape is, at the kernel level, an opaque WASM handle. Without help, every shape would have type `unknown` or `any`. brepjs adds a phantom brand:

```typescript
type Edge<D extends Dimension = '3D'>   = ShapeHandle & { readonly [__brand]: 'edge'; ... };
type Wire<D extends Dimension = '3D'>   = ShapeHandle & { readonly [__brand]: 'wire'; ... };
type Face<D extends Dimension = '3D'>   = ShapeHandle & { readonly [__brand]: 'face'; ... };
type Solid                              = ShapeHandle & { readonly [__brand]: 'solid' };
```

The brand is a phantom property — it exists only at the type level, costs zero bytes at runtime, and prevents nominal mixups:

```typescript
import { box, edgeFinder, type Face } from 'brepjs/quick';

const edges = edgeFinder().findAll(box(10, 10, 10));
const firstEdge = edges[0];

// This does NOT compile — Edge is not assignable to Face
// const f: Face = firstEdge;
void firstEdge;
```

You can't accidentally pass an `Edge` where a `Face` is expected. Each brand is unique.

## Layer 2: phantom dimension types

Many shape types carry a phantom dimension parameter `D extends '2D' | '3D'`:

```typescript
type Edge<D extends Dimension = '3D'>
type Wire<D extends Dimension = '3D'>
type Face<D extends Dimension = '3D'>
```

The default is `'3D'`, so existing code works unchanged. The dimension is enforced for 2D-specific entry points (the Drawing API):

```typescript
import { drawRectangle, type Face } from 'brepjs/quick';

const profile = drawRectangle(40, 20); // Drawing<'2D'>
// Trying to extrude this directly fails: extrude expects a 3D OrientedFace,
// not a 2D drawing. You must project to a plane first:
//
//   const sketch = drawingToSketchOnPlane(profile, 'XY');
//   const solid = unwrap(sketchExtrude(sketch, 10));
```

The dimension parameter has zero runtime cost. `Edge<'2D'>` and `Edge<'3D'>` are the same byte-for-byte at runtime; only the compiler distinguishes them.

`Shell`, `Solid`, and `CompSolid` are always 3D — they have no dimension parameter.

## Layer 3: validity brands for topological invariants

Some operations require shapes that satisfy properties beyond their kind. A face cannot be built from any wire — only from a _closed_ wire. A solid cannot be extruded from any face — only from one with a determined normal. brepjs encodes these as **validity brands**:

```typescript
type ClosedWire<D> = Wire<D> & { readonly [__closed]: true };
type OrientedFace<D> = Face<D> & { readonly [__oriented]: true };
type ManifoldShell = Shell & { readonly [__manifold]: true };
type ValidSolid = Solid & { readonly [__valid]: true };
```

Functions declare exactly the validity they need:

```typescript
function face(wire: ClosedWire): Result<OrientedFace, BrepError>;
function extrude(face: OrientedFace, height: number): Result<ValidSolid, BrepError>;
```

The compiler enforces the chain: you cannot `extrude(someFace, 10)` unless that face is `OrientedFace`. You cannot `face(someWire)` unless that wire is `ClosedWire`.

## How a wire becomes valid

There are three ways to obtain a validity-branded type:

### 1. Smart constructor (runtime check + brand)

```typescript
import { closedWire } from 'brepjs/quick';
declare const myWire: import('brepjs').Wire;

const result = closedWire(myWire); // ValidityResult<ClosedWire>
if (result.valid) {
  // result.shape is now ClosedWire — the runtime check passed
  // and the type system has been updated.
  const cw = result.shape;
  void cw;
}
```

`closedWire(w)` performs a runtime check (does this wire form a loop?) and returns a `ValidityResult` — either `{ valid: true, shape: ClosedWire }` or `{ valid: false, reason: ... }`. Use this when you've built a wire from primitives or imported it.

### 2. Type guard (narrow in place)

```typescript
import { isClosedWire } from 'brepjs/quick';
declare const myWire: import('brepjs').Wire;

if (isClosedWire(myWire)) {
  // myWire is ClosedWire from here down
  const cw = myWire;
  void cw;
}
```

The type guard combines the runtime check with TypeScript narrowing. Equivalent to the smart constructor but reads more naturally in conditionals.

### 3. Convenience builder (returns branded type directly)

```typescript
import { line, wireLoop, face, extrude, unwrap } from 'brepjs/quick';

// wireLoop returns Result<ClosedWire> — it builds a closed wire by construction
const cw = unwrap(
  wireLoop([
    line([0, 0, 0], [10, 0, 0]),
    line([10, 0, 0], [10, 10, 0]),
    line([10, 10, 0], [0, 10, 0]),
    line([0, 10, 0], [0, 0, 0]),
  ])
);

const f = unwrap(face(cw)); // ClosedWire → OrientedFace
const s = unwrap(extrude(f, 10)); // OrientedFace → ValidSolid
console.log('Built a valid solid by construction');
```

`wireLoop`, `face`, `extrude`, and the primitive constructors (`box`, `cylinder`, `sphere`) all return validity-branded types. The chain compiles only because each step's input type is satisfied.

## What the validity brands prevent

| Without brands (typical libraries)                                     | With brands (brepjs)                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `face(wire)` accepted at compile, may throw at runtime if wire is open | `face(wire)` rejected at compile if wire is not `ClosedWire` |
| `extrude(face, 10)` accepted, may produce inverted solid               | `extrude(face, 10)` rejected if face is not `OrientedFace`   |
| Caller has to remember to `if (wire.isClosed)`                         | Caller cannot forget — the compiler refuses                  |
| Validity checks scattered throughout user code                         | Centralized in smart constructors and builders               |

## Combining the layers

A complete signature:

```typescript
function extrudeOnPlane(
  profile: ClosedWire<'2D'>,
  plane: PlaneName,
  height: number
): Result<ValidSolid, BrepError>;
```

Reading this signature you know:

- `profile` is a wire (kind brand)
- The wire is 2D (dimension brand)
- The wire is closed (validity brand)
- The result is a solid that has passed BRepCheck (validity brand)
- The operation is fallible (`Result`)

All four facts are checked by the compiler.

## When brands get in the way

Branded types work great until you import a shape from elsewhere — STEP files, deserialized data, or third-party libraries. In those cases, you have a `Wire` and need a `ClosedWire`. Two options:

```typescript
import { closedWire, isClosedWire, autoHeal, unwrap } from 'brepjs/quick';
declare const importedWire: import('brepjs').Wire;

// Option 1: smart constructor with explicit failure handling
const result = closedWire(importedWire);
if (!result.valid) {
  console.error('Wire is not closed:', result.reason);
}

// Option 2: heal first, then check
const healed = unwrap(autoHeal(importedWire));
if (isClosedWire(healed)) {
  // proceed
}
```

`autoHeal` runs OpenCascade's `ShapeFix` to close gaps and stitch faces — see [Healing & Sewing](../advanced/healing).

## Cost: zero

Every brand is a phantom type. The compiled JS doesn't even know they exist. Branded shapes are **byte-identical** to their unbranded counterparts. The only cost is a few characters in the type signature.

## Next steps

- [Result and Errors](./result) — the `Result<T,E>` type used by every fallible operation
- [The Topology Hierarchy](./topology) — what each shape kind represents geometrically
- [Tolerance and Validity](./tolerance) — what `BRepCheck` actually checks, and what tolerance means
