/* v8 ignore file -- occt-wasm kernel not available in brepkit test suite */
/**
 * Adapter-construction shims for the occt-wasm adapter.
 *
 * - `wrapKernelExceptions` proxies every kernel method to convert raw
 *   `WebAssembly.Exception` failures into readable JS `Error`s.
 * - `buildOcShim` produces the `.oc` facade. Some legacy tests reach for
 *   `adapter.oc.TopoDS_Solid()` etc. expecting a brepjs-occt-style object
 *   factory; the shim returns null shapes for those constructors and a
 *   minimal `BRepBuilderAPI_MakeEdge_3` so those tests continue to pass.
 *
 * @module
 */

import type { KernelInstance } from '@/kernel/types.js';
import type { OcctKernelWasm, OcctWasmHandle, OcctWasmModule } from './occtWasmTypes.js';
import { handle } from './helpers.js';

export function wrapKernelExceptions(kernel: OcctKernelWasm, mod: OcctWasmModule): OcctKernelWasm {
  return new Proxy(kernel, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val !== 'function') return val;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proxy wraps all methods
      return function (this: unknown, ...args: any[]) {
        try {
          return val.apply(target, args);
        } catch (ex: unknown) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WebAssembly.Exception not in TS lib
          const WasmException = (WebAssembly as any).Exception as { new (): unknown } | undefined;
          if (WasmException && ex instanceof WasmException) {
            try {
              const [, msg] = mod.getExceptionMessage(ex);
              throw new Error(msg, { cause: ex });
            } catch (inner) {
              if (inner instanceof Error && !(inner instanceof WasmException)) throw inner;
            }
          }
          throw ex;
        }
      };
    },
  });
}

export function buildOcShim(module: OcctWasmModule, k: OcctKernelWasm): KernelInstance {
  // Tests do `new oc.TopoDS_Solid()`, so each entry must be a callable
  // constructor — arrow functions cannot satisfy `new`.
  const makeNullCtor = function (this: unknown) {
    return handle('compound', k.makeNullShape());
  };
  return Object.assign(Object.create(module), {
    TopoDS_Solid: makeNullCtor,
    TopoDS_Face: makeNullCtor,
    TopoDS_Shape: makeNullCtor,
    TopoDS_Wire: makeNullCtor,
    TopoDS_Edge: makeNullCtor,
    TopoDS_Vertex: makeNullCtor,
    TopoDS_Shell: makeNullCtor,
    TopoDS_Compound: makeNullCtor,

    gp_Pnt_3: function (x: number, y: number, z: number) {
      return handle('vertex', k.makeVertex(x, y, z));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shim for test compat
    BRepBuilderAPI_MakeEdge_3: function (p1: any, p2: any) {
      const v1 = p1 as OcctWasmHandle;
      const v2 = p2 as OcctWasmHandle;
      const pos1 = k.vertexPosition(v1.id);
      const pos2 = k.vertexPosition(v2.id);
      const edgeId = k.makeLineEdge(
        pos1.get(0),
        pos1.get(1),
        pos1.get(2),
        pos2.get(0),
        pos2.get(1),
        pos2.get(2)
      );
      pos1.delete();
      pos2.delete();
      return { Edge: () => handle('edge', edgeId), delete() {} };
    },
  });
}
