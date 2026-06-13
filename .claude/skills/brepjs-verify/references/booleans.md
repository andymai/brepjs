# Booleans

Combine solids with CSG. All three return `Result<T>`; unwrap or thread the result through to the default export.

| Function    | Signature         | Meaning              |
| ----------- | ----------------- | -------------------- |
| `fuse`      | `fuse(a, b)`      | union (a ∪ b)        |
| `cut`       | `cut(a, b)`       | subtract (a − b)     |
| `intersect` | `intersect(a, b)` | intersection (a ∩ b) |

```ts
// slotted.brep.ts
import { box, cylinder, cut } from 'brepjs';
export default () => {
  const body = box(40, 20, 10, { centered: true });
  const bore = cylinder(4, 12, { at: [0, 0, -6] });
  return cut(body, bore); // Result<Solid>, fine to return directly
};
```

## Pitfalls

- Returning a `Result` from the default export is supported; the verifier unwraps it and reports an `Err`.
- Booleans on touching-but-not-overlapping solids can yield empty/invalid results; give operands a small overlap.

See also: docs/function-lookup.md → brepjs/topology.
