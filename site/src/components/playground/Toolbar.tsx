import { Link } from 'react-router-dom';
import { useEngineStore } from '../../stores/engineStore';

interface ToolbarProps {
  onRun: () => void;
  onExportSTL: () => void;
  onShare: () => void;
  onToggleExamples: () => void;
  showExamples: boolean;
}

export default function Toolbar({
  onRun,
  onExportSTL,
  onShare,
  onToggleExamples,
  showExamples,
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

        <button
          onClick={onToggleExamples}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            showExamples
              ? 'bg-surface-overlay text-white'
              : 'text-gray-400 hover:bg-surface-overlay hover:text-white'
          }`}
        >
          Examples
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRun}
          disabled={!engineReady}
          className="flex items-center gap-1.5 rounded bg-indigo-primary px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-indigo-dark disabled:opacity-40"
        >
          Run
        </button>
        <button
          onClick={onShare}
          disabled={!engineReady}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          Share
        </button>
        <button
          onClick={onExportSTL}
          disabled={!engineReady}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          Export STL
        </button>
      </div>
    </div>
  );
}
