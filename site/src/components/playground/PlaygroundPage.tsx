import { useCallback, useMemo, useEffect } from 'react';
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useToastStore } from '../../stores/toastStore';
import { useCodeExecution } from '../../hooks/useCodeExecution';
import { useUrlState } from '../../hooks/useUrlState';
import { useHeroMesh } from '../../hooks/useHeroMesh';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { SHORTCUTS } from '../../lib/shortcuts';
import Toolbar from './Toolbar';
import EditorPanel from './EditorPanel';
import ViewerPanel from './ViewerPanel';
import OutputPanel from './OutputPanel';
import StatusBar from './StatusBar';
import LoadingOverlay from './LoadingOverlay';
import CollapsedConsoleBar from './CollapsedConsoleBar';
import ToastContainer from '../shared/ToastContainer';

const shortcutDefs = Object.values(SHORTCUTS);

export default function PlaygroundPage() {
  const code = usePlaygroundStore((s) => s.code);
  const meshes = usePlaygroundStore((s) => s.meshes);
  const setMeshes = usePlaygroundStore((s) => s.setMeshes);
  const pendingReview = usePlaygroundStore((s) => s.pendingReview);
  const setPendingReview = usePlaygroundStore((s) => s.setPendingReview);
  const isConsoleCollapsed = usePlaygroundStore((s) => s.isConsoleCollapsed);
  const setConsoleCollapsed = usePlaygroundStore((s) => s.setConsoleCollapsed);
  const isViewerCollapsed = usePlaygroundStore((s) => s.isViewerCollapsed);
  const setViewerCollapsed = usePlaygroundStore((s) => s.setViewerCollapsed);
  const addToast = useToastStore((s) => s.addToast);
  const { runCode, exportSTL, exportSTEP, debouncedRun } = useCodeExecution();
  const { updateUrl, copyShareUrl } = useUrlState();
  const heroMesh = useHeroMesh();

  const consolePanelRef = usePanelRef();
  const viewerPanelRef = usePanelRef();
  // Mutable ref to hold the editor format function, set by EditorPanel
  const editorFormatFnRef = useMemo(() => ({ current: null as (() => void) | null }), []);

  // Layout persistence
  const storage = typeof window !== 'undefined' ? localStorage : undefined;
  const hLayout = useDefaultLayout({ id: 'playground-h', storage });
  const vLayout = useDefaultLayout({ id: 'playground-v', storage });

  // Seed viewer with pre-computed mesh while WASM engine loads
  useEffect(() => {
    if (heroMesh && meshes.length === 0) {
      setMeshes([heroMesh]);
    }
  }, [heroMesh, meshes.length, setMeshes]);

  const handleCodeChange = useCallback(
    (newCode: string) => {
      debouncedRun(newCode);
    },
    [debouncedRun],
  );

  const handleRun = useCallback(() => {
    if (pendingReview) setPendingReview(false);
    runCode(code);
    updateUrl(code);
  }, [runCode, code, updateUrl, pendingReview, setPendingReview]);

  const handleExportSTL = useCallback(() => {
    exportSTL(code);
    addToast('Exporting STL...');
  }, [exportSTL, code, addToast]);

  const handleExportSTEP = useCallback(() => {
    exportSTEP(code);
    addToast('Exporting STEP...');
  }, [exportSTEP, code, addToast]);

  const handleShare = useCallback(() => {
    copyShareUrl(code);
    addToast('Link copied to clipboard');
  }, [copyShareUrl, code, addToast]);

  const toggleConsole = useCallback(() => {
    const panel = consolePanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [consolePanelRef]);

  const toggleViewer = useCallback(() => {
    const panel = viewerPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [viewerPanelRef]);

  const handleFormat = useCallback(() => {
    editorFormatFnRef.current?.();
  }, [editorFormatFnRef]);

  const handleConsoleResize = useCallback(
    (size: { asPercentage: number }) => {
      // collapsedSize is 3.5%, detect collapse/expand
      setConsoleCollapsed(size.asPercentage <= 4);
    },
    [setConsoleCollapsed],
  );

  const handleViewerResize = useCallback(
    (size: { asPercentage: number }) => {
      setViewerCollapsed(size.asPercentage <= 1);
    },
    [setViewerCollapsed],
  );

  const shortcutActions = useMemo(
    () => ({
      run: handleRun,
      share: handleShare,
      exportSTL: handleExportSTL,
      exportSTEP: handleExportSTEP,
      formatCode: handleFormat,
      toggleOutput: toggleConsole,
      toggleViewer: toggleViewer,
    }),
    [handleRun, handleShare, handleExportSTL, handleExportSTEP, handleFormat, toggleConsole, toggleViewer],
  );

  useKeyboardShortcuts(shortcutActions, shortcutDefs);

  return (
    <div className="relative flex h-screen flex-col bg-gray-950">
      <LoadingOverlay />
      <ToastContainer />

      <Toolbar
        onRun={handleRun}
        onExportSTL={handleExportSTL}
        onExportSTEP={handleExportSTEP}
        onShare={handleShare}
      />

      {pendingReview && (
        <div className="flex items-center gap-3 border-b border-amber-700/50 bg-amber-950/40 px-4 py-2">
          <span className="text-sm text-amber-200">
            Code loaded from a shared link. Review before running.
          </span>
          <button
            onClick={handleRun}
            className="rounded bg-amber-600 px-3 py-0.5 text-xs font-semibold text-white hover:bg-amber-500"
          >
            Run
          </button>
          <button
            onClick={() => { setPendingReview(false); }}
            className="text-xs text-amber-400 hover:text-amber-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <Group
        orientation="horizontal"
        defaultLayout={hLayout.defaultLayout}
        onLayoutChanged={hLayout.onLayoutChanged}
        className="flex-1 overflow-hidden"
      >
        {/* Left: editor + output */}
        <Panel id="editor-area" defaultSize="50%" minSize="20%">
          <Group
            orientation="vertical"
            defaultLayout={vLayout.defaultLayout}
            onLayoutChanged={vLayout.onLayoutChanged}
          >
            <Panel id="editor" defaultSize="80%" minSize="30%">
              <EditorPanel onCodeChange={handleCodeChange} onFormat={editorFormatFnRef} />
            </Panel>
            <Separator className="h-px bg-border-subtle" />
            <Panel
              id="console"
              panelRef={consolePanelRef}
              collapsible
              collapsedSize="3.5%"
              minSize="15%"
              defaultSize="20%"
              onResize={handleConsoleResize}
            >
              {isConsoleCollapsed ? (
                <CollapsedConsoleBar onExpand={toggleConsole} />
              ) : (
                <OutputPanel onCollapse={toggleConsole} />
              )}
            </Panel>
          </Group>
        </Panel>

        <Separator className="w-px bg-border-subtle" />

        {/* Right: 3D viewer */}
        <Panel
          id="viewer"
          panelRef={viewerPanelRef}
          collapsible
          collapsedSize="0%"
          minSize="20%"
          defaultSize="50%"
          onResize={handleViewerResize}
        >
          {isViewerCollapsed ? null : <ViewerPanel />}
        </Panel>
      </Group>

      <StatusBar />
    </div>
  );
}
