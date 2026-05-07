import { useEngineStore } from '../../stores/engineStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { SHORTCUTS, formatShortcut } from '../../lib/shortcuts';
import Logo from '../shared/Logo';

interface ToolbarProps {
  onRun: () => void;
  onExportSTL: () => void;
  onExportSTEP: () => void;
  onShare: () => void;
  onOpenCommandPalette: () => void;
  onOpenHelp: () => void;
  isRunning: boolean;
}

export default function Toolbar({
  onRun,
  onExportSTL,
  onExportSTEP,
  onShare,
  onOpenCommandPalette,
  onOpenHelp,
  isRunning,
}: ToolbarProps) {
  const engineReady = useEngineStore((s) => s.status === 'ready');
  const selectionCount = usePlaygroundStore((s) => s.selections.length);
  const clearSelections = usePlaygroundStore((s) => s.clearSelections);

  return (
    <div className="flex h-11 items-center justify-between border-b border-border-subtle bg-surface px-3">
      <div className="flex items-center gap-2">
        <a
          href="/"
          className="flex items-center gap-1.5 text-sm font-bold"
          aria-label="Back to brepjs docs"
        >
          <Logo className="h-6 w-6" />
          <span className="text-gray-400">brepjs</span>
        </a>
        {selectionCount > 0 && (
          <button
            onClick={clearSelections}
            title="Click to clear selection"
            className="flex items-center gap-1 rounded-full border border-teal-primary/30 bg-teal-primary/15 px-2 py-0.5 text-[10px] font-semibold text-teal-light transition-colors hover:bg-teal-primary/25"
          >
            <span>{selectionCount} selected</span>
            <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 opacity-70" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        )}
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
        <div className="mx-1 h-4 w-px bg-border-subtle" />
        <button
          onClick={onOpenCommandPalette}
          title={`Command palette (${formatShortcut(SHORTCUTS.commandPalette)})`}
          aria-label="Open command palette"
          className="rounded px-2 py-1 text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
            <circle cx="6" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
            <path d="M9 9l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          onClick={onOpenHelp}
          title="Keyboard shortcuts (?)"
          aria-label="Show keyboard shortcuts"
          className="rounded px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white"
        >
          ?
        </button>
      </div>
    </div>
  );
}
