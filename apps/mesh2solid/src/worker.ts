/// <reference lib="webworker" />
import {
  OcctWasmAdapter,
  exportSTEP,
  mesh,
  meshEdges,
  registerKernel,
  toBufferGeometryData,
  toLineGeometryData,
} from 'brepjs';
import { inspectMesh, loadMeshEngine, meshToSolid } from 'brepjs-mesh2solid';
import engineWasm from 'brepjs-mesh2solid/index_bg.wasm?url';
import { OcctKernel } from 'occt-wasm';
import createModule from 'occt-wasm/dist/occt-wasm.js';
import occtWasm from 'occt-wasm/dist/occt-wasm.wasm?url';
import type { Conversion, FromWorker, ToWorker } from './protocol.js';

declare const self: DedicatedWorkerGlobalScope;

// The mesh engine is small and all inspection needs; the OCCT kernel is large,
// so it starts loading at once but only a conversion waits for it.
const engineReady = loadMeshEngine(engineWasm);
const kernelReady = (async () => {
  const kernel = await OcctKernel.init({ createModule, wasm: occtWasm });
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
})();
// Surfaced by the first message that needs it; no unhandled rejection meanwhile.
kernelReady.catch(() => undefined);

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  self.postMessage(msg, transfer);
}

async function convert(
  bytes: ArrayBuffer,
  name: string,
  units: Conversion['report']['units']['unit']
) {
  const res = await meshToSolid(bytes, { fileName: name, units, heatmap: true });
  if (!res.ok) throw new Error(res.error.message);
  using shape = res.value.shape;
  const faces = toBufferGeometryData(mesh(shape));
  const edges = toLineGeometryData(meshEdges(shape));
  const step = exportSTEP(shape);
  const map = res.value.heatmap;
  const result: Conversion = {
    part: {
      position: Float32Array.from(faces.position),
      normal: Float32Array.from(faces.normal),
      index: Uint32Array.from(faces.index),
      edges: Float32Array.from(edges.position),
    },
    heatmap:
      map === undefined
        ? null
        : {
            position: Float32Array.from(map.positions),
            index: Uint32Array.from(map.indices),
            deviation: Float32Array.from(map.deviation),
          },
    step: step.ok ? await step.value.arrayBuffer() : null,
    code: res.value.code ?? null,
    solid: res.value.solid,
    report: res.value.report,
  };
  return result;
}

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  try {
    await engineReady;
    if (msg.type === 'inspect') {
      const info = await inspectMesh(msg.bytes, { fileName: msg.name });
      if (!info.ok) throw new Error(info.error.message);
      post({ id: msg.id, type: 'inspected', info: info.value });
      return;
    }
    await kernelReady;
    const result = await convert(msg.bytes, msg.name, msg.units);
    const { part, heatmap, step } = result;
    const transfer: Transferable[] = [
      part.position.buffer,
      part.normal.buffer,
      part.index.buffer,
      part.edges.buffer,
    ];
    if (heatmap !== null)
      transfer.push(heatmap.position.buffer, heatmap.index.buffer, heatmap.deviation.buffer);
    if (step !== null) transfer.push(step);
    post({ id: msg.id, type: 'converted', result }, transfer);
  } catch (e) {
    post({ id: msg.id, type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
