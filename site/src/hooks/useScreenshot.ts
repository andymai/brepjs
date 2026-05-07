import { useCallback } from 'react';
import { useToastStore } from '../stores/toastStore';
import { downloadViewerScreenshot } from '../lib/screenshot';

// Shared hook so the viewer toolbar button and the command palette entry
// stay in sync — toast text used to live in two places, which would have
// drifted on the next copy edit.
export function useScreenshot(): () => void {
  const addToast = useToastStore((s) => s.addToast);
  return useCallback(() => {
    void downloadViewerScreenshot().then((ok) => {
      addToast(ok ? 'Screenshot saved' : 'Screenshot failed');
    });
  }, [addToast]);
}
