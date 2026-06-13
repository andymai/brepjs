# Hill Tetrahedron Assembly Volume Study

Quantifying **V vs V\*** for random face-to-face assemblies of N Hill tetrahedra (sometimes nicknamed "Plancktons" in research notes).

## Definitions

- **L**: edge length of the Hill tetrahedron's short edge.
- **Single tet volume**: exactly `L³ / 6`.
- **V\***: ideal volume of an N-tet assembly = `N · L³ / 6`. This is the sum of the part volumes, equal to the actual occupied solid volume when there are no overlaps (always true in our face-to-face placement).
- **V**: convex-hull volume of all assembly vertices. This models the "vacuum bag shrink-wrap" upper bound: a perfectly inelastic bag pulled tight around the cluster cannot get smaller than the convex hull.
- **Packing efficiency**: V\* / V. Equals 1.0 when the assembly is convex (no voids); drops toward zero for branchy fractal-like growth.

## Reference points (deterministic, computed exactly)

| Configuration                   | N   | V               | V\*            | Efficiency          |
| ------------------------------- | --- | --------------- | -------------- | ------------------- |
| Single Hill tet (any chirality) | 1   | L³/6            | L³/6           | **1.000** (perfect) |
| Cube tiling (6-piece)           | 6   | L³              | L³             | **1.000** (perfect) |
| 8-reptile (doubled Hill tet)    | 8   | (2L)³/6 = 4L³/3 | 8·L³/6 = 4L³/3 | **1.000** (perfect) |

So with _the right_ arrangement, an N-tet assembly has zero void volume, exactly what Matoušek's k-reptile theorem guarantees for k = m³ (m=1,2,3...).

## Random face-to-face walk

At each step the algorithm:

1. Picks a random "free" face of the current assembly (a face not yet glued to another tet).
2. Picks a random chirality (R/L, 50/50) for the new tet.
3. Picks a compatible face of the template (same edge-length signature: isoceles right (1,1,√2) or scalene right (1,√2,√3)).
4. Mates the two faces with opposite outward normals (the only way two solids can share a face).
5. Rejects any placement whose interior overlaps an already-placed tet.

Result table (L = 1, **20 trials per N**, fresh seed each trial):

| N   | mean V | V\* = N/6 | efficiency V\*/V | std(eff) |
| --- | ------ | --------- | ---------------- | -------- |
| 1   | 0.167  | 0.167     | **1.000**        | 0.000    |
| 2   | 0.667  | 0.333     | 0.500            | 0.000    |
| 3   | 1.211  | 0.500     | 0.415            | 0.033    |
| 4   | 1.829  | 0.667     | 0.366            | 0.018    |
| 6   | 3.182  | 1.000     | 0.316            | 0.027    |
| 8   | 4.354  | 1.333     | 0.309            | 0.031    |
| 12  | 6.927  | 2.000     | 0.292            | 0.034    |
| 16  | 9.749  | 2.667     | 0.278            | 0.035    |
| 20  | 13.142 | 3.333     | 0.256            | 0.024    |
| 25  | 17.055 | 4.167     | 0.246            | 0.021    |
| 30  | 20.228 | 5.000     | 0.249            | 0.022    |
| 40  | 26.841 | 6.667     | 0.253            | 0.035    |
| 50  | 34.076 | 8.333     | 0.248            | 0.028    |

## Key observations

1. **Efficiency starts at 1.0 (N=1) and drops to ~0.25 by N≈25, then plateaus.**
   For large random assemblies, the vacuum-bag volume settles around **V ≈ 4 V\***, roughly 4× the part volume.

2. **N=2 is exactly 0.5.**
   Two Hill tets sharing a face occupy exactly half their convex hull, because the hull always becomes a 5-vertex (6-face) bipyramid whose volume is exactly 2× either component piece.

3. **The 75% void fraction is a property of the random walk, not the tet.**
   Perfect tilings give efficiency 1.0 (zero voids); the gap is entirely due to the branchy, fractal-like growth induced by uniform random face selection.

4. **Standard deviation is small (~3% absolute).**
   Run-to-run V varies a few percent; the asymptotic efficiency ~0.25 is robust.

## Reproducing

```bash
npx tsx scripts/hillTetrahedronStudy.ts --N 50 --trials 15 --seed 1
```

The math (with brepjs convex-hull volume) is in `scripts/hillTetrahedronStudy.ts`. The unit tests in `tests/hillTetrahedron.test.ts` verify the canonical tilings (6-in-cube, 8-reptile) against the exact volume formulas across the brepjs kernels.

## Interactive 3D

Four playground examples render the geometry. Open `apps/playground` (`npm run dev`) and pick:

- **Hill tetrahedron**: chiral pair mated face-to-face (red = right, white = left)
- **Hill tetrahedra: 6 tile a cube**: perfect tiling
- **Hill tetrahedra: 8-reptile**: exploded view of the m³-reptile dissection
- **Hill tetrahedra: random face-to-face pile**: live random assembly with V\*/V logged to the console

## Companion research repo

A deeper React/Three.js playground with statistical analysis (gyration tensor, pair correlation, fit models, multi-trial CSV export, η_C and η_B both) lives at <https://github.com/andymai/plancktons>, same math, more knobs.
