import { Link } from 'react-router-dom';
import { useEngineStore } from '../../stores/engineStore';
import { SHORTCUTS, formatShortcut } from '../../lib/shortcuts';

interface ToolbarProps {
  onRun: () => void;
  onExportSTL: () => void;
  onExportSTEP: () => void;
  onShare: () => void;
}

export default function Toolbar({
  onRun,
  onExportSTL,
  onExportSTEP,
  onShare,
}: ToolbarProps) {
  const engineReady = useEngineStore((s) => s.status === 'ready');

  return (
    <div className="flex h-11 items-center justify-between border-b border-border-subtle bg-surface px-3">
      <div className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-1.5 text-sm font-bold">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-indigo-primary text-xs font-bold text-white">
            b
          </span>
          <span className="text-gray-400">brepjs</span>
        </Link>

        <div className="mx-2 h-4 w-px bg-border-subtle" />

        <span className="text-xs font-medium text-gray-400">Playground</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRun}
          disabled={!engineReady}
          title={`Run (${formatShortcut(SHORTCUTS.run)})`}
          className="flex items-center gap-1.5 rounded bg-indigo-primary px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-dark disabled:opacity-40"
        >
          Run
        </button>
        <button
          onClick={onShare}
          disabled={!engineReady}
          title={`Share (${formatShortcut(SHORTCUTS.share)})`}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          Share
        </button>
        <button
          onClick={onExportSTL}
          disabled={!engineReady}
          title={`Export STL (${formatShortcut(SHORTCUTS.exportSTL)})`}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          STL
        </button>
        <button
          onClick={onExportSTEP}
          disabled={!engineReady}
          title="Export STEP"
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          STEP
        </button>
      </div>
    </div>
  );
}
