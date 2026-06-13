# Assemblies & motion — validate mechanisms, not just static parts

A valid solid is not a working mechanism. The kernel verifies each part in isolation; it never
checks that assembled parts can **move through their range without colliding**, or that the driven
element actually **travels the intended distance**. (Desktop CAD covers this with "motion studies";
robotics with URDF joints + collision rules.) For anything that moves — hinge, slider, gear, crank,
linkage — add a motion-validation pass, or you will ship a mechanism that jams or doesn't move and
still reports `ok:true`.

## 1. Model the assembly as a function of its drive parameter

Author the mechanism parameterized by the thing that drives it (crank angle θ, slider position,
hinge angle). Place each moving part with transforms derived from that parameter. Keep each part a
pure function so you can re-pose it cheaply:

```ts
function pose(thetaDeg: number) {
  const z = (STROKE / 2) * Math.sin((thetaDeg * Math.PI) / 180);          // driven motion
  const crank = rotate(crankShaft(), thetaDeg, { at: [0, 0, AXLE_Z], axis: [1, 0, 0] });
  const piston = translate(pistonRodYoke(), [0, 0, z]);
  return { frame: frame(), crank, piston };
}
```

## 2. Two checks every mechanism must pass

**a) No interpenetration through the full range.** For each pose across the range and each pair of
parts, the overlap volume must be ~0. A positive intersection volume = the parts jam.

```ts
const overlap = (a, b) => {
  const r = intersect(a, b);
  return isOk(r) ? unwrap(measureVolume(unwrap(r))) : 0; // empty intersection -> Err/0
};
```

Sweep at a sensible step (every 15–30°). Allow a small epsilon for designed sliding contact /
coincident faces; flag anything above it.

**b) The driven element actually travels.** Measure the moving part's position at the extremes and
assert the travel equals the design. A mechanism that doesn't collide but also doesn't move is still
broken.

```ts
let maxOverlap = 0, zMin = Infinity, zMax = -Infinity;
for (let t = 0; t < 360; t += 15) {
  const p = pose(t);
  maxOverlap = Math.max(maxOverlap, overlap(p.piston, p.crank), overlap(p.piston, p.frame), overlap(p.crank, p.frame));
  const zb = getBounds(p.piston).zMin;
  zMin = Math.min(zMin, zb); zMax = Math.max(zMax, zb);
}
// PASS only if: maxOverlap ~ 0 (no jam)  AND  (zMax - zMin) ≈ STROKE (it really pumps)
```

## 3. Wire it into the verify loop

Make the motion check part of the part file so the standard `verify` catches it: the default export
runs the sweep, **throws on collision or zero-travel** (so the CLI reports a failure), then returns
the assembled `compound` for viewing.

```ts
export default () => {
  if (maxOverlap > EPS) throw new Error(`mechanism jams: overlap ${maxOverlap.toFixed(1)}mm³ at θ-sweep`);
  if (zMax - zMin < STROKE * 0.95) throw new Error(`piston barely moves: ${(zMax - zMin).toFixed(1)}mm vs ${STROKE}`);
  return compound([pose(0).frame, pose(0).crank, pose(0).piston]);
};
```

Also render the cycle: snapshot poses θ = 0 / 90 / 180 / 270 (place them side-by-side with
`translate`) so a human can SEE the stroke and confirm parts stay connected.

## Verdict

A mechanism is "done" only when **every part is a valid solid** (kernel) **AND** the motion sweep
shows **zero interpenetration** **AND** the driven element **travels the intended distance**. Report
the max overlap volume and the measured travel next to the usual report — don't claim a mechanism
works on geometry you only ever rendered at one pose.
