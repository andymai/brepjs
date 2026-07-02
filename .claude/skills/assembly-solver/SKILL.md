---
name: assembly-solver
description: This skill should be used when working on brepjs assemblies, constraint solving, or kinematics — debugging a solve that returns ASSEMBLY_NOT_CONVERGED / ASSEMBLY_MATE_INVALID / ASSEMBLY_SOLVE_FAILED, adding or extending a mate or solver entity-pair, adding a joint type, or driving a mechanism. Trigger phrases include "assembly won't converge", "Unsupported constraint types", "solveAssembly returns Err", "add a mate/joint/constraint type", "extend TRANSLATIONAL_PAIRS", "solveMate: unsupported entity pair escaped filter", "revolute/prismatic/cylindrical/planar/spherical joint", "forwardKinematics", "inverse kinematics / IK target", "DH table / Denavit-Hartenberg", "export/import URDF", or "positioned STEP export from an assembly". Not for boolean fuse/cut compounds (that is debugging-geometry).
---

# Assemblies, constraint solving, and kinematic joints

Covers two Layer-2 subsystems: the immutable assembly tree with its analytical constraint solver, and drivable kinematic joints (forward/inverse kinematics, DH, URDF). All of it is pure data + math with no kernel calls, except the STEP export at the very end.

## Two unrelated meanings of "assembly" — do not conflate

This is the number-one source of confusion. There are two "assembly" APIs that share a word and nothing else.

1. **Assembly tree + mates + joints** — an immutable `AssemblyNode` tree (`src/operations/assemblyFns.ts`), constraint mates (`src/operations/mateFns.ts`), and kinematic joints (`src/operations/jointFns.ts`). Pure data + math. This is what the constraint solver and all the kinematics operate on.
2. **Assembly STEP export** — `exportAssemblySTEP` / `createAssembly` / `exportSTEP` (`src/operations/exporterFns.ts`, `src/operations/exporters.ts`). An XCAF colored/named multi-shape STEP writer. It takes a flat `ShapeOptions[]`, **not** an `AssemblyNode`, and never reads mates, joints, or solved transforms.

There is **no bridge** between them. A solved tree's transforms are not fed into `exportAssemblySTEP`. To write a positioned STEP, apply the solved transforms to the shapes and pass them as `ShapeOptions[]`.

## The solver mental model

Read `CLAUDE.md`'s "Assembly solver composes constraints down a chain" gotcha first — it is the authoritative one-liner. `solveConstraints(nodes, constraints)` in `src/kernel/solverAdapter.ts` is the analytical (closed-form, non-iterative) core. Its algorithm:

- Every node starts at origin/identity.
- A **positioning mate** is one of `coincident`, `distance`, `angle`, `concentric` (the `POSITIONING_TYPES` set) with both entities present. **`entityA` is the reference, `entityB` is the dependent.**
- **Anchors sit at the origin**: any node that is never a dependent (a chain root), plus any explicit `fixed` node.
- Well-typed mates resolve in **topological rounds**: a mate places its dependent once its reference is already placed, solving against the reference's _solved world-space pose_ (rotation included), so multi-body chains compose.
- Diagnostics: an entity-type mismatch is pushed as `type(a-b)` and dropped; a mate whose reference never resolves (cycle/dangling) is pushed as `type(unanchored)`. `converged = unsupported.length === 0`.

`mateFns.solveAssembly` wraps this: it extracts geometry, calls `solveConstraints`, and maps the result to a `Result<AssemblySolveResult>`.

## From `MateEntity` to a solver entity type

A `MateEntity` is `{ node, face?, edge?, point? }`. `extractEntity` in `mateFns.ts` maps it to a solver entity typed `plane`, `axis`, or `point`:

- **face** → `faceAxis(face)` (from `faceFns.ts`); non-null (a cylindrical/axial face) → `axis`, else `plane` via `faceCenter` + `normalAt`. `faceAxis` returning null is the axial-vs-planar discriminator.
- **edge** → `LINE` type → `axis` along its tangent; else `curveAxis` (circular edge, e.g. a bore rim) → `axis`; else `null`.
- **point** → `point`.

If extraction returns null for either entity, `solveAssembly` fails with `ASSEMBLY_MATE_INVALID` ("could not extract geometry from mate entities").

## Supported constraint pairs

`isSupportedPair` (in `solverAdapter.ts`) decides solvability:

| Mate type                | Allowed `(entityA-entityB)` pairs                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `coincident`, `distance` | `TRANSLATIONAL_PAIRS`: plane-plane, plane-point, point-plane, point-point, axis-axis, axis-point, point-axis |
| `concentric`             | `REQUIRED_ENTITIES`: axis-axis only                                                                          |
| `angle`                  | `REQUIRED_ENTITIES`: plane-plane only                                                                        |
| `fixed`                  | one entity, anchors that node at origin                                                                      |

