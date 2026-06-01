import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from './Viewer.js';
import { MetricsPanel } from './MetricsPanel.js';
import type { ToWebview, VerifyReport } from './types.js';

// acquireVsCodeApi is injected into the webview global scope by VS Code.
// It must be called exactly once per webview lifetime.
declare const acquireVsCodeApi: () => { postMessage: (msg: unknown) => void };
const vscode = acquireVsCodeApi();

type AppState =
  | { status: 'idle' }
  | { status: 'loading'; filePath: string }
  | { status: 'ready'; glbUri: string; report: VerifyReport; filePath: string }
  | { status: 'no-glb'; report: VerifyReport; filePath: string }
  | { status: 'error'; message: string; filePath?: string };

const base: React.CSSProperties = {
  height: '100vh',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: '#1a1d21',
  color: '#ccc',
  fontFamily: 'var(--vscode-font-family, sans-serif)',
};

function shortName(filePath: string): string {
  return filePath.split(/[\\/]/).at(-1) ?? filePath;
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...base, alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
      {children}
    </div>
  );
}

function App() {
  const [state, setState] = useState<AppState>({ status: 'idle' });

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data as ToWebview;
      if (msg.type === 'loading') {
        setState({ status: 'loading', filePath: msg.filePath });
      } else if (msg.type === 'update') {
        if (msg.glbUri) {
          setState({ status: 'ready', glbUri: msg.glbUri, report: msg.report, filePath: msg.filePath });
        } else {
          setState({ status: 'no-glb', report: msg.report, filePath: msg.filePath });
        }
      } else if (msg.type === 'error') {
        setState({ status: 'error', message: msg.message, filePath: msg.filePath });
      }
    }
    window.addEventListener('message', onMessage);
    // Tell the extension host the webview is ready to receive messages
    vscode.postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (state.status === 'idle') {
    return (
      <Placeholder>
        <div style={{ color: '#555', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 10, lineHeight: 1 }}>⬡</div>
          <div>Open and save a <code style={{ fontSize: 12 }}>.brep.ts</code> file to preview</div>
        </div>
      </Placeholder>
    );
  }

  if (state.status === 'loading') {
    return (
      <Placeholder>
        <div style={{ color: '#555' }}>Verifying {shortName(state.filePath)}…</div>
      </Placeholder>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={{ ...base, padding: 16, fontSize: 12, overflow: 'auto' }}>
        <div style={{ color: '#f44747', marginBottom: 6, fontWeight: 600 }}>✗ Verify failed</div>
        {state.filePath !== undefined && (
          <div style={{ color: '#555', marginBottom: 8 }}>{shortName(state.filePath)}</div>
        )}
        <pre style={{ color: '#f44747', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontSize: 11 }}>
          {state.message}
        </pre>
      </div>
    );
  }

  if (state.status === 'no-glb') {
    // Shape had verify errors that prevented GLB export — show metrics only
    return (
      <div style={base}>
        <Placeholder>
          <div style={{ color: '#555', textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✗</div>
            <div style={{ fontSize: 12 }}>Shape invalid — no 3D preview available</div>
          </div>
        </Placeholder>
        <MetricsPanel report={state.report} />
      </div>
    );
  }

  // ready — full 3D view + metrics panel
  return (
    <div style={base}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Viewer glbUri={state.glbUri} />
      </div>
      <MetricsPanel report={state.report} />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
