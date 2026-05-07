import { useEngineStore } from '../../stores/engineStore';
import { SHORTCUTS, formatShortcut } from '../../lib/shortcuts';
import Logo from '../shared/Logo';

interface ToolbarProps {
  onRun: () => void;
  onExportSTL: () => void;
  onExportSTEP: () => void;
  onShare: () => void;
  isRunning: boolean;
}

export default function Toolbar({
  onRun,
  onExportSTL,
  onExportSTEP,
  onShare,
  isRunning,
}: ToolbarProps) {
  const engineReady = useEngineStore((s) => s.status === 'ready');

  return (
    <div className="flex h-11 items-center justify-between border-b border-border-subtle bg-surface px-3">
      <div className="flex items-center gap-2">
        <a href="/" className="flex items-center gap-1.5 text-sm font-bold" aria-label="Back to brepjs docs">
          <Logo className="h-6 w-6" />
          <span className="text-gray-400">brepjs</span>
        </a>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRun}
          disabled={!engineReady || isRunning}
          title={`Run (${formatShortcut(SHORTCUTS.run)})`}
          className={`flex items-center gap-1.5 rounded bg-teal-primary px-3 py-1 text-xs font-semibold text-gray-950 transition-colors hover:bg-teal-dark disabled:opacity-40 ${isRunning ? 'animate-pulse' : ''}`}
        >
          {isRunning ? 'Running...' : 'Run'}
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
          disabled={!engineReady || isRunning}
          title={`Export STL (${formatShortcut(SHORTCUTS.exportSTL)})`}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          STL
        </button>
        <button
          onClick={onExportSTEP}
          disabled={!engineReady || isRunning}
          title={`Export STEP (${formatShortcut(SHORTCUTS.exportSTEP)})`}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          STEP
        </button>
      </div>
    </div>
  );
}
