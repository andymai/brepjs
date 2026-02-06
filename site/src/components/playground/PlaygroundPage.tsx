import { useCallback, useEffect } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useCodeExecution } from '../../hooks/useCodeExecution';
import { useUrlState } from '../../hooks/useUrlState';
import { useHeroMesh } from '../../hooks/useHeroMesh';
import Toolbar from './Toolbar';
import EditorPanel from './EditorPanel';
import ViewerPanel from './ViewerPanel';
import OutputPanel from './OutputPanel';
import StatusBar from './StatusBar';
import LoadingOverlay from './LoadingOverlay';

export default function PlaygroundPage() {
  const code = usePlaygroundStore((s) => s.code);
  const meshes = usePlaygroundStore((s) => s.meshes);
  const setMeshes = usePlaygroundStore((s) => s.setMeshes);
  const pendingReview = usePlaygroundStore((s) => s.pendingReview);
  const setPendingReview = usePlaygroundStore((s) => s.setPendingReview);
  const { runCode, exportSTL, debouncedRun } = useCodeExecution();
  const { updateUrl, copyShareUrl } = useUrlState();
  const heroMesh = useHeroMesh();

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
  }, [exportSTL, code]);

  const handleShare = useCallback(() => {
    copyShareUrl(code);
  }, [copyShareUrl, code]);

  return (
    <div className="relative flex h-screen flex-col bg-gray-950">
      <LoadingOverlay />

      <Toolbar
        onRun={handleRun}
        onExportSTL={handleExportSTL}
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
            onClick={() => setPendingReview(false)}
            className="text-xs text-amber-400 hover:text-amber-200"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: editor + output */}
        <div className="flex w-1/2 flex-col border-r border-border-subtle">
          <div className="flex-1 overflow-hidden">
            <EditorPanel onCodeChange={handleCodeChange} />
          </div>
          <div className="h-[20%] min-h-[80px] border-t border-border-subtle">
            <OutputPanel />
          </div>
        </div>

        {/* Right: 3D viewer */}
        <div className="w-1/2">
          <ViewerPanel />
        </div>
      </div>

      <StatusBar />
    </div>
  );
}
