# brepjs-families project

Parametric building model on brepjs. Units are mm end to end.

## Commands

- `npm run preview` — live viewer (`-- --watch` re-evaluates on save; clicking an element shows its key path; failed elements are listed)
- `npm start` — per-element mesh stats
- `npm run export:ifc` — write `dist/model.ifc`
- `npm test` / `npm run typecheck`

## Model contract

- `src/main.tsx` default-exports the element tree (or a function returning one). No top-level kernel work in the model module — the tools own evaluation.
- Families: `family('Name', render, { archetype })`. Identity props (`key`, `name`, `material`, `psets`) ride on any element. Every IFC-bound element needs an explicit `key` (GlobalIds derive from key paths).
- Voids: a fill-role family (door/window) inside a host's `voids` becomes a real IfcOpening + fill. Anonymous voids cut only the viewport mesh and are rejected by IFC export.
- Routed archetypes: storey, wall, slab, column, beam, roof, stair, door, window, footing, pile, railing, ramp, covering, curtainWall, space. Anything else exports as IfcBuildingElementProxy.
- Placement: fold translations via `transform: [tTranslate([x, y, z])]`; orient walls via `axisX`, never a rotate op (IFC export rejects rotated spec placements).

## Conventions

- Kernel handles: `using evaluator = new csg.Evaluator()` owns evaluated meshes/shapes; never dispose borrowed handles.
- Imports use explicit extensions (`../src/main.tsx`); tsconfig sets `jsx: react-jsx` + `jsxImportSource: brepjs-families`.
- Geometry sanity: prefer `expect(node.mesh.ok)` per element over deep mesh assertions.
