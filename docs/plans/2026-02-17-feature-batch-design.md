# Feature Batch Design: Polyhedron, Sweep Extensions, Face Naming, Assembly Mates

## Overview

Five features that fill the remaining high-impact gaps in brepjs compared to OpenSCAD, CadQuery, and professional CAD tools. Ordered from simplest to most complex.

## Feature 1: Polyhedron

Create a solid from raw vertex coordinates and face index arrays.

### API

```typescript
export interface PolyhedronOptions {
  tolerance?: number; // default 1e-6
}

export function polyhedron(
  points: Vec3[],
  faces: number[][], // each face is CCW vertex indices
  options?: PolyhedronOptions
): Result<Solid>;
```

### Implementation

- Fan-triangulate faces with >3 vertices
- Build OCCT faces from `gp_Pnt` triangles via `BRepBuilderAPI_MakeFace`
- Sew with `BRepBuilderAPI_Sewing` (same pattern as hull's `reconstructBrep`)
- Fix orientation with `ShapeFix_Shell` / `ShapeFix_Solid`
- Convert to solid with `BRepBuilderAPI_MakeSolid`

### Files

- `src/topology/polyhedronFns.ts` (Layer 2) — public API
- Reuses kernel sewing pattern from `src/kernel/hullOps.ts`

### Error handling

- `< 4 points` or `< 4 faces` — validation error
- Out-of-range vertex indices — validation error
- Non-manifold result — OCCT error with context

---

## Feature 2: Multi-Section Sweep

Sweep multiple profile wires at positions along a spine, blending between them.

### API

```typescript
export interface SweepSectionConfig {
  wire: Wire;
  location?: number; // 0.0-1.0 parameter along spine; auto-distributed if omitted
}

export function multiSectionSweep(
  sections: SweepSectionConfig[],
  spine: Wire,
  options?: {
    auxiliary?: Wire;
    transition?: 'transformed' | 'round' | 'right';
    solid?: boolean; // default true
    tolerance?: number;
  }
): Result<Solid | Shell>;
```

### Implementation

- Uses `BRepOffsetAPI_MakePipeShell` with multiple `SetLaw()` calls
- Each section wire positioned at its spine parameter
- Extends existing `sweepOps.ts` infrastructure

### Files

- `src/operations/sweepFns.ts` — public API (extends existing)
- `src/kernel/sweepOps.ts` — kernel implementation (extends existing)

---

## Feature 3: Guide Curve Sweep

Sweep a profile along a spine while the profile deforms to follow guide curves.

### API

```typescript
export function guidedSweep(
  profile: Wire,
  spine: Wire,
  guides: Wire[],
  options?: {
    keepContact?: boolean;
    transition?: 'transformed' | 'round' | 'right';
    solid?: boolean;
    tolerance?: number;
  }
): Result<Solid | Shell>;
```

### Implementation

- Uses `BRepOffsetAPI_MakePipeShell` with guide wires via `SetMode()`
- OCCT supports auxiliary guide curves natively through the pipe shell API
- Shares infrastructure with multi-section sweep

### Files

- Same as multi-section sweep — both extend existing sweep infrastructure

---

## Feature 4: Face Naming & Metadata

User-defined string tags on faces that persist through boolean operations and modifiers.

### API

```typescript
export function tagFaces(
  shape: AnyShape,
  selector: Face[] | ((face: Face) => boolean),
  tag: string
): AnyShape;

export function findFacesByTag(shape: AnyShape, tag: string): Face[];

export function getFaceTags(shape: AnyShape): Map<string, Face[]>;

export function setTagMetadata(
  shape: AnyShape,
  tag: string,
  metadata: Record<string, unknown>
): AnyShape;

export function getTagMetadata(shape: AnyShape, tag: string): Record<string, unknown> | undefined;
```

### Implementation

- Face hash (`TopoDS_Shape.HashCode()`) as persistence key
- `WeakMap<shape, Map<tag, Set<faceHash>>>` for tag storage
- Propagate tags through operations using existing `propagateOrigins` infrastructure (`BRepBuilderAPI_MakeShape.Modified()/Generated()`)
- When a tagged face splits (e.g., after fillet), all children inherit the tag

### Files

- `src/topology/faceTagFns.ts` (Layer 2)
- Integrates with existing `shapeFns.ts` origin tracking

### Design decision

WeakMap approach chosen over OCCT's `TDataStd_Name` (XDE attributes) — simpler, avoids coupling to heavyweight XDE framework.

---

## Feature 5: Assembly Mates with SolveSpace

Declarative constraint-based positioning for assembly parts using SolveSpace's `libslvs` WASM constraint solver.

### API

```typescript
export type MateConstraint =
  | { type: 'coincident'; entityA: MateEntity; entityB: MateEntity }
  | { type: 'concentric'; axisA: MateEntity; axisB: MateEntity }
  | { type: 'distance'; entityA: MateEntity; entityB: MateEntity; distance: number }
  | { type: 'angle'; entityA: MateEntity; entityB: MateEntity; angle: number }
  | { type: 'fixed'; entity: MateEntity };

export interface MateEntity {
  node: string; // assembly node name
  face?: Face; // reference face (extracts plane/axis)
  edge?: Edge; // reference edge (extracts axis)
  point?: Vec3; // reference point
}

export interface AssemblySolveResult {
  transforms: Map<string, { position: Vec3; rotation: Quaternion }>;
  dof: number;
  converged: boolean;
}

export function addMate(assembly: AssemblyNode, constraint: MateConstraint): AssemblyNode;

export function solveAssembly(assembly: AssemblyNode): Result<AssemblySolveResult>;
```

### Implementation

1. **SolveSpace WASM integration** — add `libslvs` compiled to WASM as optional dependency
2. **Geometry extraction** — convert OCCT face normals/centers/axes to SolveSpace entities
3. **Constraint mapping** — map `MateConstraint` to SolveSpace constraint types (`SLVS_C_POINTS_COINCIDENT`, `SLVS_C_IN_PLANE`, etc.)
4. **Solve** — call solver, read transforms, apply to assembly nodes
5. **Lazy loading** — SolveSpace WASM loaded only when `solveAssembly` is called

### Files

- `src/operations/mateFns.ts` (Layer 2) — constraint API, geometry extraction
- `src/kernel/solverAdapter.ts` (Layer 0) — SolveSpace WASM wrapper

### Risks

- SolveSpace WASM may not exist as a ready npm package — may need to compile `libslvs` ourselves
- Fallback: start with analytical solves for simple pairs (coincident, concentric) and add full solver later

---

## Implementation Order

1. **Polyhedron** — standalone, no dependencies, reuses existing sewing code
2. **Multi-section sweep** — extends existing sweep, self-contained
3. **Guide curve sweep** — shares infrastructure with #2
4. **Face naming** — standalone, hooks into existing origin system
5. **Assembly mates** — depends on external solver, highest risk

## Testing Strategy

Each feature gets its own `tests/fn-*.test.ts` file following existing patterns:

- Happy path with volume/geometry verification
- Error cases (invalid inputs, null shapes)
- Integration with existing operations (e.g., tagged faces surviving booleans)
