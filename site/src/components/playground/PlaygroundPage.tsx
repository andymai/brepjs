import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';
import { useToastStore } from '../../stores/toastStore';
import { useCodeExecution } from '../../hooks/useCodeExecution';
import { useUrlState } from '../../hooks/useUrlState';
import { useDraftPersistence, clearDraft } from '../../hooks/useDraftPersistence';
import { useApplyPendingSelections } from '../../hooks/useApplyPendingSelections';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { SHORTCUTS, formatShortcut } from '../../lib/shortcuts';
import { startWASMPreload } from '../../lib/wasmPreloader.js';
import { DEFAULT_CODE } from '../../lib/constants';
import { copyToClipboard } from '../../lib/copyToClipboard';
import { useScreenshot } from '../../hooks/useScreenshot';
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
  const setEditorCollapsed = usePlaygroundStore((s) => s.setEditorCollapsed);
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const error = usePlaygroundStore((s) => s.error);
  const addToast = useToastStore((s) => s.addToast);
  const { runCode, exportSTL, exportSTEP, debouncedRun } = useCodeExecution();
  const { updateUrl, copyShareUrl } = useUrlState();
  useDraftPersistence();
  useApplyPendingSelections();

  const consolePanelRef = usePanelRef();
  const viewerPanelRef = usePanelRef();
  const editorAreaPanelRef = usePanelRef();
  // Mutable ref to hold the editor format function, set by EditorPanel
  const editorFormatFnRef = useMemo(() => ({ current: null as (() => void) | null }), []);
  // Mutable ref for the editor's jump-to-line bridge (used by OutputPanel).
  const editorJumpToLineRef = useMemo(
    () => ({ current: null as ((line: number) => void) | null }),
    []
  );

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

  const handleScreenshot = useScreenshot();

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

  const toggleEditor = useCallback(() => {
    const panel = editorAreaPanelRef.current;
    if (!panel) return;
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [editorAreaPanelRef]);

  const handleFormat = useCallback(() => {
    editorFormatFnRef.current?.();
  }, [editorFormatFnRef]);

  const handleJumpToLine = useCallback(
    (line: number) => {
      editorJumpToLineRef.current?.(line);
    },
    [editorJumpToLineRef]
  );

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

  const handleEditorAreaResize = useCallback(
    (size: { asPercentage: number }) => {
      setEditorCollapsed(size.asPercentage <= 1);
    },
    [setEditorCollapsed]
  );

  const openCommandPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  const openShortcutHelp = useCallback(() => {
    setShortcutHelpOpen(true);
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
      toggleEditor: toggleEditor,
      commandPalette: openCommandPalette,
      cycleViewMode: cycleViewMode,
    }),
    [
      handleRun,
      handleShare,
      handleExportSTL,
      handleExportSTEP,
      handleFormat,
      toggleConsole,
      toggleViewer,
      toggleEditor,
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
        id: 'toggleEditor',
        group: 'Layout',
        label: 'Toggle editor',
        keys: formatShortcut(SHORTCUTS.toggleEditor!),
        run: toggleEditor,
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
      {
        id: 'cycle-view',
        group: 'View',
        label: 'Cycle view mode',
        keys: formatShortcut(SHORTCUTS.cycleViewMode!),
        run: cycleViewMode,
      },
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
      { id: 'screenshot', group: 'Camera', label: 'Save screenshot (PNG)', run: handleScreenshot },
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
        run: openShortcutHelp,
      },
    ],
    [
      handleRun,
      handleShare,
      openShortcutHelp,
      handleResetToDefault,
      handleResetViewer,
      handleScreenshot,
      handleCopyCode,
      clearSelections,
      handleExportSTL,
      handleExportSTEP,
      handleFormat,
      toggleConsole,
      toggleViewer,
      toggleEditor,
      setViewMode,
      cycleViewMode,
      toggleEdges,
      toggleGrid,
      toggleProjection,
      requestFit,
      setCameraPreset,
    ]
  );

  // Auto-expand console + editor on the *transition* into an error — not on
  // every render while an error persists. Without the wasErrorRef guard, a
  // user who collapses the editor for a screenshot while an error is on
  // screen would see the panel snap back open immediately, since the effect
  // would re-fire as `isEditorCollapsed` flips.
  const wasErrorRef = useRef(false);
  useEffect(() => {
    const isError = !!error;
    if (isError && !wasErrorRef.current) {
      if (consolePanelRef.current?.isCollapsed()) consolePanelRef.current.expand();
      if (editorAreaPanelRef.current?.isCollapsed()) editorAreaPanelRef.current.expand();
    }
    wasErrorRef.current = isError;
  }, [error, consolePanelRef, editorAreaPanelRef]);

  return (
    <div className="relative flex h-screen flex-col bg-gray-950">
      <LoadingOverlay />
      <ToastContainer />

      <Toolbar
        onRun={handleRun}
        onExportSTL={handleExportSTL}
        onExportSTEP={handleExportSTEP}
        onShare={handleShare}
        onOpenCommandPalette={openCommandPalette}
        onOpenHelp={openShortcutHelp}
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
        <Panel
          id="editor-area"
          panelRef={editorAreaPanelRef}
          collapsible
          collapsedSize="0%"
          minSize="20%"
          defaultSize="50%"
          onResize={handleEditorAreaResize}
        >
          {/* Always-mounted: collapsing this Panel sends its width to 0% but
              we keep Monaco rendered so its undo stack, cursor position, and
              scroll state survive a toggle. The 0%-wide container hides the
              editor visually without remounting it. */}
          <Group
            orientation="vertical"
            defaultLayout={vLayout.defaultLayout}
            onLayoutChanged={vLayout.onLayoutChanged}
          >
            <Panel id="editor" defaultSize="80%" minSize="30%">
              <EditorPanel
                onCodeChange={handleCodeChange}
                onFormat={editorFormatFnRef}
                jumpToLineRef={editorJumpToLineRef}
              />
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
                <OutputPanel onCollapse={toggleConsole} onJumpToLine={handleJumpToLine} />
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
