import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useEngineStore } from '../../stores/engineStore';
import { SHORTCUTS, formatShortcut } from '../../lib/shortcuts';
import Logo from '../shared/Logo';
import ExamplePicker from './ExamplePicker';

interface ToolbarProps {
  onRun: () => void;
  onExportSTL: () => void;
  onExportSTEP: () => void;
  onShare: () => void;
  isRunning: boolean;
  onSelectExample: (code: string) => void;
}

export default function Toolbar({
  onRun,
  onExportSTL,
  onExportSTEP,
  onShare,
  isRunning,
  onSelectExample,
}: ToolbarProps) {
  const engineReady = useEngineStore((s) => s.status === 'ready');
  const [showExamples, setShowExamples] = useState(false);
  const examplesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showExamples) return;
    const handleClick = (e: MouseEvent) => {
      if (examplesRef.current && !examplesRef.current.contains(e.target as Node)) {
        setShowExamples(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
    };
  }, [showExamples]);

  return (
    <div className="flex h-11 items-center justify-between border-b border-border-subtle bg-surface px-3">
      <div className="flex items-center gap-2">
        <Link to="/" className="flex items-center gap-1.5 text-sm font-bold">
          <Logo className="h-6 w-6" />
          <span className="text-gray-400">brepjs</span>
        </Link>

        <div className="mx-2 h-4 w-px bg-border-subtle" />

        <div ref={examplesRef} className="relative">
          <button
            onClick={() => {
              setShowExamples((v) => !v);
            }}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white"
          >
            Examples
            <svg
              className="h-3 w-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 4.5L6 7.5L9 4.5" />
            </svg>
          </button>
          {showExamples && (
            <ExamplePicker
              onClose={() => {
                setShowExamples(false);
              }}
              onSelect={onSelectExample}
            />
          )}
        </div>
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
          disabled={!engineReady}
          title={`Export STL (${formatShortcut(SHORTCUTS.exportSTL)})`}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          STL
        </button>
        <button
          onClick={onExportSTEP}
          disabled={!engineReady}
          title={`Export STEP (${formatShortcut(SHORTCUTS.exportSTEP)})`}
          className="rounded px-2.5 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-surface-overlay hover:text-white disabled:opacity-40"
        >
          STEP
        </button>
      </div>
    </div>
  );
}