Both orders are listed for translational pairs, so entities need not be pre-ordered.

## Debugging a failed solve

The three error codes live in `src/core/errors.ts` (`ASSEMBLY_MATE_INVALID`, `ASSEMBLY_SOLVE_FAILED`, `ASSEMBLY_NOT_CONVERGED`). URDF errors instead use the generic `VALIDATION_FAILED`; STEP export uses `STEP_EXPORT_FAILED`.

## Symptom → cause → fix

| Symptom                                                                          | Cause                                                                                                               | Fix                                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ASSEMBLY_MATE_INVALID: no mates defined`                                        | Called `solveAssembly` before `addMate`                                                                             | Add at least one mate                                                                            |
| `ASSEMBLY_MATE_INVALID: could not extract geometry`                              | A `MateEntity` face/edge yielded no plane/axis/point (e.g. a non-line, non-circular edge)                           | Pick an axial/planar face, a straight or circular edge, or a point                               |
| `ASSEMBLY_NOT_CONVERGED: Unsupported constraint types: coincident(axis-plane) …` | Entity-type mismatch — pair not in the supported table (the canonical case is `coincident(axis-plane)`)             | Fix the entities so the pair is supported (e.g. axis-axis for concentric, plane-plane for angle) |
| `ASSEMBLY_NOT_CONVERGED: … concentric(plane-plane) …`                            | `concentric`/`angle` got the wrong entity types (they require axis-axis / plane-plane)                              | Feed the required entity types                                                                   |
| `ASSEMBLY_NOT_CONVERGED: … coincident(unanchored) …`                             | Reference never resolved — a mutual-reference cycle (a→b, b→a) or a dangling reference, with no root/`fixed` anchor | Add a `fixed` mate to anchor the chain, or break the loop                                        |
| `ASSEMBLY_NOT_CONVERGED: … solver did not converge` (no `unsupported` list)      | Rare: no diagnostics but still not converged                                                                        | Inspect the mate graph for an unanchored dependent                                               |
| `ASSEMBLY_SOLVE_FAILED: …`                                                       | An exception was thrown inside the solve (see below)                                                                | Read the wrapped message; likely the `solveMate` escaped-filter invariant                        |

The `dof` in the message is the sum over unsupported mates of `UNSUPPORTED_DOF` (coincident 3, concentric 4, distance 1, angle 1). `tests/mateFns.test.ts` has worked examples of every diagnostic, including the axis-plane and the a→b/b→a cycle.

## Extending the solver (new mate or entity pair)

The load-bearing invariant: `solveMate`'s default branch **throws** `"solveMate: unsupported entity pair escaped filter"` when `solveTranslational` returns null after `isSupportedPair` passed — i.e. the pair set and the dispatch switch drifted out of sync (surfaces as `ASSEMBLY_SOLVE_FAILED`).

To add a translational entity pair (e.g. a new axis-plane handling), update **both** in `solverAdapter.ts`:

1. Add the key to `TRANSLATIONAL_PAIRS`.
2. Add the matching `case` in the `solveTranslational` switch (with a per-pair solve function like the existing `solvePlanePair`, `solveConcentric`, `solveAxisToPoint`).

For a new orientation/axis mate, add to `REQUIRED_ENTITIES` and give it a branch in `solveMate`; add its type to `POSITIONING_TYPES` and `UNSUPPORTED_DOF`. Then surface it through `mateFns.ts`: extend the `MateConstraint` union and `mateToSolverConstraint`, and export from the public surface. See the `adding-operations` skill for the export/`function-lookup.md` gate and `result-error-handling` for adding an error code.

## Joints and kinematics

`src/operations/jointFns.ts` defines five joint types. A `Joint` connects `parent` (stationary reference) → `child` (moving); `dofs` is the source of truth; `value`/`min`/`max` mirror the primary (first) DOF for single-DOF ergonomics, and `axis` is the joint's anchor/primary axis (equal to the primary DOF axis only for single-axis joints, not for spherical/planar). Every DOF value is always clamped to `[min, max]` (`makeDof` normalizes inverted ranges).

| Joint         | DOFs                                         | Default ranges               |
| ------------- | -------------------------------------------- | ---------------------------- |
| `revolute`    | 1 rotation                                   | -180..180                    |
| `prismatic`   | 1 translation (ignores `axis.origin`)        | 0..100                       |
| `cylindrical` | rotation + slide on one axis                 | rot -180..180, trans 0..100  |
| `planar`      | u-trans, v-trans, rotation about normal      | u/v -100..100, rot -180..180 |
| `spherical`   | x, y, z rotations about a pivot (`Rx·Ry·Rz`) | each -180..180               |

- **Drive**: `setJointValues(joint, number[])` sets per-DOF positionally; `setJointValue(joint, n)` sets only the primary. `jointTransform(joint, value?)` returns the child's local pose — a single `number` overrides the primary DOF only, an array overrides positionally.
- **Forward kinematics**: `forwardKinematics(assembly, jointValues?)` returns a world `JointPose` for every node, keyed by **child** name, resolved topologically: `childWorld = parentWorld ∘ jointTransform ∘ offset?`. Roots sit at origin. `mechanismDOF` sums open-chain DOFs (closed-loop Grübler/Kutzbach is future work).
- **Add a joint type**: write a constructor building `dofs` via `makeDof` + `buildJoint`. FK/IK differentiate through `dofs`, so kinematics stays joint-agnostic automatically.

## Driving: inverse kinematics and trajectories

`src/operations/ikFns.ts`. `inverseKinematics(assembly, endEffector, target, options?)` is damped-least-squares over a numerically-differentiated Jacobian of `forwardKinematics` — joint-type agnostic. `IKTarget` is `{ position, rotation? }`; omit `rotation` for position-only (m=3 vs m=6). Options: `maxIterations` (200), `tolerance` (1e-5), `damping` (0.05), `seed`, `tip`. Gotcha: the finite-difference Jacobian steps _inward_ from a bound, because `forwardKinematics` clamps each DOF — a forward `+eps` at a limit would give a zero column and trap the solver.

`jointTrajectory(assembly, from, to, steps)` samples a straight line in joint space, returning `steps + 1` samples (both endpoints inclusive). Joints absent from `from`/`to` hold their stored value.

## DH and URDF interchange

`src/operations/dhFns.ts` — `jointsFromDH(rows, {base?})` builds a serial revolute/prismatic chain from a distal DH table. Each row → one joint; the variable is θ (revolute) or d (prismatic) about/along +z, and the fixed link geometry `Rz(θ)·Tz(d)·Tx(a)·Rx(α)` rides on `Joint.offset` so each row contributes exactly one DOF.

`src/operations/urdfFns.ts` — `exportURDF` round-trips only `revolute`/`prismatic`; it **errors** (`VALIDATION_FAILED`) on any multi-DOF joint or any joint carrying an `offset` (so DH chains cannot `exportURDF`). Revolute limits convert degrees↔radians on the boundary; prismatic emits a zero origin (brepjs prismatic FK ignores `axis.origin`). `importURDF(xml)` is a regex reader: `continuous` → revolute -180..180, and `fixed`/`floating`/`planar` joints are skipped (their links still listed).

## Assembly STEP / XCAF export

`exportAssemblySTEP(shapes: ShapeOptions[], { unit?, modelUnit? })` → `Result<Blob>` (MIME `application/STEP`). `ShapeOptions` is `{ shape, color?, alpha?, name? }`. The OOP twin `createAssembly` returns a disposable `AssemblyExporter` (a `KernelHandle`); `exportSTEP` disposes it via `Symbol.dispose`. See `src/operations/README.md` for units/colors — do not restate them. This path needs the kernel's `createXCAFDocument` / `writeXCAFToSTEP`; assembly-STEP XCAF is a known occt-wasm divergence, so check the `kernel-abstraction` skill for current support. For handle disposal see `memory-and-disposal`.

## Where things are exported (asymmetry to know)

Everything is in `src/operations.ts` and re-exported from root `brepjs` — **except mates**: `addMate`, `solveAssembly`, `MateConstraint`, `MateEntity`, `AssemblySolveResult` are exported **only from root `brepjs`** (`src/index.ts`), not from `brepjs/operations`. The solver core (`solveConstraints`, `SolverEntity`, `SolverConstraint`) is not barrelled at all — import it directly from `@/kernel/solverAdapter.js`, as the tests do.

## Additional resources

- `tests/mateFns.test.ts` — every solve + diagnostic case; `tests/jointFns.test.ts`, `tests/dhFns.test.ts`, `tests/ikFns.test.ts`, `tests/urdfFns.test.ts`, `tests/assemblyFns.test.ts` — usage examples.
- `src/operations/README.md` — the STEP/XCAF export details (units, colors, disposal).

### Sibling skills

- `result-error-handling` — unwrapping `Result`, adding a `BrepErrorCode`.
- `kernel-abstraction` — whether `createXCAFDocument`/`writeXCAFToSTEP` are supported per kernel.
- `adding-operations` — the export surfaces + `function-lookup.md` gate when adding a mate/joint function.
- `writing-tests` — the test skeleton.
- `memory-and-disposal` — the `AssemblyExporter` `KernelHandle` and `using`.
- `debugging-geometry` — for fused-compound "assemblies", which are a different thing entirely.
