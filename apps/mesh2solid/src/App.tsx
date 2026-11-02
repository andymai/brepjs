import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MeshInspection, MeshUnit } from 'brepjs-mesh2solid';
import { EdgeRenderer, Renderer, ViewerCanvas } from 'brepjs-viewer';
import { ConversionClient } from './client.js';
import { count, length, size, stem, UNITS, unitLabel } from './format.js';
import { Heatmap, RAMP, scaleFor } from './Heatmap.js';
import type { Conversion } from './protocol.js';
import { ReportPanel } from './ReportPanel.js';

type State =
  | { readonly kind: 'idle'; readonly error?: string }
  | { readonly kind: 'reading'; readonly file: File }
  | { readonly kind: 'confirm'; readonly file: File; readonly info: MeshInspection }
  | { readonly kind: 'converting'; readonly file: File; readonly units: MeshUnit }
  | { readonly kind: 'done'; readonly file: File; readonly result: Conversion };

function download(data: BlobPart, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function DropZone({ onFile, error }: { onFile: (f: File) => void; error?: string | undefined }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop${over ? ' over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <p className="drop-title">Drop a mesh file here</p>
      <p className="muted">STL, OBJ, PLY, or 3MF</p>
      <button type="button" onClick={() => input.current?.click()}>
        Choose a file
      </button>
      <input
        ref={input}
        type="file"
        accept=".stl,.obj,.ply,.3mf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {error !== undefined && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Confirm({
  file,
  info,
  onConvert,
  onCancel,
}: {
  file: File;
  info: MeshInspection;
  onConvert: (u: MeshUnit) => void;
  onCancel: () => void;
}) {
  const [unit, setUnit] = useState<MeshUnit>(info.unit ?? 'mm');
  return (
    <section className="panel confirm" aria-label="Confirm units">
      <h2>{file.name}</h2>
      <p className="muted">
        {info.format.toUpperCase()}, {count(info.triangles)} triangles
      </p>
      <p className="size">{size(info.size, unit)}</p>
      <label className="units">
        Units
        <select value={unit} onChange={(e) => setUnit(e.target.value as MeshUnit)}>
          {UNITS.map((u) => (
            <option key={u.unit} value={u.unit}>
              {u.label}
            </option>
          ))}
        </select>
      </label>
      {info.unit !== null ? (
        <p className="muted">The file says {unitLabel(info.unit)}.</p>
      ) : (
        <p className="muted">The file doesn't say; most CAD exports are in millimeters.</p>
      )}
      {info.suggestions.map((s) => (
        <p key={s.unit} className="suggestion">
          In {unitLabel(s.unit)} it would be {length(s.largestDimensionMm)} long: {s.reason}.{' '}
          <button type="button" className="link" onClick={() => setUnit(s.unit)}>
            Use {unitLabel(s.unit)}
          </button>
        </p>
      ))}
      <div className="actions">
        <button type="button" className="primary" onClick={() => onConvert(unit)}>
          Convert
        </button>
        <button type="button" onClick={onCancel}>
          Choose another file
        </button>
      </div>
    </section>
  );
}

function Result({
  file,
  result,
  onReset,
}: {
  file: File;
  result: Conversion;
  onReset: () => void;
}) {
  const [view, setView] = useState<'solid' | 'deviation'>('solid');
  const [hover, setHover] = useState<number | null>(null);
  const scale = useMemo(() => scaleFor(result.report.deviation.max), [result]);
  const name = stem(file.name);
  const showMap = view === 'deviation' && result.heatmap !== null;
  // A faceted result's edges are every triangle's; drawn, they hatch its curves black.
  const showEdges = result.report.tierReached > 0 || result.report.faces.faces <= 500;
  return (
    <div className="result">
      <div className="viewer">
        <ViewerCanvas data={result.part} view="iso" gridVisible={false}>
          {showMap && result.heatmap !== null ? (
            <Heatmap data={result.heatmap} scale={scale} onHover={setHover} />
          ) : (
            <Renderer data={result.part} />
          )}
          {showEdges && <EdgeRenderer edges={result.part.edges} />}
        </ViewerCanvas>
        <div className="view-toggle" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'solid'} onClick={() => setView('solid')}>
            Solid
          </button>
          <button
            type="button"
            aria-pressed={view === 'deviation'}
            disabled={result.heatmap === null}
            onClick={() => setView('deviation')}
          >
            Distance to mesh
          </button>
        </div>
        {showMap && (
          <div className="legend" aria-label="Distance from the mesh to the rebuilt part">
            <div
              className="legend-bar"
              style={{ background: `linear-gradient(to right, ${RAMP.join(', ')})` }}
            />
            <div className="legend-labels">
              <span>0</span>
              <span>{length(scale)} or more</span>
            </div>
            <p className="readout">
              {hover === null ? 'Point at the part to read a distance.' : `Here: ${length(hover)}`}
            </p>
          </div>
        )}
      </div>
      <aside>
        <ReportPanel report={result.report} solid={result.solid} />
        <section className="panel" aria-label="Downloads">
          <h2>Download</h2>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={result.step === null}
              onClick={() => result.step && download(result.step, `${name}.step`, 'model/step')}
            >
              STEP
            </button>
            {result.code !== null && (
              <button
                type="button"
                onClick={() =>
                  result.code !== null &&
                  download(result.code, `${name}.brep.ts`, 'text/typescript')
                }
              >
                .brep.ts program
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                download(
                  JSON.stringify(result.report, null, 2),
                  `${name}.report.json`,
                  'application/json'
                )
              }
            >
              Report (JSON)
            </button>
          </div>
          {result.code !== null && (
            <details>
              <summary>Show the program</summary>
              <pre className="code">{result.code}</pre>
            </details>
          )}
        </section>
        <button type="button" onClick={onReset}>
          Convert another file
        </button>
      </aside>
    </div>
  );
}

export function App() {
  // Created in an effect, not a memo: StrictMode runs memos twice and would
  // leave a second worker loading the kernel with nothing to stop it.
  const client = useRef<ConversionClient | null>(null);
  useEffect(() => {
    const c = new ConversionClient();
    client.current = c;
    return () => {
      c.terminate();
      client.current = null;
    };
  }, []);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const open = useCallback((file: File) => {
    const c = client.current;
    if (c === null) return;
    setState({ kind: 'reading', file });
    c.inspect(file).then(
      (info) => setState({ kind: 'confirm', file, info }),
      (e: unknown) =>
        setState({ kind: 'idle', error: `Couldn't read ${file.name}: ${(e as Error).message}` })
    );
  }, []);

  const convert = useCallback((file: File, units: MeshUnit) => {
    const c = client.current;
    if (c === null) return;
    setState({ kind: 'converting', file, units });
    c.convert(file, units).then(
      (result) => setState({ kind: 'done', file, result }),
      (e: unknown) =>
        setState({
          kind: 'idle',
          error: `Couldn't convert ${file.name}: ${(e as Error).message}`,
        })
    );
  }, []);

  return (
    <main>
      <header>
        <h1>Mesh to solid</h1>
        <p className="lede">
          Turn an STL, OBJ, PLY, or 3MF mesh into a solid you can measure, edit, and export as STEP.
          Your file stays in this browser.
        </p>
      </header>
      {state.kind === 'idle' && <DropZone onFile={open} error={state.error} />}
      {state.kind === 'reading' && <p className="status">Reading {state.file.name}…</p>}
      {state.kind === 'confirm' && (
        <Confirm
          file={state.file}
          info={state.info}
          onConvert={(u) => convert(state.file, u)}
          onCancel={() => setState({ kind: 'idle' })}
        />
      )}
      {state.kind === 'converting' && (
        <div className="status" role="status">
          <p>Converting {state.file.name}…</p>
          <p className="muted">
            Fitting surfaces and rebuilding the solid. A large scan can take a minute.
          </p>
        </div>
      )}
      {state.kind === 'done' && (
        <Result
          file={state.file}
          result={state.result}
          onReset={() => setState({ kind: 'idle' })}
        />
      )}
    </main>
  );
}
