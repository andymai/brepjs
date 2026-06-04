# Transforms

`translate`/`rotate`/`mirror`/`scale` return a new shape of the same type; `clone` returns `Result<T>`. Angles are in **degrees**.

| Function    | Signature                                 |
| ----------- | ----------------------------------------- |
| `translate` | `translate(shape, [x, y, z])`             |
| `rotate`    | `rotate(shape, angleDeg, { at?, axis? })` |
| `mirror`    | `mirror(shape, { normal?, at? })`         |
| `scale`     | `scale(shape, factor, { center? })`       |
| `clone`     | `clone(shape)` → `Result<T>`              |

```ts
// tilted.brep.ts
import { box, rotate, translate } from 'brepjs';
export default () => {
  const b = box(20, 20, 5, { centered: true });
  return translate(rotate(b, 30, { axis: [0, 1, 0] }), [0, 0, 10]);
};
```

## Pitfalls

- `rotate`'s angle is **degrees**, not radians.
- `rotate` pivots about `at` (default origin), not the centroid; pass `at` to spin in place.

See also: docs/function-lookup.md → brepjs/topology.
