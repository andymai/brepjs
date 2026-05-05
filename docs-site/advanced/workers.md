---
title: Web Workers
---

# Web Workers

Long brepjs operations should not run on the main thread. A 200 ms boolean dropping a frame is an annoyance; a 2-second STEP import freezing the UI is a regression report. brepjs ships first-class worker support: `brepjs/worker` exposes a typed RPC interface that posts shape descriptions to a worker, runs operations there, and returns mesh data. The main thread renders; the worker computes.

## Why a worker

JavaScript is single-threaded. Every `await` in the main thread is a yield to the event loop, which is fine for IO-bound work — but brepjs operations are CPU-bound. Even with `await`, a heavy boolean blocks paint and input handling.

A worker isolates the kernel: it has its own JS context, its own WASM heap, its own brepjs instance. Crashes in the worker (e.g. an OOM from a runaway operation) kill only the worker, not the page. You restart the worker; the page stays responsive.

## The two ways to use a worker

### Option 1: brepjs/worker — typed RPC

For apps that build a part on the worker and just need the resulting mesh:

<!-- @no-test -->

```typescript
import { createWorkerClient, type WorkerCommand } from 'brepjs/worker';

const client = createWorkerClient(new Worker(new URL('./brepjsWorker.js', import.meta.url)));

await client.init();

const command: WorkerCommand = {
  op: 'buildPart',
  args: { width: 30, depth: 20, height: 10 },
};

const { mesh } = await client.run(command);
// mesh is { position, normal, index } typed arrays — ready for Three.js
```

`createWorkerClient` returns a typed object with `init()` and `run()` methods. Behind the scenes it serializes commands as messages, posts them, and resolves promises when the worker replies.

The worker side imports the same protocol:

<!-- @no-test -->

```typescript
// brepjsWorker.js
import { createWorkerServer } from 'brepjs/worker';
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

createWorkerServer({
  buildPart: ({ width, depth, height }) => {
    const part = box(width, depth, height);
    const m = shape(part).mesh({ tolerance: 0.1 });
    return { mesh: toBufferGeometryData(m) };
  },
});
```

`createWorkerServer` registers the command handlers, sets up the message protocol, and you write the actual operation as a normal function.

### Option 2: roll-your-own with raw `postMessage`

For more control (custom transferable types, structured cloning of nested shapes, integration with existing message protocols):

<!-- @no-test -->

```typescript
// main.ts
const worker = new Worker(new URL('./customWorker.js', import.meta.url));
worker.postMessage({ kind: 'build', width: 30, depth: 20 });
worker.onmessage = (e) => {
  if (e.data.kind === 'mesh') {
    renderMesh(e.data.position, e.data.normal, e.data.index);
  }
};

declare function renderMesh(p: Float32Array, n: Float32Array, i: Uint32Array): void;
```

<!-- @no-test -->

```typescript
// customWorker.js
import { box, shape, toBufferGeometryData } from 'brepjs/quick';

self.onmessage = (e: MessageEvent) => {
  if (e.data.kind === 'build') {
    const part = box(e.data.width, e.data.depth, 10);
    const m = shape(part).mesh({ tolerance: 0.1 });
    const geo = toBufferGeometryData(m);
    self.postMessage(
      {
        kind: 'mesh',
        position: geo.position,
        normal: geo.normal,
        index: geo.index,
      },
      [geo.position.buffer, geo.normal.buffer, geo.index.buffer]
    ); // transferables
  }
};
```

The `transfer` argument hands the underlying ArrayBuffers to the main thread without copying — much faster than structured-cloning megabytes of triangle data.

## Initialization in the worker

The worker has to init brepjs just like the main thread. `brepjs/quick` works inside a worker:

<!-- @no-test -->

```typescript
// worker.js
import { box } from 'brepjs/quick';

// brepjs/quick auto-initializes via top-level await — works in workers too.
self.onmessage = (e) => {
  if (e.data.kind === 'build') {
    self.postMessage({ kind: 'volume', value: box(10, 10, 10) });
  }
};
```

