import { resolve, basename, dirname } from 'node:path';
import { acquireServer, type AcquireOptions } from './registry.js';

export interface ServeOptions extends AcquireOptions {
  file?: string;
}
export interface ServeHandle {
  port: number;
  url: string;
  reused: boolean;
  close(): Promise<void>;
}

function viewerUrl(base: string, file?: string): string {
  if (!file) return base;
  const abs = resolve(file);
  return `${base}/?dir=${encodeURIComponent(dirname(abs))}&file=${encodeURIComponent(basename(abs))}`;
}

/** Acquire (reuse or start) the persistent server and return its viewer URL. */
export async function serve(opts: ServeOptions = {}): Promise<ServeHandle> {
  const server = await acquireServer(opts); // acquireServer applies the default shutdown window
  const url = viewerUrl(server.url, opts.file);
  // Pure library: do NOT print here — the CLI is the sole stdout owner (prints `viewer: <url>`).
  if (!server.reused) {
    const onSig = () => void server.close().then(() => process.exit(0));
    process.once('SIGINT', onSig);
    process.once('SIGTERM', onSig);
  }
  return { port: server.port, url, reused: server.reused, close: () => server.close() };
}
