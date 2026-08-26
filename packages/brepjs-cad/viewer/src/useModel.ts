import { useEffect, useState } from 'react';
import { decodePreviewPayload } from 'brepjs-viewer';
import type { ElementRange, MeshData, PreviewTreeNode } from 'brepjs-viewer';
import type { FromWorker, LoadRequest } from './kernelWorker.js';
import type { ModelMeasurements } from './loaders.js';

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

/** Element identity riding on a preview payload (brep preview). */
export interface PreviewInfo {
  elements: readonly ElementRange[];
  failed: readonly string[];
  tree: PreviewTreeNode | null;
}

export type ModelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: MeshData; measurements: ModelMeasurements; preview?: PreviewInfo }
  | { status: 'error'; error: string };

export interface UseModelOptions {
  /** Collect per-face metadata so faces are clickable (skipped for headless snapshots). */
  inspect?: boolean;
}
export function useModel({ inspect = false }: UseModelOptions = {}): ModelState {
  const [state, setState] = useState<ModelState>({ status: 'idle' });
  useEffect(() => {
    // Preview mode (`brep preview`): the payload is server-evaluated — fetch it and
    // re-fetch on each SSE ping. No kernel worker, no ?dir=/?file= routes involved.
    if (new URLSearchParams(window.location.search).has('preview')) {
      setState({ status: 'loading' });
      let cancelled = false;
      const load = async (): Promise<void> => {
        try {
          const r = await fetch('/__preview/model');
          if (!r.ok) throw new Error(`fetch preview model: ${r.status}`);
          const payload = decodePreviewPayload(await r.arrayBuffer());
          if (cancelled) return;
          setState({
            status: 'ready',
            data: payload.data,
            measurements: { valid: payload.failed.length === 0 },
            preview: {
              elements: payload.elements,
              failed: payload.failed,
              tree: payload.tree,
            },
          });
        } catch (err) {
          if (!cancelled)
            setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      };
      void load();
      const events = new EventSource('/__preview/events');
      events.onmessage = () => void load();
      return () => {
        cancelled = true;
        events.close();
      };
    }
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
      if (e.data.type === 'loaded')
        setState({ status: 'ready', data: e.data.meshData, measurements: e.data.measurements });
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
        const msg: LoadRequest = { type: 'load', bytes, ext: extOf(params.file), inspect };
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
  }, [inspect]);
  return state;
}
