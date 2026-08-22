---
title: JSX Authoring
description: 'Author family trees as JSX: tsconfig setup, imported intrinsic components, children idioms, and how validation behaves identically to the plain-function API.'
---

# JSX Authoring

Every family tree in this section can also be written as JSX. Nothing about the model changes: a JSX tag calls the same component function, so zod validation, defaults, and identity props behave identically. The plain-function API stays primary; JSX is sugar for people (and reviews) that read component trees best.

## Setup

Point your `tsconfig.json` at the runtime that ships inside `brepjs-families`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "brepjs-families"
  }
}
```

Name the file `.tsx` and you're done. No React involved: the runtime builds the same plain `Element` objects `family()` and `el()` do.

## Components and intrinsics

Family components work as tags directly. The intrinsic vocabulary (`Box`, `Cylinder`, `Geometry`, `Group`) is exported as typed components, because JSX resolves capitalized tags to imports:

```tsx
import { Box, Group, family, resolve, type FamilyChildren } from 'brepjs-families';
import { z } from 'zod';

const wallSchema = z.object({
  length: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive().default(200),
});

const Wall = family(
  'Wall',
  (p: z.output<typeof wallSchema>) => <Box size={[p.length, p.thickness, p.height]} />,
  { props: wallSchema }
);

const Storey = family<{ children?: FamilyChildren }>('Storey', (p) => <Group>{p.children}</Group>);

const tree = resolve(
  <Storey key="ground">
    <Wall key="south" length={4000} height={2700} />
    <Wall key="north" length={4000} height={2700} />
  </Storey>
);
```

Invalid props throw at element construction, exactly as on the function path. `key` works on every tag and is what [key-path identity](/families/identity) derives from, so keep keys on anything a BIM export will touch.

## Children idioms

Children reach the render function as `props.children`, already flattened and cleaned, so the usual React idioms compose:

```tsx
<Storey key="g">
  {showPorch && <Wall key="porch" length={2000} height={1100} />}
  {rooms.map((r) => (
    <Room key={r.id} width={r.w} depth={r.d} height={2700} />
  ))}
  <>
    <Wall key="a" length={100} height={100} />
    <Wall key="b" length={100} height={100} />
  </>
</Storey>
```

Conditionals that evaluate to `false`/`null` disappear, nested arrays flatten, and fragments inline without contributing a key-path segment. Declare a children prop as `FamilyChildren` to accept all of that; resolution hands your render a flat `Element[]`.

## Voids and openings

`voids`, `fuse`, and `transform` are props on every intrinsic, so the whole [openings model](/families/openings) is available in JSX with no change of meaning. A plain element in `voids` is an anonymous cut, geometry with no identity:

```tsx
import { Box, family, resolve, tTranslate, type Element } from 'brepjs-families';

const Bin = family<{ length: number; width: number; height: number; wall: number }>('Bin', (p) => (
  <Box
    size={[p.length, p.width, p.height]}
    voids={[
      <Box
        size={[p.length - 2 * p.wall, p.width - 2 * p.wall, p.height - p.wall]}
        transform={[tTranslate([p.wall, p.wall, p.wall])]}
      />,
    ]}
  />
));
```

`voids` is a prop rather than children, and the split is semantic: children are contained by the host and carry their own key paths, voids are subtracted from it. Put an instance of a `role: 'fill'` family in `voids` and you get both, because resolution synthesizes an `Opening` between host and filler:

```tsx
const Door = family<{ width: number; height: number; at: number }>(
  'Door',
  (p) => <Box size={[p.width, 300, p.height]} transform={[tTranslate([p.at, 0, 0])]} />,
  { role: 'fill' }
);

const Wall = family<{ voids?: readonly Element[] }>('Wall', (p) => (
  <Box size={[4000, 200, 2700]} voids={p.voids ?? []} />
));

resolve(<Wall key="south" voids={[<Door key="entry" width={1000} height={2100} at={1500} />]} />);
```

```
south                     the wall      Voids -> south/voids:entry
south/voids:entry         the opening   Fills -> south/voids:entry/fill
south/voids:entry/fill    the door
```

One children idiom does not carry over. `voids` takes a plain `Element[]` and is not run through children normalization, so a bare `{show && <Door … />}` entry is a type error rather than a node that disappears. Build the array instead:

```tsx
const openings = show ? [<Door key="entry" width={1000} height={2100} at={1500} />] : [];
resolve(<Wall key="south" voids={openings} />);
```

## When to prefer the function form

The two forms produce hash-identical trees, so this is style, not capability. Reach for plain calls when you're generating elements programmatically (loops over data, builders), and JSX when a human reviews the model shape: a storey of keyed walls reads like the building it describes.
