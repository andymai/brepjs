/**
 * Session worker: a forked child that builds one model and holds it (kernel shapes, meshes, the
 * imported IFC) for the MCP server. Requests and replies cross the IPC channel; stdout is unused,
 * so user code that logs can't corrupt anything.
 */

import { buildFamilies, type WorkerBuild } from './buildFamilies.js';
import { buildIfc } from './buildIfc.js';
import type { WorkerMessage, WorkerRequest } from './protocol.js';
import { evalInBuild } from './evalCode.js';
import { errorMessage } from './records.js';
import { encodePreviewPayload } from 'brepjs-viewer';
import { rasterizeSvg, renderPayload } from './render.js';
import { drawElements, type DrawnElement } from './drawing.js';
import { drawingSvg, dxfEntities, svgSize } from './drawingFormats.js';
import { measureSpace } from './spaces.js';
import type { DrawingArgs, DrawingOutcome } from './protocol.js';

// Programs load through a transpiling hook that emits inline source maps; with them on, stack
// traces (build errors, and the element source locations brepjs-families records) name the
// author's own lines.
process.setSourceMapsEnabled(true);

let current: WorkerBuild | undefined;

function categoriesOf(build: WorkerBuild): Map<string, string> {
  return new Map(
    build.outcome.ok ? build.outcome.summary.elements.map((r) => [r.id, r.category]) : []
  );
}

async function drawing(build: WorkerBuild, args: DrawingArgs): Promise<DrawingOutcome> {
  const geometry = build.geometry?.();
  if (geometry === undefined) throw new Error('this worker holds no build to draw');
  const categories = categoriesOf(build);
  const elements: DrawnElement[] = [];
  const missing: { id: string; reason: string }[] = [];
  for (const id of args.ids) {
    const shapes = geometry.shapes.get(id);
    if (shapes) elements.push({ id, category: categories.get(id) ?? 'other', shapes });
    else missing.push({ id, reason: 'no solid to cut: its geometry is only a mesh' });
  }
  const drawn = drawElements(geometry.brep, elements, args.spec);
  const svg = drawingSvg(drawn, args.title);
  const layers: Record<string, number> = {};
  for (const p of drawn.polylines) layers[p.layer] = (layers[p.layer] ?? 0) + 1;
  const { width, height } = svgSize(drawn.bounds);
  let png: { png: Uint8Array } | { pngError: string } | Record<string, never> = {};
  if (args.png) {
    try {
      png = { png: await rasterizeSvg(svg, width, height) };
    } catch (e) {
      png = { pngError: errorMessage(e) };
    }
  }
  return {
    svg,
    ...(args.dxf ? { dxf: geometry.brep.exportDXF(dxfEntities(drawn)) } : {}),
    ...png,
    ...(drawn.bounds ? { bounds: drawn.bounds } : {}),
    layers,
    cut: drawn.cut,
    beyond: drawn.beyond,
    skipped: [...missing, ...drawn.skipped],
  };
}

function send(msg: WorkerMessage): void {
  process.send?.(msg);
}

async function handle(req: WorkerRequest): Promise<void> {
  try {
    switch (req.op) {
      case 'build': {
        if (current !== undefined) throw new Error('this worker already holds a build');
        const { kind, path, typecheck } = req.args;
        const build =
          kind === 'ifc' ? await buildIfc(path) : await buildFamilies(path, { typecheck });
        if (build.outcome.ok) current = build;
        else build.dispose();
        send({ type: 'reply', id: req.id, result: build.outcome });
        return;
      }
      case 'render': {
        const payload = current?.payload?.();
        if (payload === undefined) throw new Error('this worker holds no build to render');
        const { pngs, cameras } = await renderPayload(payload, req.args);
        const drawable = payload.elements.map((e) => e.keyPath);
        send({ type: 'reply', id: req.id, result: { pngs, cameras, drawable } });
        return;
      }
      case 'eval': {
        const ctx = current?.evalContext?.();
        if (ctx === undefined) throw new Error('this worker holds no build to run code against');
        send({ type: 'reply', id: req.id, result: await evalInBuild(ctx, req.args.code) });
        return;
      }
      case 'drawing': {
        if (current === undefined) throw new Error('this worker holds no build to draw');
        send({ type: 'reply', id: req.id, result: await drawing(current, req.args) });
        return;
      }
      case 'spaces': {
        const geometry = current?.geometry?.();
        if (geometry === undefined) throw new Error('this worker holds no build to measure');
        const result = req.args.ids.map((id) =>
          measureSpace(geometry.brep, id, geometry.shapes.get(id) ?? [])
        );
        send({ type: 'reply', id: req.id, result });
        return;
      }
      case 'payload': {
        const payload = current?.payload?.();
        if (payload === undefined) throw new Error('this worker holds no build to show');
        send({ type: 'reply', id: req.id, result: new Uint8Array(encodePreviewPayload(payload)) });
        return;
      }
      case 'cobie': {
        if (current?.cobie === undefined) {
          throw new Error('COBie needs a families build; an imported IFC file has no BIM model');
        }
        send({ type: 'reply', id: req.id, result: await current.cobie(req.args) });
        return;
      }
      case 'validate': {
        if (current?.validate === undefined)
          throw new Error('this worker holds no build to validate');
        send({ type: 'reply', id: req.id, result: await current.validate(req.args.checks) });
        return;
      }
      case 'quantities': {
        if (current?.quantities === undefined)
          throw new Error('this build has no quantities to derive');
        send({ type: 'reply', id: req.id, result: await current.quantities() });
        return;
      }
      case 'exportIfc': {
        if (current?.exportIfc === undefined)
          throw new Error('this session cannot be exported to IFC');
        send({ type: 'reply', id: req.id, result: await current.exportIfc(req.args) });
        return;
      }
    }
  } catch (e) {
    send({ type: 'reply', id: req.id, error: errorMessage(e) });
  }
}

if (process.send === undefined) {
  console.error('the session worker must be started by brep-mcp over an IPC channel');
  process.exit(1);
}

process.on('message', (msg: WorkerRequest) => void handle(msg));
// The server owns this process; when it goes away, so does the model.
process.on('disconnect', () => process.exit(0));
send({ type: 'ready' });