For environments without top-level await:

<!-- @no-test -->

```typescript
import opencascade from 'brepjs-opencascade';
import { initFromOC, box } from 'brepjs';

let ready: Promise<void> | null = null;

async function ensureReady() {
  if (!ready) {
    ready = (async () => {
      const oc = await opencascade();
      initFromOC(oc);
    })();
  }
  return ready;
}

self.onmessage = async (e) => {
  await ensureReady();
  if (e.data.kind === 'build') {
    self.postMessage({ kind: 'volume', value: box(10, 10, 10) });
  }
};
```

The `ensureReady` pattern handles concurrent first-message races: every message awaits the same singleton promise.

## Vite + workers

Vite's worker support uses the `?url` and `?worker` suffixes:

<!-- @no-test -->

```typescript
import BrepWorker from './brepWorker.ts?worker';

const worker = new BrepWorker();
```

For the WASM file inside the worker, gridfinitylayouttool.com uses:

<!-- @no-test -->

```typescript
// brepWorker.ts
import singleWasm from 'brepjs-opencascade/src/brepjs_single.wasm?url';
// ...use singleWasm to load via the OpenCascade JS init
```

The `?url` suffix tells Vite "emit this WASM as an asset and give me a URL to it" — so your worker can fetch it without bundling the binary into the worker JS.

## Transferable types

Worker boundaries copy data by default. For mesh data, that's expensive. Use `Transferable`s — typed arrays whose underlying buffers move from worker to main thread without a copy:

<!-- @no-test -->

```typescript
self.postMessage({ position, normal, index }, [position.buffer, normal.buffer, index.buffer]);
```

After transferring, the worker's view of those arrays is detached — they can no longer be read from the worker side. This is what you want: the data has moved, not been duplicated.

The brepjs `toBufferGeometryData` returns plain `Float32Array` and `Uint32Array` (with backing `ArrayBuffer`), so they're directly transferable.

## Disposing in the worker

Memory management still applies inside a worker — the WASM heap there grows just like in the main thread. Use the same patterns:

<!-- @no-test -->

```typescript
import { withScope, box, sphere, fuse, shape, toBufferGeometryData, unwrap } from 'brepjs/quick';

self.onmessage = (e) => {
  if (e.data.kind === 'build') {
    const result = withScope((scope) => {
      const a = scope.track(box(10, 10, 10));
      const b = scope.track(sphere(5));
      const fused = scope.track(unwrap(fuse(a, b)));
      const m = scope.track(shape(fused).mesh({ tolerance: 0.1 }));
      return toBufferGeometryData(m); // primitives — safe to return
    });
    self.postMessage(result, [result.position.buffer, result.normal.buffer, result.index.buffer]);
  }
};
```

`withScope` disposes everything inside the scope — by the time the postMessage returns, only the buffer-data references the worker still holds, and those move to the main thread.

## Restarting the worker on failure

A bug in your code that runs out of memory takes the worker down with `terminate()`. Catch failure on the main thread, log, restart:

<!-- @no-test -->

```typescript
declare function createBrepWorker(): { terminate: () => void; init: () => Promise<void> };
let client = createBrepWorker();

async function runWithRestart<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    console.warn('Worker crashed, restarting:', e);
    client.terminate();
    client = createBrepWorker();
    await client.init();
    return op(); // retry once
  }
}
```

A worker-aware app survives kernel hiccups without becoming unusable.

## When you don't need a worker

- One-shot scripts that just produce a STEP file.
- Static-site generators where the output is built at compile time.
- Server-side Node CLIs.
- Apps where every operation completes in < 16 ms — main thread is fine.

For an interactive web app with any boolean over 50 ms, workers pay for themselves quickly.

## Next steps

- [Performance](./performance) — what's expensive enough to worth moving to a worker
- [Memory Management](./memory) — leaks in a worker still leak (just elsewhere)
- [Three.js Integration](../integration/threejs) — receiving mesh data from a worker and rendering
