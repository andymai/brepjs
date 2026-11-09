# Getting started

A brepjs model is a `.brep.ts` module with a default export: a zero-arg function returning a shape (or `Result<shape>`). The verifier imports the module, calls the default export, and runs deterministic checks on the result.

## The contract

| Form           | Signature                                                       |
| -------------- | --------------------------------------------------------------- |
| Plain shape    | `export default () => Solid`                                    |
| Result-wrapped | `export default () => Result<Solid>`                            |
| Async setup    | `export default async () => Solid` (kernel already initialized) |

The verifier handles kernel init; never call `initFromOC` yourself in a model.

## Minimal model

```ts
// bracket.brep.ts
import { box } from 'brepjs';
export default () => box(40, 20, 10, { centered: true });
```

## Verify it

```sh
npx -y -p brepjs-cad brep bracket.brep.ts
```

Add `--snapshot ./out` for PNGs (with the bbox size burned into each), `--step ./out/bracket.step` for the primary STEP, or `--serve` for a clickable interactive inspector (view presets, solid/wire/x-ray, face picking, section plane, measurements panel) that renders the real STEP geometry.

## Pitfalls

- The default export must be a **function**, not a shape value; the verifier calls it. `export default box(...)` fails.
- Import from the package root `'brepjs'`, not deep paths.

See also: docs/function-lookup.md → full symbol index.
