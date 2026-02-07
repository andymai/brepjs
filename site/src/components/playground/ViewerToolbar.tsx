import { useViewerStore, type CameraPreset } from '../../stores/viewerStore';

export default function ViewerToolbar() {
  const showWireframe = useViewerStore((s) => s.showWireframe);
  const showEdges = useViewerStore((s) => s.showEdges);
  const showGrid = useViewerStore((s) => s.showGrid);
  const activePreset = useViewerStore((s) => s.activePreset);
  const toggleWireframe = useViewerStore((s) => s.toggleWireframe);
  const toggleEdges = useViewerStore((s) => s.toggleEdges);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const requestFit = useViewerStore((s) => s.requestFit);
  const setCameraPreset = useViewerStore((s) => s.setCameraPreset);

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col gap-1">
      <ToolbarButton onClick={requestFit} label="Fit" active={false} />
      <ToolbarButton onClick={toggleWireframe} label="Wire" active={showWireframe} />
      <ToolbarButton onClick={toggleEdges} label="Edges" active={showEdges} />
      <ToolbarButton onClick={toggleGrid} label="Grid" active={showGrid} />
      <div className="my-1 border-t border-border-subtle" />
      <PresetButton preset="front" label="Front" active={activePreset} onClick={setCameraPreset} />
      <PresetButton preset="side" label="Side" active={activePreset} onClick={setCameraPreset} />
      <PresetButton preset="top" label="Top" active={activePreset} onClick={setCameraPreset} />
      <PresetButton
        preset="isometric"
        label="Iso"
        active={activePreset}
        onClick={setCameraPreset}
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  active,
}: {
  onClick: () => void;
  label: string;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`pointer-events-auto rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-teal-primary/20 text-teal-light'
          : 'bg-surface/70 text-gray-500 hover:text-gray-300'
      } border border-border-subtle backdrop-blur-sm`}
    >
      {label}
    </button>
  );
}

function PresetButton({
  preset,
  label,
  active,
  onClick,
}: {
  preset: CameraPreset;
  label: string;
  active: CameraPreset | null;
  onClick: (preset: CameraPreset) => void;
}) {
  return (
    <button
      onClick={() => {
        onClick(preset);
      }}
      aria-pressed={active === preset}
      className={`pointer-events-auto rounded px-2 py-1 text-xs font-medium transition-colors ${
        active === preset
          ? 'bg-teal-primary/20 text-teal-light'
          : 'bg-surface/70 text-gray-500 hover:text-gray-300'
      } border border-border-subtle backdrop-blur-sm`}
    >
      {label}
    </button>
  );
}
