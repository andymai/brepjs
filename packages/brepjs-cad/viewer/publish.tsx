import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ViewerCanvas,
  ViewerControls,
  ViewerInfoPanel,
  ViewerSelectionPanel,
  ViewerSectionControls,
  Renderer,
  EdgeRenderer,
  SelectionHighlight,
  meshSize,
  meshBounds,
  sectionPlane,
  type FaceInfo,
  type Projection,
  type SectionAxis,
  type ViewMode,
  type ViewName,
} from 'brepjs-viewer';
import { ParamPanel } from './src/publish/ParamPanel.js';
import { usePart, type PartManifest, type PartModel } from './src/publish/usePart.js';
import type { ExportFormat } from './src/publish/protocol.js';

function useManifest(): { manifest: PartManifest | null; error: string | null } {
  const [manifest, setManifest] = useState<PartManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(new URL('part.json', document.baseURI))
      .then((r) => {
        if (!r.ok) throw new Error(`part.json: ${r.status}`);
        return r.json() as Promise<PartManifest>;
      })
      .then((m) => {
        if (cancelled) return;
        document.title = m.title;
        setManifest(m);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { manifest, error };
}

function Viewport({ model }: { model: PartModel }) {
  const [viewMode, setViewMode] = useState<ViewMode>('solid');
  const [showEdges, setShowEdges] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [projection, setProjection] = useState<Projection>('perspective');
  const [view, setView] = useState<ViewName>('iso');
  const [fitSignal, setFitSignal] = useState(0);
  const [selectedFace, setSelectedFace] = useState<FaceInfo | null>(null);
  const [hoverFaceId, setHoverFaceId] = useState<number | null>(null);
  const [sectionOn, setSectionOn] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>('x');
  const [sectionPos, setSectionPos] = useState(0);
  const [sectionFlip, setSectionFlip] = useState(false);

  const data = model.data;
  const bounds = useMemo(() => meshBounds(data), [data]);
  const axisIndex = sectionAxis === 'x' ? 0 : sectionAxis === 'y' ? 1 : 2;
  const midOf = useCallback(
    (axis: SectionAxis) => {
      if (!bounds) return 0;
      const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      return (bounds.min[i] + bounds.max[i]) / 2;
    },
    [bounds]
  );
  // A new build can drop the selected face or move the part off the section plane.
  useEffect(() => {
    setSelectedFace((face) =>
      face && data.faceInfos?.some((f) => f.faceId === face.faceId) ? face : null
    );
    setHoverFaceId(null);
  }, [data]);
  const sectionMin = bounds ? bounds.min[axisIndex] : 0;
  const sectionMax = bounds ? bounds.max[axisIndex] : 0;
  const position = Math.min(Math.max(sectionPos, sectionMin), sectionMax);
  const clippingPlanes = useMemo(
    () => (sectionOn && bounds ? [sectionPlane(sectionAxis, position, sectionFlip)] : undefined),
    [sectionOn, bounds, sectionAxis, position, sectionFlip]
  );
  const handleFacePick = useCallback((info: FaceInfo) => {
    setSelectedFace((current) => (current?.faceId === info.faceId ? null : info));
  }, []);
  const handleFaceHover = useCallback((info: FaceInfo | null) => {
    setHoverFaceId(info?.faceId ?? null);
  }, []);
  const screenshot = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.viewport canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'part.png';
    a.click();
  }, []);

  return (
    <>
      <ViewerCanvas
        data={data}
        view={view}
        fitSignal={fitSignal}
        autoRotate={autoRotate}
        gridVisible={showGrid}
        projection={projection}
      >
        <Renderer
          data={data}
          viewMode={viewMode}
          onFacePick={handleFacePick}
          onFaceHover={handleFaceHover}
          {...(clippingPlanes ? { clippingPlanes } : {})}
        />
        {showEdges && viewMode !== 'wireframe' && data.edges.length > 0 && (
          <EdgeRenderer edges={data.edges} {...(clippingPlanes ? { clippingPlanes } : {})} />
        )}
        <SelectionHighlight
          data={data}
          selectedFaceIds={selectedFace ? [selectedFace.faceId] : []}
          hoverFaceId={hoverFaceId}
        />
      </ViewerCanvas>
      {/* These overlays collide in a narrow viewport, so a phone gets the model and its sizes only. */}
      <div className="wide-only">
        <ViewerSelectionPanel
          face={selectedFace}
          onClear={() => {
            setSelectedFace(null);
          }}
        />
        <ViewerSectionControls
          enabled={sectionOn}
          onToggle={() => {
            if (!sectionOn) setSectionPos(midOf(sectionAxis));
            setSectionOn(!sectionOn);
          }}
          axis={sectionAxis}
          onAxisChange={(axis) => {
            setSectionAxis(axis);
            setSectionPos(midOf(axis));
          }}
          position={position}
          min={sectionMin}
          max={sectionMax}
          onPositionChange={setSectionPos}
          flip={sectionFlip}
          onToggleFlip={() => {
            setSectionFlip((v) => !v);
          }}
        />
      </div>
      <ViewerInfoPanel
        dims={meshSize(data)}
        volume={model.measurements.volume}
        area={model.measurements.area}
        triangles={data.index.length / 3}
        valid={model.measurements.valid}
      />
      <div className="wide-only">
        <ViewerControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showEdges={showEdges}
          onToggleEdges={() => {
            setShowEdges((v) => !v);
          }}
          showGrid={showGrid}
          onToggleGrid={() => {
            setShowGrid((v) => !v);
          }}
          autoRotate={autoRotate}
          onToggleAutoRotate={() => {
            setAutoRotate((v) => !v);
          }}
          projection={projection}
          onToggleProjection={() => {
            setProjection((p) => (p === 'perspective' ? 'orthographic' : 'perspective'));
          }}
          activeView={view}
          onView={setView}
          onFit={() => {
            setFitSignal((n) => n + 1);
          }}
          onScreenshot={screenshot}
        />
      </div>
    </>
  );
}

