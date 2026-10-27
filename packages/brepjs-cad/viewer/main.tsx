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
  findElementAt,
  styleElements,
  type ElementStyle,
  type FaceInfo,
  type Projection,
  type SectionAxis,
  type ViewMode,
  type ViewName,
} from 'brepjs-viewer';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useModel, type PreviewInfo } from './src/useModel.js';
import {
  installCameraReader,
  installScreenshotApi,
  onScene,
  markReady,
  readCamera,
  type Mark,
} from './src/screenshotApi.js';

// Kernel-anchored Set-of-Marks: numbered badges drawn at 3D feature points (drei <Html> projects them
// per-view and renders DOM over the canvas, which the screenshot captures). Same id → same feature
// across views, giving the judge view-invariant, part-space addressing.
function Marks({ marks }: { marks: readonly Mark[] }) {
  return (
    <>
      {marks.map((m, i) => (
        <Html key={`${m.label}-${i}`} position={[m.pos[0], m.pos[1], m.pos[2]]} center>
          <div
            style={{
              background: '#ffcc00',
              color: '#000',
              font: '700 13px monospace',
              padding: '1px 5px',
              borderRadius: 4,
              border: '1px solid #000',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {m.label}
          </div>
        </Html>
      ))}
    </>
  );
}

// Reads the default camera at call time: drei swaps in an orthographic one for plans.
function CameraProbe() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    installCameraReader(() => readCamera(get().camera));
  }, [get]);
  return null;
}

/** What brep-mcp's show_model, select_elements and show_elements send a preview page. */
interface PreviewScene {
  readonly style?: ElementStyle;
  readonly selection?: readonly string[];
  readonly frame?: readonly string[];
}

const SELECTED = '#ffd400';

function usePreviewScene(): PreviewScene | null {
  const [scene, setScene] = useState<PreviewScene | null>(null);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('preview')) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const r = await fetch('/__preview/scene');
        if (r.ok && !cancelled) setScene((await r.json()) as PreviewScene);
      } catch {
        // No scene route (an older server) leaves the page unstyled.
      }
    };
    void load();
    const events = new EventSource('/__preview/events');
    // Every ping but a model-only one refreshes the scene: the bare {seq} a reconnect sends may
    // follow changes missed while the stream was down.
    events.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as { scene?: boolean; model?: boolean };
        if (msg.model !== true || msg.scene === true) void load();
      } catch {
        void load();
      }
    };
    return () => {
      cancelled = true;
      events.close();
    };
  }, []);
  return scene;
}

/** The scene's style with its selection drawn first, or null when it asks for nothing. */
function sceneStyle(scene: PreviewScene | null): ElementStyle | null {
  if (scene === null) return null;
  const selection = scene.selection ?? [];
  if (!scene.style && selection.length === 0) return null;
  return {
    layers: [
      ...(selection.length > 0
        ? [{ keyPaths: selection, color: SELECTED, mode: 'solid' as const }]
        : []),
      ...(scene.style?.layers ?? []),
    ],
    others: scene.style?.others ?? 'solid',
  };
}

// The agent snapshot pipeline screenshots this same page, so it loads with ?ui=0 to
// suppress the toolbar and keep PNGs free of chrome. Human `--serve` links omit it.
const params = new URLSearchParams(window.location.search);
const showControls = params.get('ui') !== '0';
// Snapshot mode adds ?dims=1 to burn the model's bbox size into the PNG so the agent
// can read scale from the image. In interactive mode the info panel already shows it.
const showDims = params.get('dims') === '1';

function downloadCanvasPng(): void {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = 'brepjs-view.png';
  a.click();
}

// Element identity panel for `brep preview`: counts, the picked element's key path,
// and every failed key path (failed elements are absent from the merged mesh, so the
// list is the only place they surface visually).
function PreviewPanel({ preview, selected }: { preview: PreviewInfo; selected: string | null }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        maxWidth: 340,
        maxHeight: '60vh',
        overflowY: 'auto',
        background: 'rgba(16, 20, 24, 0.85)',
        color: '#cfd6dc',
        font: '12px monospace',
        padding: '8px 10px',
        borderRadius: 6,
        pointerEvents: 'auto',
      }}
    >
      <div>
        elements: {preview.elements.length}
        {preview.failed.length > 0 && (
          <span style={{ color: '#e88' }}> · {preview.failed.length} failed</span>
        )}
      </div>
      {selected && <div style={{ color: '#ffd479' }}>selected: {selected}</div>}
      {preview.failed.map((keyPath) => (
        <div key={keyPath} style={{ color: '#e88' }}>
          ✗ {keyPath}
        </div>
      ))}
    </div>
  );
}

