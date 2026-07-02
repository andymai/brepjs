# Healing pipeline reference

All symbols in `src/topology/healingFns.ts` unless noted.

## `autoHeal(shape, options?)` → `Result<{ shape, report }>`

The one-call entry point. Dispatches to `ShapeFix_Solid`/`Face`/`Wire` by shape type. Marked `// brepjs-patterns-disable: max-function-lines`.

### `AutoHealOptions` (`healingFns.ts`)

| Option                | Default | Effect                                     |
| --------------------- | ------- | ------------------------------------------ |
| `fixWires`            | `true`  | Fix wire gaps/connectivity                 |
| `fixFaces`            | `true`  | Fix face orientation/geometry              |
| `fixSolids`           | `true`  | Fix shell gaps/orientation                 |
| `sewTolerance`        | _unset_ | **Sewing runs only when this is provided** |
| `fixSelfIntersection` | `false` | Fix wire self-intersections                |

### `HealingReport` (`healingFns.ts`)

```
{ isValid, alreadyValid, wiresHealed, facesHealed, solidHealed, steps: string[], diagnostics: HealingStepDiagnostic[] }
```

`HealingStepDiagnostic` = `{ name, attempted, succeeded, detail? }`.

- `wiresHealed`/`facesHealed` are `Math.abs(after - before)` **count deltas** (`healingFns.ts`) — a heuristic change-detector, not a repair count.
- On the invalid path, diagnostic `name`s appear in order: `sew`, `fixSelfIntersection`, then `healSolid`/`healFace`/`healWire` (or `healShape` with `detail:'skipped by options'`), then `finalValidation` (`healingFns.ts`).

### The short-circuit (the #1 trap)

When `isValid(shape)` is already true, `autoHeal` returns immediately (`healingFns.ts`):

```
report = {
  isValid: true, alreadyValid: true,
  wiresHealed: 0, facesHealed: 0, solidHealed: false,
  steps: ['Shape already valid'],
  diagnostics: [{ name: 'validation', attempted: true, succeeded: true }],
}
```

No `sew`/`fixSelfIntersection`/`healSolid` diagnostics because **those passes never executed**. Do not read an `alreadyValid` report as "healing inspected the shape and found nothing." Confirmed by `tests/autoHeal.test.ts` and `:100-105`.

## Escalation ladder

When `autoHeal` leaves `report.isValid === false`:

1. Retry with an explicit `sewTolerance` (turns on the sewing pass).
2. `fixShape(shape)` — general `ShapeFix_Shape` repair (`healingFns.ts`).
3. `solidFromShell(shell)` — promote a closed shell to a solid (`healingFns.ts`).
4. `fixSelfIntersection(wire)` — targeted self-intersection repair (`healingFns.ts`).
5. Give up: surface `HEAL_SOLID_INCOMPLETE` / `HEAL_NO_EFFECT` to the caller.

## Type-specific healers and their failure codes

`healSolid(solid)` → `Result<ValidSolid>` (`healingFns.ts`) validates the healed result and resolves to one of three outcomes (one success, two errors):

| Kernel result               | Input state   | Outcome                              |
| --------------------------- | ------------- | ------------------------------------ |
| `null`                      | already valid | returns the original solid unchanged |
| `null`                      | invalid       | `HEAL_NO_EFFECT`                     |
| non-null but re-check fails | —             | `HEAL_SOLID_INCOMPLETE`              |

`healSolid` calls `invalidateShapeCache(cast)` because brepkit heals **in-place** and returns the same handle, so the cached `isValid` would otherwise be stale (`healingFns.ts`). Other healers: `healFace`, `healWire(wire, face?)` (`face` gives surface context). The polymorphic `heal(shape)` dispatches solid/face/wire and returns any other type unchanged.

## Validity caching

`isValid` delegates to `getCachedIsValid` (`healingFns.ts`). When a value looks stale after an in-place repair, call `invalidateShapeCache` (in `src/topology/topologyQueryFns.ts`, re-exported from the index).
