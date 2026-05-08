import { useEffect, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

type PanelRef = React.RefObject<PanelImperativeHandle | null>;

// Auto-expand console + editor on the *transition* into an error — not on
// every render while an error persists. Without the wasErrorRef guard, a
// user who collapses the editor for a screenshot while an error is on
// screen would see the panel snap back open immediately, since the effect
// would re-fire as `isEditorCollapsed` flips.
export function useAutoExpandOnError(
  error: string | null,
  consolePanelRef: PanelRef,
  editorAreaPanelRef: PanelRef
): void {
  const wasErrorRef = useRef(false);
  useEffect(() => {
    const isError = !!error;
    if (isError && !wasErrorRef.current) {
      if (consolePanelRef.current?.isCollapsed()) consolePanelRef.current.expand();
      if (editorAreaPanelRef.current?.isCollapsed()) editorAreaPanelRef.current.expand();
    }
    wasErrorRef.current = isError;
  }, [error, consolePanelRef, editorAreaPanelRef]);
}
