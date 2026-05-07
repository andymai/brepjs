import { useCallback, useMemo, useEffect, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';
import { useToastStore } from '../../stores/toastStore';
import { useCodeExecution } from '../../hooks/useCodeExecution';
import { useUrlState } from '../../hooks/useUrlState';
import { useDraftPersistence, clearDraft } from '../../hooks/useDraftPersistence';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { SHORTCUTS, formatShortcut } from '../../lib/shortcuts';
import { startWASMPreload } from '../../lib/wasmPreloader.js';
import { DEFAULT_CODE } from '../../lib/constants';
import { copyToClipboard } from '../../lib/copyToClipboard';
import Toolbar from './Toolbar';
import EditorPanel from './EditorPanel';
import ViewerPanel from './ViewerPanel';
import OutputPanel from './OutputPanel';
import StatusBar from './StatusBar';
import LoadingOverlay from './LoadingOverlay';
import CollapsedConsoleBar from './CollapsedConsoleBar';
import ShortcutHelp from './ShortcutHelp';
import CommandPalette, { type Command } from './CommandPalette';
import ToastContainer from '../shared/ToastContainer';

const shortcutDefs = Object.values(SHORTCUTS);

export default function PlaygroundPage() {
  const code = usePlaygroundStore((s) => s.code);
  const pendingReview = usePlaygroundStore((s) => s.pendingReview);
  const setPendingReview = usePlaygroundStore((s) => s.setPendingReview);
  const isConsoleCollapsed = usePlaygroundStore((s) => s.isConsoleCollapsed);
  const setConsoleCollapsed = usePlaygroundStore((s) => s.setConsoleCollapsed);
  const isViewerCollapsed = usePlaygroundStore((s) => s.isViewerCollapsed);
  const setViewerCollapsed = usePlaygroundStore((s) => s.setViewerCollapsed);
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const error = usePlaygroundStore((s) => s.error);
  const addToast = useToastStore((s) => s.addToast);
  const { runCode, exportSTL, exportSTEP, debouncedRun } = useCodeExecution();
  const { updateUrl, copyShareUrl } = useUrlState();
  useDraftPersistence();

  const consolePanelRef = usePanelRef();
  const viewerPanelRef = usePanelRef();
  // Mutable ref to hold the editor format function, set by EditorPanel
  const editorFormatFnRef = useMemo(() => ({ current: null as (() => void) | null }), []);

  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const setViewMode = useViewerStore((s) => s.setViewMode);
  const cycleViewMode = useViewerStore((s) => s.cycleViewMode);
  const toggleEdges = useViewerStore((s) => s.toggleEdges);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const toggleProjection = useViewerStore((s) => s.toggleProjection);
  const resetViewerDefaults = useViewerStore((s) => s.resetViewerDefaults);
  const requestFit = useViewerStore((s) => s.requestFit);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const clearSelections = usePlaygroundStore((s) => s.clearSelections);

  // Layout persistence
  const storage = typeof window !== 'undefined' ? localStorage : undefined;
  const hLayout = useDefaultLayout({ id: 'playground-h', storage });
  const vLayout = useDefaultLayout({ id: 'playground-v', storage });

  // Preload WASM files in background when playground mounts
  useEffect(() => {
    startWASMPreload();
  }, []);

  const handleCodeChange = useCallback(
    (newCode: string) => {
      debouncedRun(newCode);
    },
    [debouncedRun]
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
    void copyShareUrl(code);
    addToast('Link copied to clipboard');
  }, [copyShareUrl, code, addToast]);

  const handleResetToDefault = useCallback(() => {
    usePlaygroundStore.getState().setCode(DEFAULT_CODE);
    clearDraft();
    addToast('Reset to default code');
  }, [addToast]);

  // copyToClipboard handles both undefined `navigator.clipboard` (HTTP /
  // sandboxed iframe / older browsers) and a sync throw — neither of which
  // a bare `navigator.clipboard?.writeText(...).then(...)` chain catches.
  const handleCopyCode = useCallback(() => {
    void copyToClipboard(code).then((copied) => {
      addToast(copied ? 'Code copied to clipboard' : 'Clipboard unavailable');
    });
  }, [code, addToast]);

  const handleResetViewer = useCallback(() => {
    resetViewerDefaults();
    addToast('Viewer settings reset');
  }, [resetViewerDefaults, addToast]);

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
    [setConsoleCollapsed]
  );

  const handleViewerResize = useCallback(
    (size: { asPercentage: number }) => {
      setViewerCollapsed(size.asPercentage <= 1);
    },
    [setViewerCollapsed]
  );

  const openCommandPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  const shortcutActions = useMemo(
    () => ({
      run: handleRun,
      share: handleShare,
      exportSTL: handleExportSTL,
      exportSTEP: handleExportSTEP,
      formatCode: handleFormat,
      toggleOutput: toggleConsole,
      toggleViewer: toggleViewer,
      commandPalette: openCommandPalette,
    }),
    [
      handleRun,
      handleShare,
      handleExportSTL,
      handleExportSTEP,
      handleFormat,
      toggleConsole,
      toggleViewer,
      openCommandPalette,
    ]
  );

  useKeyboardShortcuts(shortcutActions, shortcutDefs);

  // `?` opens the shortcut help. Lives outside useKeyboardShortcuts because it
  // has no modifier, so it would clobber typed `?` characters in the editor.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable) return;
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (target.closest('.monaco-editor')) return;
      }
      e.preventDefault();
      setShortcutHelpOpen((o) => !o);
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, []);

  const commands: Command[] = useMemo(
    () => [
      {
        id: 'run',
        group: 'Run',
        label: 'Run code',
        keys: formatShortcut(SHORTCUTS.run!),
        run: handleRun,
      },
      {
        id: 'share',
        group: 'Run',
        label: 'Share link',
        keys: formatShortcut(SHORTCUTS.share!),
        run: handleShare,
      },
      {
        id: 'exportSTL',
        group: 'Export',
        label: 'Export STL',
        keys: formatShortcut(SHORTCUTS.exportSTL!),
        run: handleExportSTL,
      },
      {
        id: 'exportSTEP',
        group: 'Export',
        label: 'Export STEP',
        keys: formatShortcut(SHORTCUTS.exportSTEP!),
        run: handleExportSTEP,
      },
      {
        id: 'format',
        group: 'Editor',
        label: 'Format code',
        keys: formatShortcut(SHORTCUTS.formatCode!),
        run: handleFormat,
      },
      {
        id: 'toggleConsole',
        group: 'Layout',
        label: 'Toggle console',
        keys: formatShortcut(SHORTCUTS.toggleOutput!),
        run: toggleConsole,
      },
      {
        id: 'toggleViewer',
        group: 'Layout',
        label: 'Toggle viewer',
        keys: formatShortcut(SHORTCUTS.toggleViewer!),
        run: toggleViewer,
      },
      {
        id: 'view-solid',
        group: 'View',
        label: 'View: Solid',
        run: () => {
          setViewMode('solid');
        },
      },
      {
        id: 'view-wire',
        group: 'View',
        label: 'View: Wireframe',
        run: () => {
          setViewMode('wireframe');
        },
      },
      {
        id: 'view-xray',
        group: 'View',
        label: 'View: X-ray',
        run: () => {
          setViewMode('xray');
        },
      },
      { id: 'cycle-view', group: 'View', label: 'Cycle view mode', run: cycleViewMode },
      { id: 'toggle-edges', group: 'View', label: 'Toggle edges', run: toggleEdges },
      { id: 'toggle-grid', group: 'View', label: 'Toggle grid', run: toggleGrid },
      {
        id: 'toggle-proj',
        group: 'View',
        label: 'Toggle projection (perspective/ortho)',
        run: toggleProjection,
      },
      {
        id: 'reset-viewer',
        group: 'View',
        label: 'Reset viewer to defaults',
        run: handleResetViewer,
      },
      { id: 'fit', group: 'Camera', label: 'Fit to view', run: requestFit },
      {
        id: 'cam-front',
        group: 'Camera',
        label: 'Front view',
        run: () => {
          setCameraPreset('front');
        },
      },
      {
        id: 'cam-side',
        group: 'Camera',
        label: 'Side view',
        run: () => {
          setCameraPreset('side');
        },
      },
      {
        id: 'cam-top',
        group: 'Camera',
        label: 'Top view',
        run: () => {
          setCameraPreset('top');
        },
      },
      {
        id: 'cam-iso',
        group: 'Camera',
        label: 'Isometric view',
        run: () => {
          setCameraPreset('isometric');
        },
      },
      {
        id: 'reset-default',
        group: 'Editor',
        label: 'Reset to default code',
        run: handleResetToDefault,
      },
      {
        id: 'copy-code',
        group: 'Editor',
        label: 'Copy code to clipboard',
        run: handleCopyCode,
      },
      {
        id: 'clear-selection',
        group: 'Selection',
        label: 'Clear selection',
        run: clearSelections,
      },
      {
        id: 'help',
        group: 'Help',
        label: 'Show keyboard shortcuts',
        keys: '?',
        run: () => {
          setShortcutHelpOpen(true);
        },
      },
    ],
    [
      handleRun,
      handleShare,
      handleResetToDefault,
      handleResetViewer,
      handleCopyCode,
      clearSelections,
      handleExportSTL,
      handleExportSTEP,
      handleFormat,
      toggleConsole,
      toggleViewer,
      setViewMode,
      cycleViewMode,
      toggleEdges,
      toggleGrid,
      toggleProjection,
      requestFit,
      setCameraPreset,
    ]
  );

  // Auto-expand console when error occurs
  useEffect(() => {
    if (error && isConsoleCollapsed) {
      const panel = consolePanelRef.current;
      if (panel?.isCollapsed()) {
        panel.expand();
      }
    }
  }, [error, isConsoleCollapsed, consolePanelRef]);

  return (
    <div className="relative flex h-screen flex-col bg-gray-950">
      <LoadingOverlay />
      <ToastContainer />

      <Toolbar
        onRun={handleRun}
        onExportSTL={handleExportSTL}
        onExportSTEP={handleExportSTEP}
        onShare={handleShare}
        isRunning={isRunning}
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
            onClick={() => {
              setPendingReview(false);
            }}
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

      <ShortcutHelp
        open={shortcutHelpOpen}
        onClose={() => {
          setShortcutHelpOpen(false);
        }}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => {
          setPaletteOpen(false);
        }}
        commands={commands}
      />
    </div>
  );
}
