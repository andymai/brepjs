# File Splitting Refactoring Plan

This document outlines the plan to split large files in the brepjs codebase for better maintainability.

## Goals

- Split files exceeding ~300 lines into focused modules
- Maintain full backward compatibility via re-exports
- Use descriptive file naming (e.g., `shapeBooleans.ts`)
- Preserve layer architecture boundaries

## Target Files

| File                    | Current Lines | Target    | Priority |
| ----------------------- | ------------- | --------- | -------- |
| `topology/shapes.ts`    | 1,292         | ~300 each | High     |
| `kernel/occtAdapter.ts` | 1,115         | ~300 each | High     |

---

## Phase 1: Split `topology/shapes.ts`

Current structure (1,292 lines):

- Lines 1-167: Imports, types, helper functions, RadiusConfig, re-exports
- Lines 168-630: Shape base class (clone, serialize, transforms, edges/faces/wires, mesh, export)
- Lines 631-780: Vertex, Curve, \_1DShape, Edge, Wire classes
- Lines 781-870: Surface, Face classes
- Lines 871-1050: \_3DShape class (fuse, cut, intersect, shell, fillet, chamfer)
- Lines 1051-1170: Shell, Solid, CompSolid, Compound classes
- Lines 1171-1292: Standalone functions (fuseAll, cutAll, buildCompound, applyGlue)

### Proposed Split

#### 1.1 `topology/shapeBooleans.ts` (~150 lines)

Extract from `_3DShape` class and standalone functions:

- `_3DShape.fuse()` method logic → `fuseShape()`
- `_3DShape.cut()` method logic → `cutShapeMethod()` (internal)
- `_3DShape.intersect()` method logic → `intersectShapeMethod()` (internal)
- `fuseAll()` function
- `cutAll()` function
- `applyGlue()` helper

**Note:** Keep class methods as thin wrappers that delegate to these functions.

#### 1.2 `topology/shapeModifiers.ts` (~200 lines)

Extract from `_3DShape` class:

- `_3DShape.shell()` method logic
- `_3DShape.fillet()` method logic
- `_3DShape.chamfer()` method logic
- Related helper types (RadiusConfig already exists)

#### 1.3 `topology/shapeMesh.ts` (~100 lines)

Extract from `Shape` base class:

- `Shape.mesh()` method logic (delegates to meshFns.ts)
- `Shape.meshEdges()` method logic
- `Shape.blobSTEP()` method logic
- `Shape.blobSTL()` method logic

**Note:** Much of this already exists in `meshFns.ts` - verify delegation is complete.

#### 1.4 `topology/shapeTransforms.ts` (~80 lines)

Extract from `Shape` base class:

- `Shape.translate()` / `translateX/Y/Z()`
- `Shape.rotate()`
- `Shape.mirror()`
- `Shape.scale()`

#### 1.5 Remaining in `topology/shapes.ts` (~500 lines)

- All class definitions (Shape, Vertex, Curve, Edge, Wire, Face, Shell, Solid, etc.)
- Class methods become thin wrappers calling extracted functions
- Re-exports from all split files for backward compatibility

### shapes.ts Re-export Pattern

```typescript
// topology/shapes.ts - after refactoring
export * from './shapeBooleans.js';
export * from './shapeModifiers.js';
export * from './shapeMesh.js';
export * from './shapeTransforms.js';

// ... class definitions with delegating methods ...
```

---

## Phase 2: Split `kernel/occtAdapter.ts`

Current structure (1,115 lines):

- Lines 1-130: Boolean operations (fuse, cut, intersect, fuseMultiple)
- Lines 131-250: Wire/edge construction (assembleWire, joinCurves)
- Lines 251-400: Shape constructors (loft, sweep, shell, offset, fillet, chamfer)
- Lines 401-600: Primitive constructors (box, cylinder, sphere, ellipsoid, polygon)
- Lines 601-750: Mesh operations (triangulate, edgeMesh)
- Lines 751-900: I/O operations (exportSTEP, exportSTL, importSTEP, importSTL)
- Lines 901-1050: Utility operations (simplify, mirror, transform)
- Lines 1051-1115: Class definition and initialization

