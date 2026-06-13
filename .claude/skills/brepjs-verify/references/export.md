# Export

STEP is the canonical, lossless output, the source of truth. Mesh formats (STL/3MF/GLB) are **derived sidecars** for preview/printing, never the authoritative artifact.

| Function     | Signature                                     | Role              |
| ------------ | --------------------------------------------- | ----------------- |
| `exportSTEP` | `exportSTEP(shape)` → `Result<Blob>`          | primary (B-rep)   |
| `exportSTL`  | `exportSTL(shape, options?)` → `Result<Blob>` | mesh sidecar      |
| `exportIGES` | `exportIGES(shape)` → `Result<Blob>`          | B-rep interchange |

GLB/3MF sidecars are emitted by the verify CLI (`--glb`), not authored in the model.

```ts
import { box } from 'brepjs';
export default () => box(10, 10, 10, { centered: true });
```

```sh
npx -y brepjs-verify model.brep.ts --step out/model.step --glb out/model.glb
```

## Pitfalls

- Prefer STEP downstream; meshes lose exact surfaces and are tessellation-dependent.
- All exporters return `Result<Blob>`; check for `Err` before writing.

See also: docs/function-lookup.md → brepjs/io.
