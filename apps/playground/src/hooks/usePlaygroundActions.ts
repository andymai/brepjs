import { useCallback, useMemo } from 'react';
import { track } from '@vercel/analytics';
import { usePlaygroundStore } from '../stores/playgroundStore';
import { useToastStore } from '../stores/toastStore';
import { useViewerStore } from '../stores/viewerStore';
import { useCodeExecution } from './useCodeExecution';
import { useUrlState } from './useUrlState';
import { useScreenshot } from './useScreenshot';
import { clearDraft } from './useDraftPersistence';
import { copyToClipboard } from '../lib/copyToClipboard';
import { DEFAULT_CODE } from '../lib/constants';
import type { Example } from '../lib/examples';

export interface PlaygroundActions {
  onCodeChange: (code: string) => void;
  handleRun: () => void;
  handleShare: () => void;
  handleExportSTL: () => void;
  handleExportSTEP: () => void;
  handleCopyCode: () => void;
  handleResetToDefault: () => void;
  handleResetViewer: () => void;
  handleScreenshot: () => void;
  handleLoadExample: (example: Example) => void;
}

export function usePlaygroundActions(): PlaygroundActions {
  const code = usePlaygroundStore((s) => s.code);
  const addToast = useToastStore((s) => s.addToast);
  const { runCode, exportSTL, exportSTEP, debouncedRun } = useCodeExecution();
  const { updateUrl, copyShareUrl } = useUrlState();
  const handleScreenshot = useScreenshot();
  const resetViewerDefaults = useViewerStore((s) => s.resetViewerDefaults);

  const onCodeChange = useCallback(
    (newCode: string) => {
      debouncedRun(newCode);
    },
    [debouncedRun]
  );

  const handleRun = useCallback(() => {
    runCode(code);
    updateUrl(code);
    track('playground_run');
  }, [runCode, code, updateUrl]);

  const handleExportSTL = useCallback(() => {
    exportSTL(code);
    addToast('Exporting STL...');
    track('playground_export', { format: 'stl' });
  }, [exportSTL, code, addToast]);

  const handleExportSTEP = useCallback(() => {
    exportSTEP(code);
    addToast('Exporting STEP...');
    track('playground_export', { format: 'step' });
  }, [exportSTEP, code, addToast]);

  const handleShare = useCallback(() => {
    void copyShareUrl(code);
    addToast('Link copied to clipboard');
    track('playground_share');
  }, [copyShareUrl, code, addToast]);

  const handleResetToDefault = useCallback(() => {
    usePlaygroundStore.getState().setCode(DEFAULT_CODE);
    clearDraft();
    addToast('Reset to default code');
  }, [addToast]);

  // Loading swaps the editor buffer through the store; EditorPanel's sync
  // effect picks it up and replaces content via Monaco's pushEditOperations,
  // which preserves the undo stack — Cmd+Z restores prior work if the user
  // overwrites edits by accident.
  const handleLoadExample = useCallback(
    (example: Example) => {
      usePlaygroundStore.getState().setCode(example.code);
      addToast(`Loaded: ${example.label}`);
    },
    [addToast]
  );

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

  return useMemo(
    () => ({
      onCodeChange,
      handleRun,
      handleShare,
      handleExportSTL,
      handleExportSTEP,
      handleCopyCode,
      handleResetToDefault,
      handleResetViewer,
      handleScreenshot,
      handleLoadExample,
    }),
    [
      onCodeChange,
      handleRun,
      handleShare,
      handleExportSTL,
      handleExportSTEP,
      handleCopyCode,
      handleResetToDefault,
      handleResetViewer,
      handleScreenshot,
      handleLoadExample,
    ]
  );
}
