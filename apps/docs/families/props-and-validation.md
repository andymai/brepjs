---
title: 'Props & Validation'
description: 'Validate family props with Zod at element construction: defaults and transforms applied before render, invocation vs render types, cross-field rules, and where errors surface.'
---

# Props & Validation

A family's props are its entire public surface, and they travel further than most function arguments: into the geometry recipe, into identity capture, and (in a BIM projection) into a parametric spec that other software will read. Families therefore validates at the **earliest possible moment**: element construction, where the stack trace still points at the call that wrote the bad value.

## A schema on the family

Pass a [Zod](https://zod.dev) schema as `props` and every invocation is checked before an element exists:

<!-- @setup -->

```typescript
import { family, el } from 'brepjs-families';
import { z } from 'zod';

const slabSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  thickness: z.number().positive(),
  predefinedType: z.enum(['FLOOR', 'ROOF', 'LANDING', 'BASESLAB']).default('FLOOR'),
  materialName: z.string().min(1).default('Concrete'),
});

const Slab = family(
  'Slab',
  (p: z.output<typeof slabSchema>) => el('Box', { size: [p.length, p.width, p.thickness] }),
  { props: slabSchema }
);
```

```typescript
Slab({ key: 'floor', length: 6000, width: 4000, thickness: -250 });
// throws: brepjs-families: invalid props for family 'Slab': ...
```

Failures throw with the family's name in the message. This is deliberately a throw, not a `Result`: bad props at construction are an authoring bug in code you are editing right now, the same category as a duplicate key, and the loudest possible failure is the kindest one.

## Schema output replaces the props

Validation is not a gate, it is a transformation: the schema's **output** becomes the element's props. Defaults and transforms apply before the render function runs and before identity capture, so everything downstream sees one consistent, completed value:

<!-- @run-test -->

```typescript
const slab = Slab({ key: 'floor', length: 6000, width: 4000, thickness: 250 });
// slab.props.predefinedType === 'FLOOR'
// slab.props.materialName === 'Concrete'
// Both defaults are real values now, visible to render, resolve, and any exporter.
```

This matters most at the [IFC boundary](/families/ifc-export): the spec path reads resolved props, and a default applied at construction reaches the file identically whether the caller wrote it or the schema supplied it.

## Invocation type vs render type

Defaults create a type asymmetry: callers may omit `materialName`, but render always receives it. `family` models this with two type parameters, `family<P, I>`, where `P` is the render (output) type and `I` the invocation (input) type. With a schema, both are inferred from it:

```typescript
const Slab = family(
  'Slab',
  (p: z.output<typeof slabSchema>) => /* p.materialName is string, not string | undefined */,
  { props: slabSchema }
);
// Callers get z.input<typeof slabSchema>: materialName is optional.
```

The schema's output type must be assignable to the render props, and the compiler enforces it: a schema that strips or transforms a field render depends on is a type error at the `family()` call, not a runtime surprise. Schema-less families use one type for both sides, unchanged.

## Cross-field rules

Real components have constraints between fields. The starter `room` family refuses a door that cannot fit its own south wall:

<!-- @run-test -->

```typescript
const roomSchema = z
  .object({
    width: z.number().positive(),
    height: z.number().positive(),
    doorWidth: z.number().positive().default(1000),
    doorHeight: z.number().positive().default(2100),
    doorAlong: z.number().nonnegative().default(0),
  })
  .superRefine((p, ctx) => {
    const along = p.doorAlong > 0 ? p.doorAlong : (p.width - p.doorWidth) / 2;
    if (along + p.doorWidth > p.width) {
      ctx.addIssue({ code: 'custom', message: 'door does not fit the south wall' });
    }
    if (p.doorHeight > p.height) {
      ctx.addIssue({ code: 'custom', message: 'door is taller than the room' });
    }
  });
```

Catching this at construction beats catching it as a mangled boolean cut three layers down, and beats by miles catching it as a wall-bounds error during export.

## Where each failure surfaces

| Mistake                          | Surfaces as                                     |
| -------------------------------- | ----------------------------------------------- |
| Invalid or out-of-range prop     | Throw at element construction, named family     |
| Duplicate sibling or slot key    | Throw during `resolve()`                        |
| Geometry that cannot build       | `Result` error per element from `evaluateModel` |
| Unkeyed element minting identity | `Result` error from `familiesToBim`             |

The pattern: authoring mistakes throw where you typed them; data and geometry problems flow as `Result`s where a program can handle them, consistent with [Result<T,E> everywhere else in brepjs](/concepts/result).

## Next steps

- **[IFC Export](/families/ifc-export)**: validated props feeding the parametric spec path.
- **[Elements, Key Paths & Identity](/families/identity)**: the identity rules the last table row enforces.
