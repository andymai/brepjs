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
- **Exploded assembly views must stay legible.** When the part's point is a _joint_ (mortise/tenon,
  dovetail, snap-fit, a mate), explode the bodies **along their mating axis** — so the tongue/slot
  faces the viewer — with enough offset to separate them; a stack offset _perpendicular_ to the joint
  reads as two plain blocks (a blind judge will call it "two stacked blobs"). Size the mating features
  proud enough to read: a tenon clearly proud of its member, a mortise a visible through-slot — not a
  flush sliver.

See also: docs/function-lookup.md → brepjs/topology.
