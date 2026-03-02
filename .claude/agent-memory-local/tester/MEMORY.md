# brepjs Tester Memory

## Test Framework

- Vitest with globals enabled, 30s timeout, forks pool
- All tests import from `../src/index.js` (ESM, .js extension required)
- WASM init: `import { initOC } from './setup.js'` and `beforeAll(async () => { await initOC(); }, 30000)`
- Test files live in `/var/home/andy/Git/brepjs/tests/`
- Run single file: `npx vitest run tests/fn-healingFns.test.ts`

## Key Patterns

- `unwrap(result)` to get value from `Result<T>`
- `isOk(result)` / `isErr(result)` to check Result discriminant
- `unwrapErr(result).code` to assert error codes
- `isSolid()`, `isFace()`, `isWire()` for shape type guards
- `measureVolume(shape)` / `measureArea(shape)` for geometry assertions
- `expect(value).toBeCloseTo(expected, precision)` for floating point geometry

## Shape Creation Helpers

- Primitives: `box(w,h,d)`, `sphere(r)`, `cylinder(r,h)`, `cone(...)`, `torus(...)`
- `translate(shape, [x,y,z])` to position shapes
- `fuse(a,b)`, `cut(a,b)`, `intersect(a,b)` return `Result<Shape3D>`
- Boolean results must be `unwrap()`-ed before use
- `getFaces(shape)`, `getWires(shape)`, `getEdges(shape)` to extract sub-shapes

## Test File Naming

- `fn-*.test.ts` for functional API tests
- `api*.test.ts` for public API tests
- Extend existing test files rather than creating new ones

## autoHeal Notes

- Valid shapes short-circuit immediately: `report.alreadyValid=true`, no sew/heal diagnostics
- `sewTolerance` and `fixSelfIntersection` steps only run when shape was invalid (not short-circuited)
- All option flags default to true except `fixSelfIntersection` which defaults to false
- `HealingReport` and `AutoHealOptions` are exported from `../src/index.js` as types

## Assembly Mate Notes (mateFns.ts)

- `addMate(assembly, constraint)` is immutable — returns new node, original unchanged
- `solveAssembly` errors: no mates (`undefined`/`[]`), or any non-fixed mate where entity has no `face` and no `point`
- Solver uses **original** face coordinates — distance constraints do NOT compose across multiple mates
- `concentric` and `angle` constraints are accepted but the analytical solver does not currently reposition nodes
- `fixed` mate always succeeds (no geometry extraction needed, just pins node at origin)
- Face helpers: `getFaces(shape)` + `faceCenter(face)` for selecting top/bottom/cylindrical faces
- `cylinder(r, h)` cylindrical side face center: smallest `|Z|` among all faces