function Source({ manifest }: { manifest: PartManifest }) {
  return (
    <div className="source">
      {manifest.sources.map((file) => (
        <section key={file.path}>
          <h2>{file.path}</h2>
          <pre>
            <code>{file.text}</code>
          </pre>
        </section>
      ))}
    </div>
  );
}

const FORMATS: { format: ExportFormat; label: string }[] = [
  { format: 'step', label: 'STEP' },
  { format: '3mf', label: '3MF' },
  { format: 'stl', label: 'STL' },
];

function App() {
  const { manifest, error: manifestError } = useManifest();
  const { state, setValue, applyPreset, reset, exportPart } = usePart(manifest);
  const [tab, setTab] = useState<'model' | 'source'>('model');

  if (manifestError) return <p className="notice error">Cannot load the part: {manifestError}</p>;
  if (!manifest) return <p className="notice">Loading…</p>;
  if (state.status === 'fatal')
    return <p className="notice error">Cannot start the part: {state.fatal}</p>;

  return (
    <div className="page">
      <aside className="panel">
        <h1>{manifest.title}</h1>
        {state.status === 'loading' ? (
          <p className="hint">Starting the geometry kernel…</p>
        ) : (
          <ParamPanel
            defs={state.defs}
            presets={state.presets}
            input={state.input}
            onChange={setValue}
            onPreset={applyPreset}
            onReset={reset}
          />
        )}
        <div className="downloads">
          {FORMATS.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              disabled={state.model === null || state.building || state.exporting !== null}
              onClick={() => {
                exportPart(format);
              }}
            >
              {state.exporting === format ? 'Preparing…' : `Download ${label}`}
            </button>
          ))}
        </div>
        <footer>
          Built with <a href="https://brepjs.dev">brepjs</a>
        </footer>
      </aside>
      <main className="stage">
        <nav className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'model'}
            onClick={() => {
              setTab('model');
            }}
          >
            Model
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'source'}
            onClick={() => {
              setTab('source');
            }}
          >
            Source
          </button>
          {state.building && <span className="hint">Building…</span>}
        </nav>
        {state.error && (
          <p className="banner" role="alert">
            {state.error}
          </p>
        )}
        <div className="viewport" hidden={tab !== 'model'}>
          {state.model ? (
            <Viewport model={state.model} />
          ) : (
            !state.error && <p className="notice">Building the part…</p>
          )}
        </div>
        {tab === 'source' && <Source manifest={manifest} />}
      </main>
    </div>
  );
}

const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
