# OpenSCAD Parity Batch 2 — Design

Closes remaining gaps between brepjs and OpenSCAD (excluding niche formats OFF/AMF/WRL/PDF/POV).

## 1. `fill(face)` — Remove holes from 2D shapes

**File:** `src/topology/surfaceBuilders.ts`

```ts
export function fill(face: Face): Result<Face>;
```

Extracts outer wire from a Face with holes, creates new Face from just the outer wire. ~10 lines.

## 2. `sectionToFace()` — Section as filled 2D

**File:** `src/topology/booleanFns.ts`

```ts
export function sectionToFace(
  shape: AnyShape,
  plane: PlaneInput,
  options?: { approximation?: boolean; planeSize?: number }
): Result<Face>;
```

Calls existing `section()`, collects wires, builds faces via `makeFace`. ~20 lines.

## 3. OBJ Import

**File:** `src/io/objImportFns.ts`

```ts
export async function importOBJ(blob: Blob): Promise<Result<AnyShape>>;
```

Parses `v`/`f` lines, supports triangles + quads (split to tris). Builds solid via `BRepBuilderAPI_Sewing` + `BRepBuilderAPI_MakeSolid`. Geometry-only (no materials/UVs). ~100-150 lines.

## 4. 3MF Import

**File:** `src/io/threemfImportFns.ts`

```ts
export async function importThreeMF(blob: Blob): Promise<Result<AnyShape>>;
```

Unzips (reverse of export's hand-rolled ZIP), parses XML for `<vertex>`/`<triangle>` elements, sews into solid. ~150-200 lines.

## 5. `textMetrics()` / `fontMetrics()`

**File:** `src/text/textBlueprints.ts`

```ts
export function textMetrics(
  text: string,
  options?: { fontSize?: number; fontFamily?: string }
): { width: number; height: number; ascender: number; descender: number };

export function fontMetrics(options?: { fontSize?: number; fontFamily?: string }): {
  ascender: number;
  descender: number;
  unitsPerEm: number;
  lineHeight: number;
};
```

Leverages opentype.js Font object already loaded by `loadFont()`. ~30 lines.

## 6. `roof()` — Straight Skeleton Extrusion

**Files:** `src/operations/roofFns.ts`, `src/operations/straightSkeleton.ts`

```ts
export function roof(wire: Wire, options?: { angle?: number }): Result<AnyShape>;
```

Pure TypeScript straight skeleton algorithm for simple polygons. Handles edge events and split events. Default angle 45°. Skeleton faces built as OCCT faces via sewing. ~300-400 lines for algorithm + ~50 lines for OCCT integration.

## 7. `surfaceFromImage()` — Heightmap from image

**File:** `src/topology/surfaceFns.ts`

```ts
export async function surfaceFromImage(
  blob: Blob,
  options?: {
    width?: number;
    depth?: number;
    scaleZ?: number;
    channel?: 'r' | 'g' | 'b' | 'luminance';
  }
): Promise<Result<AnyShape>>;
```

Decodes image via `createImageBitmap` + `OffscreenCanvas`, reads pixel data into height array, delegates to `surfaceFromGrid()`. ~50-60 lines.
