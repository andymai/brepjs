import { useState, useCallback, useEffect } from 'react';
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
import ExamplePicker from './ExamplePicker';

export default function PlaygroundPage() {
  const code = usePlaygroundStore((s) => s.code);
  const meshes = usePlaygroundStore((s) => s.meshes);
  const setMeshes = usePlaygroundStore((s) => s.setMeshes);
  const { runCode, exportSTL, debouncedRun } = useCodeExecution();
  const { updateUrl, copyShareUrl } = useUrlState();
  const [showExamples, setShowExamples] = useState(false);
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
    runCode(code);
    updateUrl(code);
  }, [runCode, code, updateUrl]);

  const handleExportSTL = useCallback(() => {
    exportSTL(code);
  }, [exportSTL, code]);

  const handleShare = useCallback(() => {
    copyShareUrl(code);
  }, [copyShareUrl, code]);

  return (
    <div className="relative flex h-screen flex-col bg-gray-950">
      <LoadingOverlay />

      <div className="relative">
        <Toolbar
          onRun={handleRun}
          onExportSTL={handleExportSTL}
          onShare={handleShare}
          onToggleExamples={() => setShowExamples((v) => !v)}
          showExamples={showExamples}
        />
        {showExamples && (
          <ExamplePicker
            onClose={() => setShowExamples(false)}
            onSelect={(code) => runCode(code)}
          />
        )}
      </div>

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
