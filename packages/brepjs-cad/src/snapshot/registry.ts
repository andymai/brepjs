import { startStaticServer, SERVER_API_VERSION, type ServerDescriptor, type StaticServer } from './static.js';
const DEFAULT_PORT = 7373;
const PROBE_SPAN = 8;
export const DEFAULT_SHUTDOWN_AFTER_MS = 12 * 60 * 60 * 1000;
export interface AcquireOptions {
  port?: number;
  shutdownAfterMs?: number;
  // Skip reuse and bind a private OS-assigned ephemeral port. Parallel workers (heal fan-out,
  // orchestrator subagents) each get an isolated server instead of contending on the shared :7373,
  // which is what made concurrent snapshots flaky.
  fresh?: boolean;
}
export interface AcquiredServer {
  port: number;
  url: string;
  reused: boolean;
  close(): Promise<void>;
}

async function probe(port: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 400);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/__cad/server`, { signal: ctrl.signal });
    if (!res.ok) return false;
    const d = (await res.json()) as Partial<ServerDescriptor>;
    return (
      d.app === 'brepjs-viewer' &&
      d.dynamicRoot === true &&
      typeof d.serverApiVersion === 'number' &&
      d.serverApiVersion >= SERVER_API_VERSION
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
export async function acquireServer(opts: AcquireOptions = {}): Promise<AcquiredServer> {
  // Isolated mode: a private ephemeral server (no probe, no reuse) so N parallel renders don't
  // share — or race to start — one server. `port: 0` lets the OS hand out a free port.
  if (opts.fresh) {
    const fresh = await startStaticServer({ port: 0 });
    const timer = setTimeout(() => void fresh.close(), opts.shutdownAfterMs ?? DEFAULT_SHUTDOWN_AFTER_MS);
    timer.unref();
    return {
      port: fresh.port,
      url: fresh.url,
      reused: false,
      close: async () => {
        clearTimeout(timer);
        await fresh.close();
      },
    };
  }
  const ports =
    opts.port !== undefined ? [opts.port] : Array.from({ length: PROBE_SPAN }, (_, i) => DEFAULT_PORT + i);
  for (const port of ports)
    if (await probe(port)) return { port, url: `http://127.0.0.1:${port}`, reused: true, close: () => Promise.resolve() };
  let server: StaticServer | undefined;
  for (const port of ports) {
    try {
      server = await startStaticServer({ port });
      break;
    } catch {
      /* busy/raced — next */
    }
  }
  if (!server) throw new Error(`no free port in ${ports[0]}..${ports.at(-1)}`);
  const timer = setTimeout(() => void server?.close(), opts.shutdownAfterMs ?? DEFAULT_SHUTDOWN_AFTER_MS);
  timer.unref();
  const started = server;
  return {
    port: started.port,
    url: started.url,
    reused: false,
    close: async () => {
      clearTimeout(timer);
      await started.close();
    },
  };
}
