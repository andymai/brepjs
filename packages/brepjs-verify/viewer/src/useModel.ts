import { useEffect, useState } from 'react';
import type { MeshData } from 'brepjs-viewer';
import type { FromWorker, LoadRequest } from './kernelWorker.js';

export interface ModelParams {
  dir: string | null;
  file: string;
}
export function parseModelParams(search: string): ModelParams | null {
  const p = new URLSearchParams(search);
  const file = p.get('file');
  return file ? { dir: p.get('dir'), file } : null;
}
export function extOf(file: string): string {
  const d = file.lastIndexOf('.');
  return d === -1 ? '' : file.slice(d).toLowerCase();
}

export type ModelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: MeshData }
  | { status: 'error'; error: string };

export function useModel(): ModelState {
  const [state, setState] = useState<ModelState>({ status: 'idle' });
  useEffect(() => {
    const params = parseModelParams(window.location.search);
    if (!params) {
      setState({ status: 'error', error: 'missing ?file= parameter' });
      return;
    }
    // Guard ?dir= BEFORE spawning the worker — D1 400s without it, and an early return
    // after worker creation would orphan the worker (the bare return replaces the cleanup).
    if (!params.dir) {
      setState({ status: 'error', error: 'missing ?dir= parameter' });
      return;
    }
    setState({ status: 'loading' });
    const worker = new Worker(new URL('./kernelWorker.js', import.meta.url), { type: 'module' });
    let cancelled = false;
    worker.addEventListener('message', (e: MessageEvent<FromWorker>) => {
      if (cancelled) return;
      if (e.data.type === 'loaded') setState({ status: 'ready', data: e.data.meshData });
      else setState({ status: 'error', error: e.data.error });
    });
    // Fetch via the Phase D static server's model route: /__model/<rel>?dir=<abs>.
    // A bare `models/<file>` would miss that route, hit the SPA fallback, and return
    // index.html with HTTP 200 — HTML masquerading as STEP, which never loads.
    const rel = params.file.split('/').map(encodeURIComponent).join('/');
    const url = `/__model/${rel}?dir=${encodeURIComponent(params.dir)}`;
    void fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`fetch ${params.file}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((bytes) => {
        const msg: LoadRequest = { type: 'load', bytes, ext: extOf(params.file) };
        worker.postMessage(msg, [bytes]);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, []);
  return state;
}
