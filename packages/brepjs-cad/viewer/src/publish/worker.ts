import {
  createPartRunner,
  PartError,
  type BrepjsForPart,
  type PartModule,
  type PartRunner,
} from './partRunner.js';
import type { FromWorker, ToWorker } from './protocol.js';

interface Kernel extends BrepjsForPart {
  setFallbackFont?: (font: ArrayBuffer) => void;
  registerKernel: (id: string, adapter: unknown) => void;
  OcctWasmAdapter: new (m: unknown, k: unknown) => unknown;
}
interface OcctWasmModule {
  OcctKernel: new () => unknown;
}

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

// The page, the part and this worker load brepjs from one URL, so the part runs on the kernel
// that this worker registers. A bundled copy here would be a second instance with no kernel.
async function boot(base: string, entry: string): Promise<PartRunner> {
  const wasmJs = await fetch(`${base}wasm/occt-wasm.js`);
  if (!wasmJs.ok) throw new Error(`failed to load occt-wasm.js: ${wasmJs.status}`);
  const blobUrl = URL.createObjectURL(
    new Blob([await wasmJs.text()], { type: 'application/javascript' })
  );
  const wasm = (await import(/* @vite-ignore */ blobUrl)) as {
    default: (o: unknown) => Promise<OcctWasmModule>;
  };
  URL.revokeObjectURL(blobUrl);
  const Module = await wasm.default({
    locateFile: (p: string) => (p.endsWith('.wasm') ? `${base}wasm/occt-wasm.wasm` : p),
  });
  const brep = (await import(/* @vite-ignore */ `${base}brepjs.js`)) as unknown as Kernel;
  brep.registerKernel('occt-wasm', new brep.OcctWasmAdapter(Module, new Module.OcctKernel()));
  // `brep verify` installs this font as the fallback, so a part can draw text with no font of
  // its own. Without it here, such a part would verify and then fail on the page.
  const font = await fetch(`${base}fonts/Inter-Bold.ttf`);
  if (font.ok) brep.setFallbackFont?.(await font.arrayBuffer());
  const mod = (await import(/* @vite-ignore */ `${base}${entry}`)) as PartModule;
  return createPartRunner(brep, mod);
}

let runner: Promise<PartRunner> | null = null;
// Slider moves arrive faster than builds finish. The listener records the newest request on
// arrival, and a queued build that is no longer the newest is dropped with no reply.
let latestBuild = 0;

async function handle(msg: ToWorker): Promise<void> {
  if (msg.type === 'init') {
    runner = boot(msg.base, msg.entry);
    try {
      const { defs, presets } = await runner;
      post({ type: 'ready', defs, presets });
    } catch (e) {
      post({ type: 'fatal', message: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  if (runner === null) return;
  const part = await runner;
  if (msg.type === 'build') {
    if (msg.id !== latestBuild) return;
    try {
      const built = await part.build(msg.input);
      // No transfer list: brepjs caches the mesh of a shape, and a transfer would empty the
      // cached arrays that a later 3MF export reads.
      post({ type: 'built', id: msg.id, ...built });
    } catch (e) {
      const code = e instanceof PartError ? e.code : undefined;
      const message = e instanceof Error ? e.message : String(e);
      post({ type: 'failed', id: msg.id, message, ...(code ? { code } : {}) });
    }
    return;
  }
  try {
    const out = await part.export(msg.format, msg.name);
    post({ type: 'exported', id: msg.id, ...out }, [out.bytes]);
  } catch (e) {
    post({
      type: 'export-failed',
      id: msg.id,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

// Messages run one at a time: a build must finish before an export reads its shape.
let chain: Promise<void> = Promise.resolve();
self.addEventListener('message', (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'build') latestBuild = msg.id;
  chain = chain.then(() => handle(msg));
});
