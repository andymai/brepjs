import { useCallback, useMemo } from 'react';
import { usePanelRef, type PanelImperativeHandle } from 'react-resizable-panels';
import { usePlaygroundStore } from '../stores/playgroundStore';

type PanelRef = React.RefObject<PanelImperativeHandle | null>;

export interface PlaygroundPanels {
  consolePanelRef: PanelRef;
  viewerPanelRef: PanelRef;
  editorAreaPanelRef: PanelRef;
  toggleConsole: () => void;
  toggleViewer: () => void;
  toggleEditor: () => void;
  handleConsoleResize: (size: { asPercentage: number }) => void;
  handleViewerResize: (size: { asPercentage: number }) => void;
  handleEditorAreaResize: (size: { asPercentage: number }) => void;
}

function togglePanel(ref: PanelRef): void {
  const panel = ref.current;
  if (!panel) return;
  if (panel.isCollapsed()) panel.expand();
  else panel.collapse();
}

export function usePlaygroundPanels(): PlaygroundPanels {
  const consolePanelRef = usePanelRef();
  const viewerPanelRef = usePanelRef();
  const editorAreaPanelRef = usePanelRef();
  const setConsoleCollapsed = usePlaygroundStore((s) => s.setConsoleCollapsed);
  const setViewerCollapsed = usePlaygroundStore((s) => s.setViewerCollapsed);
  const setEditorCollapsed = usePlaygroundStore((s) => s.setEditorCollapsed);

  const toggleConsole = useCallback(() => {
    togglePanel(consolePanelRef);
  }, [consolePanelRef]);
  const toggleViewer = useCallback(() => {
    togglePanel(viewerPanelRef);
  }, [viewerPanelRef]);
  const toggleEditor = useCallback(() => {
    togglePanel(editorAreaPanelRef);
  }, [editorAreaPanelRef]);

  // The console's collapsedSize is 3.5%; ≤ 4% means it just collapsed.
  const handleConsoleResize = useCallback(
    (size: { asPercentage: number }) => {
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

  return useMemo(
    () => ({
      consolePanelRef,
      viewerPanelRef,
      editorAreaPanelRef,
      toggleConsole,
      toggleViewer,
      toggleEditor,
      handleConsoleResize,
      handleViewerResize,
      handleEditorAreaResize,
    }),
    [
      consolePanelRef,
      viewerPanelRef,
      editorAreaPanelRef,
      toggleConsole,
      toggleViewer,
      toggleEditor,
      handleConsoleResize,
      handleViewerResize,
      handleEditorAreaResize,
    ]
  );
}
