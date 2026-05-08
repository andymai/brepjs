import { useCallback, useMemo } from 'react';

export interface EditorBridges {
  formatRef: { current: (() => void) | null };
  jumpToLineRef: { current: ((line: number) => void) | null };
  onFormat: () => void;
  onJumpToLine: (line: number) => void;
}

export function useEditorBridges(): EditorBridges {
  const formatRef = useMemo(() => ({ current: null as (() => void) | null }), []);
  const jumpToLineRef = useMemo(
    () => ({ current: null as ((line: number) => void) | null }),
    []
  );
  const onFormat = useCallback(() => {
    formatRef.current?.();
  }, [formatRef]);
  const onJumpToLine = useCallback(
    (line: number) => {
      jumpToLineRef.current?.(line);
    },
    [jumpToLineRef]
  );
  return { formatRef, jumpToLineRef, onFormat, onJumpToLine };
}
