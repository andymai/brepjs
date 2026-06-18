import { useCallback, useEffect, useState } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';
import { useDraftPersistence } from '../../hooks/useDraftPersistence';
import { useApplyPendingSelections } from '../../hooks/useApplyPendingSelections';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useEditorBridges } from '../../hooks/useEditorBridges';
import { usePlaygroundPanels } from '../../hooks/usePlaygroundPanels';
import { usePlaygroundActions } from '../../hooks/usePlaygroundActions';
import { usePlaygroundCommands } from '../../hooks/usePlaygroundCommands';
import { useShortcutHelpKey } from '../../hooks/useShortcutHelpKey';
import { useAutoExpandOnError } from '../../hooks/useAutoExpandOnError';
import { useExampleRoute } from '../../hooks/useExampleRoute';
import { SHORTCUTS } from '../../lib/shortcuts';
import { EXAMPLES, type Example } from '../../lib/examples';
import { startWASMPreload } from '../../lib/wasmPreloader.js';
import Toolbar from './Toolbar';
import StatusBar from './StatusBar';
import LoadingOverlay from './LoadingOverlay';
import ShortcutHelp from './ShortcutHelp';
import CommandPalette from './CommandPalette';
import ExampleGallery from './ExampleGallery';
import MobileLayout from './MobileLayout';
import DesktopLayout from './DesktopLayout';
import ToastContainer from '../shared/ToastContainer';

const shortcutDefs = Object.values(SHORTCUTS);

export default function PlaygroundPage() {
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const error = usePlaygroundStore((s) => s.error);
  const cycleViewMode = useViewerStore((s) => s.cycleViewMode);
  useDraftPersistence();
  useApplyPendingSelections();

  const editorBridges = useEditorBridges();
  const panels = usePlaygroundPanels();
  const actions = usePlaygroundActions();
  const isMobile = useIsMobile();

  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const exampleRoute = useExampleRoute();

  // Loading from the gallery: load the code and leave the friendly permalink.
  const handleSelectExample = useCallback(
    (example: Example) => {
      actions.handleLoadExample(example);
      exampleRoute.selectExample(example.id);
    },
    [actions, exampleRoute]
  );

  const openCommandPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);
  const openShortcutHelp = useCallback(() => {
    setShortcutHelpOpen(true);
  }, []);
  const toggleShortcutHelp = useCallback(() => {
    setShortcutHelpOpen((o) => !o);
  }, []);

  // Preload WASM files in background when playground mounts
  useEffect(() => {
    startWASMPreload();
  }, []);

  // Deep link: landing on /playground/examples/<id> is a permalink to that
  // example — load it into the editor so the shared link opens the running part.
  // Runs once on mount; in-gallery navigation loads via onSelect instead.
  useEffect(() => {
    const id = exampleRoute.focusedId;
    if (!exampleRoute.open && id) {
      const example = EXAMPLES.find((e) => e.id === id);
      if (example) actions.handleLoadExample(example);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on initial deep-land
  }, []);

  useKeyboardShortcuts(
    {
      run: actions.handleRun,
      share: actions.handleShare,
      exportSTL: actions.handleExportSTL,
      exportSTEP: actions.handleExportSTEP,
      formatCode: editorBridges.onFormat,
      toggleOutput: panels.toggleConsole,
      toggleViewer: panels.toggleViewer,
      toggleEditor: panels.toggleEditor,
      commandPalette: openCommandPalette,
      examples: exampleRoute.openGallery,
      cycleViewMode,
    },
    shortcutDefs
  );

  useShortcutHelpKey(toggleShortcutHelp);
  useAutoExpandOnError(error, panels.consolePanelRef, panels.editorAreaPanelRef);

  const commands = usePlaygroundCommands({
    actions,
    panels,
    onFormat: editorBridges.onFormat,
    openShortcutHelp,
    openExampleGallery: exampleRoute.openGallery,
  });

  return (
    <div className="relative flex h-screen flex-col bg-gray-950">
      <LoadingOverlay />
      <ToastContainer />

      <Toolbar
        onRun={actions.handleRun}
        onExportSTL={actions.handleExportSTL}
        onExportSTEP={actions.handleExportSTEP}
        onExportDXF={actions.handleExportDXF}
        onExportIFC={actions.handleExportIFC}
        onShare={actions.handleShare}
        onOpenCommandPalette={openCommandPalette}
        onOpenHelp={openShortcutHelp}
        onOpenExamples={exampleRoute.openGallery}
        isRunning={isRunning}
        compact={isMobile}
      />

      {isMobile ? (
        <MobileLayout
          onCodeChange={actions.onCodeChange}
          editorFormatRef={editorBridges.formatRef}
          editorJumpToLineRef={editorBridges.jumpToLineRef}
        />
      ) : (
        <DesktopLayout
          panels={panels}
          onCodeChange={actions.onCodeChange}
          formatRef={editorBridges.formatRef}
          jumpToLineRef={editorBridges.jumpToLineRef}
          onJumpToLine={editorBridges.onJumpToLine}
        />
      )}

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
      <ExampleGallery
        open={exampleRoute.open}
        focusedId={exampleRoute.focusedId}
        onClose={exampleRoute.closeGallery}
        onSelect={handleSelectExample}
        onFocusExample={exampleRoute.focusExample}
      />
    </div>
  );
}
