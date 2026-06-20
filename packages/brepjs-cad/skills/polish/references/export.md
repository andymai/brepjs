# Export

STEP is the canonical, lossless output, the source of truth. Mesh formats (STL/3MF/GLB) are **derived sidecars** for preview/printing, never the authoritative artifact.

| Function     | Signature                                     | Role              |
| ------------ | --------------------------------------------- | ----------------- |
| `exportSTEP` | `exportSTEP(shape)` → `Result<Blob>`          | primary (B-rep)   |
| `exportSTL`  | `exportSTL(shape, options?)` → `Result<Blob>` | mesh sidecar      |
| `exportIGES` | `exportIGES(shape)` → `Result<Blob>`          | B-rep interchange |

GLB/3MF sidecars are emitted by the verify CLI (`--glb`), not authored in the model.

The GLB sidecar is **Y-up** (glTF's required convention) via a root-node rotation, so it opens upright in three.js, model-viewer, Blender, etc. Vertices remain Z-up, matching the STEP/STL. To paint the GLB, a part may `export const materials` (a per-face `MaterialFn`, or one `GltfMaterial` for the whole part); see `references/booleans.md` → "Coloring an assembly".

## Importing + modifying

`importSTEP(blob)` is **async** and takes a **`Blob`** (not a path or `ArrayBuffer`): `importSTEP(blob): Promise<Result<AnyShape>>`. Read the file bytes yourself, wrap them, and `await`, so the part's default export must be `async`. The result is an `AnyShape`; narrow it before a 3D op like `fillet` (which needs a `ValidSolid`).

```ts
import { readFile } from 'node:fs/promises';
import { importSTEP, fillet, getEdges, isSolid, validSolid, unwrap, isOk } from 'brepjs';

export default async () => {
  const bytes = await readFile('input.step');
  const imported = unwrap(await importSTEP(new Blob([bytes])));
  if (!isSolid(imported)) throw new Error('expected a solid from the STEP file');
  const valid = validSolid(imported); // Result<ValidSolid, string>: use isOk/unwrap, NOT .valid
  if (!isOk(valid)) throw new Error(valid.error);
  return unwrap(fillet(valid.value, getEdges(valid.value), 2));
};
```

```ts
import { box } from 'brepjs';
export default () => box(10, 10, 10, { centered: true });
```

```sh
npx -y -p brepjs-cad brep model.brep.ts --step out/model.step --glb out/model.glb
```

## Pitfalls

- Prefer STEP downstream; meshes lose exact surfaces and are tessellation-dependent.
- All exporters return `Result<Blob>`; check for `Err` before writing.

See also: docs/function-lookup.md → brepjs/io.