function App() {
  const state = useModel({ inspect: showControls });
  const [view, setView] = useState<ViewName>('iso');
  const [viewMode, setViewMode] = useState<ViewMode>('solid');
  const [showEdges, setShowEdges] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [projection, setProjection] = useState<Projection>('perspective');
  const [fitSignal, setFitSignal] = useState(0);
  const [selectedFace, setSelectedFace] = useState<FaceInfo | null>(null);
  const [hoverFaceId, setHoverFaceId] = useState<number | null>(null);
  const [sectionOn, setSectionOn] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<SectionAxis>('x');
  const [sectionPos, setSectionPos] = useState(0);
  const [sectionFlip, setSectionFlip] = useState(false);
  const [marks, setMarks] = useState<readonly Mark[]>([]);
  const [elementStyle, setElementStyle] = useState<ElementStyle | null>(null);
  const scene = usePreviewScene();
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const preview: PreviewInfo | undefined = state.status === 'ready' ? state.preview : undefined;
  const handleTrianglePick = useCallback(
    (triangleIndex: number) => {
      if (!preview) return;
      setSelectedElement(findElementAt(preview.elements, triangleIndex)?.keyPath ?? null);
    },
    [preview]
  );
  const handleFit = useCallback(() => {
    setFitSignal((n) => n + 1);
  }, []);
  const handleFacePick = useCallback((info: FaceInfo) => {
    setSelectedFace(info);
  }, []);
  const handleFaceHover = useCallback((info: FaceInfo | null) => {
    setHoverFaceId(info ? info.faceId : null);
  }, []);
  const bounds = useMemo(() => (state.status === 'ready' ? meshBounds(state.data) : null), [state]);
  // bridge window.__renderView / __setScene -> camera + view mode + section. Depends on `bounds`
  // so a section `frac` maps to an absolute position on the model.
  useEffect(
    () =>
      onScene((c) => {
        setView(c.view);
        setViewMode(c.viewMode ?? 'solid');
        if (c.section && bounds) {
          const i = c.section.axis === 'x' ? 0 : c.section.axis === 'y' ? 1 : 2;
          setSectionAxis(c.section.axis);
          setSectionPos(bounds.min[i] + c.section.frac * (bounds.max[i] - bounds.min[i]));
          setSectionFlip(c.section.flip ?? false);
          setSectionOn(true);
        } else {
          setSectionOn(false);
        }
        setMarks(c.marks ?? []);
        setElementStyle(c.elements ?? null);
        setProjection(c.projection ?? 'perspective');
      }),
    [bounds]
  );
  const axisIndex = sectionAxis === 'x' ? 0 : sectionAxis === 'y' ? 1 : 2;
  const sectionMin = bounds ? bounds.min[axisIndex] : 0;
  const sectionMax = bounds ? bounds.max[axisIndex] : 1;
  const midOfAxis = useCallback(
    (a: SectionAxis): number => {
      if (!bounds) return 0;
      const i = a === 'x' ? 0 : a === 'y' ? 1 : 2;
      return (bounds.min[i] + bounds.max[i]) / 2;
    },
    [bounds]
  );
  const handleToggleSection = useCallback(() => {
    setSectionOn((on) => {
      if (!on) setSectionPos(midOfAxis(sectionAxis));
      return !on;
    });
  }, [midOfAxis, sectionAxis]);
  const handleAxisChange = useCallback(
    (a: SectionAxis) => {
      setSectionAxis(a);
      setSectionPos(midOfAxis(a));
    },
    [midOfAxis]
  );
  // A snapshot's own scene wins over what an agent sent the page.
  const activeStyle = useMemo(() => elementStyle ?? sceneStyle(scene), [elementStyle, scene]);
  const styled = useMemo(
    () =>
      state.status === 'ready' && preview && activeStyle
        ? styleElements(state.data, preview.elements, activeStyle, viewMode)
        : null,
    [state, preview, activeStyle, viewMode]
  );
  // Framing follows the model, the style and show_elements, not the selection, so picking an
  // element doesn't snap the camera back.
  const frameKey = JSON.stringify([
    elementStyle ? null : (scene?.style ?? null),
    scene?.frame ?? null,
  ]);
  const framing = useMemo(() => {
    if (state.status !== 'ready' || !preview) return state.status === 'ready' ? state.data : null;
    const [style, frame] = JSON.parse(frameKey) as [ElementStyle | null, string[] | null];
    if (frame && frame.length > 0) {
      return styleElements(state.data, preview.elements, {
        layers: [{ keyPaths: frame }],
        others: 'hidden',
      }).visible;
    }
    const base = elementStyle ?? style;
    return base ? styleElements(state.data, preview.elements, base).visible : state.data;
  }, [state, preview, elementStyle, frameKey]);
  const clippingPlanes = useMemo(
    () => (sectionOn && bounds ? [sectionPlane(sectionAxis, sectionPos, sectionFlip)] : undefined),
    [sectionOn, bounds, sectionAxis, sectionPos, sectionFlip]
  );
  if (state.status === 'error')
    return (
      <div style={{ color: '#e88', padding: 16, fontFamily: 'monospace' }}>
        error: {state.error}
      </div>
    );
  if (state.status !== 'ready')
    return (
      <div style={{ color: '#9aa', padding: 16, fontFamily: 'monospace' }}>loading model…</div>
    );
  return (
    <>
      <ViewerCanvas
        data={framing ?? state.data}
        view={view}
        fitSignal={fitSignal}
        autoRotate={autoRotate}
        gridVisible={showGrid}
        projection={projection}
        onFirstFrame={markReady}
      >
        {styled ? (
          styled.meshes.map((m) => (
            <group key={m.key}>
              <Renderer
                data={m.data}
                viewMode={m.viewMode}
                {...(clippingPlanes ? { clippingPlanes } : {})}
              />
              {showEdges && m.viewMode !== 'wireframe' && m.data.edges.length > 0 && (
                <EdgeRenderer
                  edges={m.data.edges}
                  {...(clippingPlanes ? { clippingPlanes } : {})}
                />
              )}
            </group>
          ))
        ) : (
          <>
            <Renderer
              data={state.data}
              viewMode={viewMode}
              {...(clippingPlanes ? { clippingPlanes } : {})}
              {...(showControls
                ? { onFacePick: handleFacePick, onFaceHover: handleFaceHover }
                : {})}
              {...(preview ? { onTrianglePick: handleTrianglePick } : {})}
            />
            {showEdges && viewMode !== 'wireframe' && state.data.edges.length > 0 && (
              <EdgeRenderer
                edges={state.data.edges}
                {...(clippingPlanes ? { clippingPlanes } : {})}
              />
            )}
          </>
        )}
        {showControls && (
          <SelectionHighlight
            data={state.data}
            selectedFaceIds={selectedFace ? [selectedFace.faceId] : []}
            hoverFaceId={hoverFaceId}
          />
        )}
        {marks.length > 0 && <Marks marks={marks} />}
        <CameraProbe />
      </ViewerCanvas>
      {showControls && (
        <ViewerSelectionPanel
          face={selectedFace}
          onClear={() => {
            setSelectedFace(null);
          }}
        />
      )}
      {showControls && (
        <ViewerSectionControls
          enabled={sectionOn}
          onToggle={handleToggleSection}
          axis={sectionAxis}
          onAxisChange={handleAxisChange}
          position={sectionPos}
          min={sectionMin}
          max={sectionMax}
          onPositionChange={setSectionPos}
          flip={sectionFlip}
          onToggleFlip={() => {
            setSectionFlip((v) => !v);
          }}
        />
      )}
      {showControls && (
        <ViewerInfoPanel
          dims={meshSize(state.data)}
          volume={state.measurements.volume}
          area={state.measurements.area}
          triangles={state.data.index.length / 3}
          valid={state.measurements.valid}
        />
      )}
      {!showControls && showDims && (
        <ViewerInfoPanel dims={meshSize(styled ? styled.visible : state.data)} />
      )}
      {showControls && preview && <PreviewPanel preview={preview} selected={selectedElement} />}
      {showControls && (
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
          onFit={handleFit}
          onScreenshot={downloadCanvasPng}
        />
      )}
    </>
  );
}
installScreenshotApi();
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
