# brepjs Project Memory

## WASM Build (OpenCascade)

- Adding new OCCT classes requires updating: `build-source/defaults.yml` (template), all 3 `build-config/*.yml` (generated), and `src/brepjs_single.d.ts`
- Build command: `cd packages/brepjs-opencascade/build-config && docker run --rm -v $(pwd):/src -u $(id -u):$(id -g) donalffons/opencascade.js custom_build_single.yml && mv brepjs_single* ../src/`
- The build generates `.js`, `.wasm`, and `.d.ts` — use the generated `.d.ts` (it auto-includes new symbols)
- `ytt` is not installed in distrobox; edit `build-config/` files directly alongside `build-source/`
- Docker is accessible from distrobox
- Diagnostic `strtoll_l` errors during build are expected emscripten warnings, not real errors

## OCCT Constructor Overloads

- Overload numbering varies per class — always check `brepjs_single.d.ts`
- `BRepPrimAPI_MakeCylinder_3`: `(Axes: gp_Ax2, R, H)`
- `BRepPrimAPI_MakeCone_3`: `(Axes: gp_Ax2, R1, R2, H)`
- `BRepPrimAPI_MakeTorus_5`: `(Axes: gp_Ax2, R1, R2)` — NOT `_3` (which is `(R1, R2, angle1, angle2)`)
- `BRepPrimAPI_MakeSphere_2`: `(Center: gp_Pnt, R)`

## Patterns

- Kernel layer (L0): raw OCCT ops in `constructorOps.ts`, interface in `types.ts`, adapter in `occtAdapter.ts`
- Topology layer (L2): high-level wrappers in `shapeHelpers.ts` using `getKernel().oc` + `localGC()`
- Exports: `topology/index.ts` barrel → `src/index.ts` public API
