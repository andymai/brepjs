import { useMemo } from 'react';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useViewerStore } from '../stores/viewerStore';
import { SHORTCUTS, formatShortcut } from '../lib/shortcuts';
import { EXAMPLES } from '../lib/examples';
import type { Command } from '../components/playground/CommandPalette';
import type { PlaygroundActions } from './usePlaygroundActions';
import type { PlaygroundPanels } from './usePlaygroundPanels';

interface Args {
  actions: PlaygroundActions;
  panels: PlaygroundPanels;
  onFormat: () => void;
  openShortcutHelp: () => void;
}

export function usePlaygroundCommands({
  actions,
  panels,
  onFormat,
  openShortcutHelp,
}: Args): Command[] {
  const setViewMode = useViewerStore((s) => s.setViewMode);
  const cycleViewMode = useViewerStore((s) => s.cycleViewMode);
  const toggleEdges = useViewerStore((s) => s.toggleEdges);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const toggleProjection = useViewerStore((s) => s.toggleProjection);
  const requestFit = useViewerStore((s) => s.requestFit);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);
  const clearSelections = usePlaygroundStore((s) => s.clearSelections);

  return useMemo(
    () => [
      {
        id: 'run',
        group: 'Run',
        label: 'Run code',
        keys: formatShortcut(SHORTCUTS.run),
        run: actions.handleRun,
      },
      {
        id: 'share',
        group: 'Run',
        label: 'Share link',
        keys: formatShortcut(SHORTCUTS.share),
        run: actions.handleShare,
      },
      {
        id: 'exportSTL',
        group: 'Export',
        label: 'Export STL',
        keys: formatShortcut(SHORTCUTS.exportSTL),
        run: actions.handleExportSTL,
      },
      {
        id: 'exportSTEP',
        group: 'Export',
        label: 'Export STEP',
        keys: formatShortcut(SHORTCUTS.exportSTEP),
        run: actions.handleExportSTEP,
      },
      {
        id: 'format',
        group: 'Editor',
        label: 'Format code',
        keys: formatShortcut(SHORTCUTS.formatCode),
        run: onFormat,
      },
      {
        id: 'toggleConsole',
        group: 'Layout',
        label: 'Toggle console',
        keys: formatShortcut(SHORTCUTS.toggleOutput),
        run: panels.toggleConsole,
      },
      {
        id: 'toggleViewer',
        group: 'Layout',
        label: 'Toggle viewer',
        keys: formatShortcut(SHORTCUTS.toggleViewer),
        run: panels.toggleViewer,
      },
      {
        id: 'toggleEditor',
        group: 'Layout',
        label: 'Toggle editor',
        keys: formatShortcut(SHORTCUTS.toggleEditor),
        run: panels.toggleEditor,
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
        keys: formatShortcut(SHORTCUTS.cycleViewMode),
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
        run: actions.handleResetViewer,
      },
      { id: 'fit', group: 'Camera', label: 'Fit to view', run: requestFit },
      {
        id: 'screenshot',
        group: 'Camera',
        label: 'Save screenshot (PNG)',
        run: actions.handleScreenshot,
      },
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
        run: actions.handleResetToDefault,
      },
      {
        id: 'copy-code',
        group: 'Editor',
        label: 'Copy code to clipboard',
        run: actions.handleCopyCode,
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
      ...EXAMPLES.map((ex) => ({
        id: `example-${ex.id}`,
        group: 'Examples',
        label: `Load: ${ex.label}`,
        run: () => {
          actions.handleLoadExample(ex);
        },
      })),
    ],
    [
      actions,
      panels,
      onFormat,
      openShortcutHelp,
      clearSelections,
      setViewMode,
      cycleViewMode,
      toggleEdges,
      toggleGrid,
      toggleProjection,
      requestFit,
      setCameraPreset,
    ]
  );
}
