/**
 * The inline viewer brep-mcp serves as an MCP App (ui://brep-mcp/viewer). The host renders it for a
 * show_model result; it fetches the session's model through the app-only viewer_payload tool, then
 * polls viewer_sync to report what the user clicks and to pick up select_elements and
 * show_elements from the agent.
 */

import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  EdgeRenderer,
  Renderer,
  ViewerCanvas,
  decodePreviewPayload,
  findElementAt,
  styleElements,
  type ElementRange,
  type ElementStyle,
  type MeshData,
} from 'brepjs-viewer';
import { HostBridge, type CallToolResultLike } from './src/hostBridge.js';

const SYNC_MS = 1500;
const SELECTED = '#ffd400';

interface Loaded {
  readonly sessionId: string;
  readonly buildHash: string;
  readonly data: MeshData;
  readonly elements: readonly ElementRange[];
}

interface SyncState {
  readonly rev: number;
  readonly frameSeq: number;
  readonly selection: readonly string[];
  readonly frame?: readonly string[] | undefined;
  readonly style?: ElementStyle | undefined;
}

function textOf(result: CallToolResultLike): string {
  return result.content?.find((c) => c.type === 'text')?.text ?? '';
}

function bytesOf(base64: string): ArrayBuffer {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

/** Each styled mesh's elements, packed the way styleElements packs that mesh. */
function packedRanges(elements: readonly ElementRange[], style: ElementStyle): ElementRange[][] {
  const byKey = new Map(elements.map((r) => [r.keyPath, r]));
  const taken = new Set<string>();
  const pack = (list: readonly ElementRange[]): ElementRange[] => {
    let at = 0;
    return list.map((r) => {
      const packed = { keyPath: r.keyPath, start: at, count: r.count };
      at += r.count;
      return packed;
    });
  };
  const out: ElementRange[][] = [];
  for (const layer of style.layers) {
    const list: ElementRange[] = [];
    for (const k of layer.keyPaths) {
      const r = byKey.get(k);
      if (r === undefined || taken.has(k)) continue;
      taken.add(k);
      list.push(r);
    }
    if (list.length > 0) out.push(pack(list));
  }
  if ((style.others ?? 'solid') !== 'hidden') {
    const rest = elements.filter((r) => !taken.has(r.keyPath));
    if (rest.length > 0) out.push(pack(rest));
  }
  return out;
}

const bridge = new HostBridge();

async function loadModel(sessionId: string): Promise<Loaded> {
  const result = await bridge.callTool('viewer_payload', { sessionId });
  if (result.isError) throw new Error(textOf(result));
  const meta = result.structuredContent ?? {};
  const payload = decodePreviewPayload(bytesOf(textOf(result)));
  return {
    sessionId,
    buildHash: typeof meta['buildHash'] === 'string' ? meta['buildHash'] : '',
    data: payload.data,
    elements: payload.elements,
  };
}

function App() {
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<Loaded | null>(null);
  const [sync, setSync] = useState<SyncState>({ rev: 0, frameSeq: 0, selection: [] });
  const [fitSignal, setFitSignal] = useState(0);

  useEffect(() => {
    let sessionId: string | undefined;
    bridge.on('ui/notifications/tool-input', (params) => {
      const args = (params['arguments'] ?? {}) as Record<string, unknown>;
      if (typeof args['sessionId'] === 'string' && sessionId === undefined) {
        sessionId = args['sessionId'];
        loadModel(sessionId).then(setModel, (e: unknown) => setError(String(e)));
      }
    });
    bridge.connect().catch((e: unknown) => setError(String(e)));
  }, []);

  const report = useCallback(
    async (selection?: readonly string[]): Promise<void> => {
      if (model === null) return;
      const result = await bridge.callTool('viewer_sync', {
        sessionId: model.sessionId,
        rev: sync.rev,
        ...(selection ? { selection } : {}),
      });
      const next = result.structuredContent as
        (Partial<SyncState> & { buildHash?: string }) | undefined;
      // A rebuild changed the model under the viewer: load the new one.
      if (next?.buildHash && model.buildHash && next.buildHash !== model.buildHash) {
        setModel(await loadModel(model.sessionId));
      }
      if (next && typeof next.rev === 'number' && next.rev !== sync.rev) {
        const frameSeq = next.frameSeq ?? sync.frameSeq;
        setSync({
          rev: next.rev,
          frameSeq,
          selection: next.selection ?? sync.selection,
          frame: next.frame,
          style: next.style,
        });
        if (frameSeq !== sync.frameSeq) setFitSignal((n) => n + 1);
      } else if (selection) {
        setSync((s) => ({ ...s, selection }));
      }
    },
    [model, sync]
  );

  useEffect(() => {
    if (model === null) return;
    const timer = setInterval(() => void report().catch(() => undefined), SYNC_MS);
    void report().catch(() => undefined);
    return () => clearInterval(timer);
  }, [model, report]);

  const style = useMemo<ElementStyle>(() => {
    const base = sync.style ?? { layers: [] };
    return {
      layers: [
        ...(sync.selection.length > 0
          ? [{ keyPaths: sync.selection, color: SELECTED, mode: 'solid' as const }]
          : []),
        ...base.layers,
      ],
      others: base.others ?? 'solid',
    };
  }, [sync]);

  const styled = useMemo(
    () => (model ? styleElements(model.data, model.elements, style) : null),
    [model, style]
  );
  const ranges = useMemo(() => (model ? packedRanges(model.elements, style) : []), [model, style]);
  // Framing follows the model, the agent's style and show_elements, not the selection, so a click
  // doesn't snap the camera back. A key keeps a re-sent but equal style from refitting too.
  const frameKey = JSON.stringify([sync.style ?? null, sync.frame ?? null]);
  const framed = useMemo(() => {
    if (!model) return undefined;
    const [base, frame] = JSON.parse(frameKey) as [ElementStyle | null, string[] | null];
    if (frame && frame.length > 0) {
      return styleElements(model.data, model.elements, {
        layers: [{ keyPaths: frame }],
        others: 'hidden',
      }).visible;
    }
    return base ? styleElements(model.data, model.elements, base).visible : model.data;
  }, [model, frameKey]);

  if (error)
    return <div style={{ color: '#e88', padding: 12, font: '12px monospace' }}>{error}</div>;
  if (!model || !styled || !framed)
    return <div style={{ color: '#9aa', padding: 12, font: '12px monospace' }}>loading model…</div>;
  return (
    <>
      <ViewerCanvas data={framed} view="iso" fitSignal={fitSignal} gridVisible={false}>
        {styled.meshes.map((m, i) => (
          <group key={m.key}>
            <Renderer
              data={m.data}
              viewMode={m.viewMode}
              onTrianglePick={(tri) => {
                const hit = findElementAt(ranges[i] ?? [], tri)?.keyPath;
                void report(hit ? [hit] : []).catch(() => undefined);
              }}
            />
            {m.viewMode !== 'wireframe' && m.data.edges.length > 0 && (
              <EdgeRenderer edges={m.data.edges} />
            )}
          </group>
        ))}
      </ViewerCanvas>
      <div
        data-testid="selection"
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          color: '#cfd6dc',
          font: '12px monospace',
          background: 'rgba(16,20,24,0.8)',
          padding: '4px 8px',
          borderRadius: 4,
        }}
      >
        {sync.selection.length > 0 ? `selected: ${sync.selection.join(', ')}` : 'click an element'}
      </div>
    </>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
