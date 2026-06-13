---
title: Examples
description: 'The few-shot example gallery brepjs-verify ships (primitives, booleans, 2D sketch-to-solid, modifiers, and gridfinity), each a complete .brep.ts with a recorded measurement baseline.'
---

# Examples

The skill ships a gallery of complete, verified parts under `skill/examples/<name>.brep.ts`, each paired with a `<name>.expected.json` baseline. They are the few-shot reference the agent reads before authoring, and the corpus the [deterministic eval](./eval) replays. Read the one closest to your task before writing a new part.

Each example is a real `.brep.ts` you can run directly:

```bash
npx -y brepjs-verify verify mounting-bracket.brep.ts --check --snapshot shots/
```

## Primitives + booleans

Reliable first-try. Start here.

- **`mounting-bracket`**: base plate + upright web + bolt holes (`box`, `fuse`, `cut`).
- **`flanged-coupler`**: flange + cylinder + bore, chamfered.
- **`transform-bracket`**: translate / rotate / mirror composition.

## 2D sketch → solid

A 2D profile driven up into 3D.

- **`extruded-bracket`**: rounded plate + bolt holes (extrude).
- **`revolved-pulley`**: V-groove profile revolved around an axis.
- **`swept-gasket`**: a frame profile swept along a spine.

## Modifiers

Validity-sensitive operations. Verify carefully.

- **`rounded-block`**: `fillet` on selected edges.
- **`chamfered-block`**: `chamfer`.
- **`hollow-enclosure`**: a filleted box, shelled to a wall thickness.

## Gridfinity

Parametric primitives for the [Gridfinity](https://gridfinity.xyz/) ecosystem.

- **`gridfinity-baseplate`**
- **`gridfinity-bin`**
- **`gridfinity-divider`**

## Anatomy of an example

Every example follows the [`.brep.ts` contract](./overview): a default-exported zero-arg function plus an `expected` block that pins its measured dimensions. The sibling `<name>.expected.json` records the baseline volume, area, validity, and shape-type that the eval replays within tolerance. An intentional geometry change means re-recording that baseline; an unintentional one shows up as a failed eval.

## Next steps

- [The Verify Loop](./the-loop): the workflow these examples were authored with
- [Eval & Scorecard](./eval): how the gallery becomes a regression net
