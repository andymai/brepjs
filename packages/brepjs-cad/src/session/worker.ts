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
import { renderPayload } from './render.js';

// Programs load through a transpiling hook that emits inline source maps; with them on, stack
// traces (build errors, and the element source locations brepjs-families records) name the
// author's own lines.
process.setSourceMapsEnabled(true);

let current: WorkerBuild | undefined;

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
        const pngs = await renderPayload(payload, req.args);
        const drawable = payload.elements.map((e) => e.keyPath);
        send({ type: 'reply', id: req.id, result: { pngs, drawable } });
        return;
      }
      case 'eval': {
        const ctx = current?.evalContext?.();
        if (ctx === undefined) throw new Error('this worker holds no build to run code against');
        send({ type: 'reply', id: req.id, result: await evalInBuild(ctx, req.args.code) });
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