### Proposed Split

#### 2.1 `kernel/booleanOps.ts` (~130 lines)

- `fuse()`, `cut()`, `intersect()`, `fuseMultiple()`
- Boolean-specific helpers

#### 2.2 `kernel/constructorOps.ts` (~200 lines)

- `assembleWire()`, `joinCurves()`
- `loft()`, `sweep()`
- `shell()`, `offset()`

#### 2.3 `kernel/primitiveOps.ts` (~150 lines)

- `makeBox()`, `makeCylinder()`, `makeSphere()`, `makeEllipsoid()`
- `makePolygon()`, `makeFace()`

#### 2.4 `kernel/modifierOps.ts` (~100 lines)

- `fillet()`, `chamfer()`
- Shape modification operations

#### 2.5 `kernel/meshOps.ts` (~150 lines)

- `triangulate()`
- `getEdgeMesh()`
- Mesh-related helpers

#### 2.6 `kernel/ioOps.ts` (~150 lines)

- `exportSTEP()`, `exportSTL()`
- `importSTEP()`, `importSTL()`
- File I/O helpers

#### 2.7 `kernel/transformOps.ts` (~100 lines)

- `mirror()`, `transform()`
- `simplify()`

#### 2.8 Remaining in `kernel/occtAdapter.ts` (~150 lines)

- `OcctAdapter` class definition
- Constructor and initialization
- Delegation to operation modules
- Re-exports

### Adapter Pattern

```typescript
// kernel/occtAdapter.ts - after refactoring
import * as booleanOps from './booleanOps.js';
import * as constructorOps from './constructorOps.js';
// ... etc

export class OcctAdapter {
  // Delegate to operation modules
  fuse(shape: OcShape, tool: OcShape, options?: BooleanOptions): OcShape {
    return booleanOps.fuse(this.oc, shape, tool, options);
  }
  // ... etc
}
```

---

## Implementation Order

1. **Phase 1a**: Split `shapeBooleans.ts` from `shapes.ts`
   - Lowest risk, well-defined boundary
   - Test thoroughly before proceeding

2. **Phase 1b**: Split `shapeModifiers.ts` from `shapes.ts`
   - Depends on query module (EdgeFinder/FaceFinder)
   - May require careful import management

3. **Phase 1c**: Split `shapeMesh.ts` and `shapeTransforms.ts`
   - Verify alignment with existing `meshFns.ts`
   - May consolidate rather than split

4. **Phase 2a**: Split `kernel/booleanOps.ts`
   - Foundation for other kernel splits

5. **Phase 2b-2g**: Remaining kernel splits
   - Can be done in parallel after 2a

---

## Validation Checklist

For each split:

- [ ] `npm run typecheck` passes
- [ ] `npm run test` - all 1037 tests pass
- [ ] `npm run lint` - no errors
- [ ] `npm run check:boundaries` - layer boundaries respected
- [ ] `npm run build` - successful
- [ ] No breaking changes to public API
- [ ] Re-exports in place for backward compatibility

---

## Estimated Impact

| Metric                 | Before | After |
| ---------------------- | ------ | ----- |
| `shapes.ts` lines      | 1,292  | ~500  |
| `occtAdapter.ts` lines | 1,115  | ~150  |
| New files created      | 0      | ~11   |
| Max file size          | 1,292  | ~300  |

---

## Notes

- The `index.ts` file (609 lines) is intentionally large as a barrel export file
- `geometry.ts` (693 lines) has TODO markers for functional rewrite - defer splitting
- `Sketcher2d.ts` (640 lines) could be split later if needed

---

_Plan created: 2026-02-03_
_Status: Ready for implementation_
