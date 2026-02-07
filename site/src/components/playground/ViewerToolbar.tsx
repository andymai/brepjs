import { useViewerStore } from '../../stores/viewerStore';

export default function ViewerToolbar() {
  const showWireframe = useViewerStore((s) => s.showWireframe);
  const showEdges = useViewerStore((s) => s.showEdges);
  const showGrid = useViewerStore((s) => s.showGrid);
  const toggleWireframe = useViewerStore((s) => s.toggleWireframe);
  const toggleEdges = useViewerStore((s) => s.toggleEdges);
  const toggleGrid = useViewerStore((s) => s.toggleGrid);
  const requestFit = useViewerStore((s) => s.requestFit);

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col gap-1">
      <ToolbarButton onClick={requestFit} label="Fit" active={false} />
      <ToolbarButton onClick={toggleWireframe} label="Wire" active={showWireframe} />
      <ToolbarButton onClick={toggleEdges} label="Edges" active={showEdges} />
      <ToolbarButton onClick={toggleGrid} label="Grid" active={showGrid} />
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
      className={`pointer-events-auto rounded px-2 py-1 text-xs font-medium transition-colors ${
        active
          ? 'bg-indigo-primary/20 text-indigo-light'
          : 'bg-surface/70 text-gray-500 hover:text-gray-300'
      } border border-border-subtle backdrop-blur-sm`}
    >
      {label}
    </button>
  );
}
