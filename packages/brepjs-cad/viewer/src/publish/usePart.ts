import { useCallback, useEffect, useRef, useState } from 'react';
import type { MeshData } from 'brepjs-viewer';
import type { ModelMeasurements } from '../loaders.js';
import type {
  ExportFormat,
  FromWorker,
  ParamDefs,
  ParamInput,
  ParamValue,
  Presets,
  ToWorker,
} from './protocol.js';
import { defaultsOf, readInput, writeSearch } from './urlState.js';

export interface PartManifest {
  name: string;
  title: string;
  entry: string;
  sources: { path: string; text: string }[];
  generator: { name: string; version: string };
}

export interface PartModel {
  data: MeshData;
  measurements: ModelMeasurements;
}

export interface PartState {
  status: 'loading' | 'ready' | 'fatal';
  fatal?: string;
  defs: ParamDefs;
  presets: Presets;
  /** What the controls show: the last values the visitor asked for. */
  input: ParamInput;
  /** The last part that built. It stays on screen while a new build runs or fails. */
  model: PartModel | null;
  building: boolean;
  /** Why the last build failed, or null. */
  error: string | null;
  exporting: ExportFormat | null;
}

const BUILD_DELAY_MS = 120;

function download(bytes: ArrayBuffer, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function usePart(manifest: PartManifest | null) {
  const [state, setState] = useState<PartState>({
    status: 'loading',
    defs: {},
    presets: {},
    input: {},
    model: null,
    building: false,
    error: null,
    exporting: null,
  });
  const worker = useRef<Worker | null>(null);
  const nextId = useRef(1);
  const latest = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const defsRef = useRef<ParamDefs>({});
  const presetsRef = useRef<Presets>({});
  const inputRef = useRef<ParamInput>({});

  const send = useCallback((msg: ToWorker) => worker.current?.postMessage(msg), []);

  const requestBuild = useCallback(
    (input: ParamInput, immediate = false) => {
      window.clearTimeout(timer.current);
      // Reserved now, not when the delay ends: a reply to an older build that lands during the
      // delay must not replace the values the visitor just set.
      const id = nextId.current++;
      latest.current = id;
      const run = () => {
        send({ type: 'build', id, input });
      };
      inputRef.current = input;
      setState((s) => ({ ...s, input, building: true }));
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${writeSearch(window.location.search, defsRef.current, input)}${window.location.hash}`
      );
      if (immediate) run();
      else timer.current = window.setTimeout(run, BUILD_DELAY_MS);
    },
    [send]
  );

  useEffect(() => {
    if (manifest === null) return;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.addEventListener('message', (e: MessageEvent<FromWorker>) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        defsRef.current = msg.defs;
        presetsRef.current = msg.presets;
        const input = { ...defaultsOf(msg.defs), ...readInput(window.location.search, msg.defs) };
        setState((s) => ({ ...s, status: 'ready', defs: msg.defs, presets: msg.presets }));
        requestBuild(input, true);
      } else if (msg.type === 'fatal') {
        setState((s) => ({ ...s, status: 'fatal', fatal: msg.message }));
      } else if (msg.type === 'built') {
        // The worker exports its newest successful build, so the view shows each one, also one
        // that a newer request already replaced. The controls follow the newest request only.
        const model = { data: msg.meshData, measurements: msg.measurements };
        if (msg.id !== latest.current) {
          setState((s) => ({ ...s, model }));
          return;
        }
        // The part converts URL strings to numbers and booleans; show what it built with.
        if (Object.keys(msg.values).length > 0) inputRef.current = msg.values;
        setState((s) => ({ ...s, model, input: inputRef.current, building: false, error: null }));
      } else if (msg.type === 'failed') {
        if (msg.id !== latest.current) return;
        setState((s) => ({ ...s, building: false, error: msg.message }));
      } else if (msg.type === 'exported') {
        download(msg.bytes, msg.filename, msg.mime);
        setState((s) => ({ ...s, exporting: null }));
      } else {
        setState((s) => ({ ...s, exporting: null, error: msg.message }));
      }
    });
    w.addEventListener('error', (e) => {
      setState((s) => ({ ...s, status: 'fatal', fatal: e.message }));
    });
    const base = new URL('.', document.baseURI).href;
    w.postMessage({ type: 'init', base, entry: manifest.entry } satisfies ToWorker);
    return () => {
      window.clearTimeout(timer.current);
      w.terminate();
      worker.current = null;
    };
  }, [manifest, requestBuild]);

  const setValue = useCallback(
    (name: string, value: ParamValue) => {
      requestBuild({ ...inputRef.current, [name]: value });
    },
    [requestBuild]
  );

  const applyPreset = useCallback(
    (name: string) => {
      const preset = presetsRef.current[name];
      if (preset) requestBuild({ ...defaultsOf(defsRef.current), ...preset }, true);
    },
    [requestBuild]
  );

  const reset = useCallback(() => {
    requestBuild(defaultsOf(defsRef.current), true);
  }, [requestBuild]);

  const exportPart = useCallback(
    (format: ExportFormat) => {
      if (manifest === null) return;
      setState((s) => ({ ...s, exporting: format }));
      send({ type: 'export', id: nextId.current++, format, name: manifest.name });
    },
    [manifest, send]
  );

  return { state, setValue, applyPreset, reset, exportPart };
}
