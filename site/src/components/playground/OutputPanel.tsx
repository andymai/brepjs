import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { countErrors } from '../../lib/consoleStats';

interface OutputPanelProps {
  onCollapse: () => void;
  onJumpToLine?: (line: number) => void;
}

export default function OutputPanel({ onCollapse, onJumpToLine }: OutputPanelProps) {
  const consoleOutput = usePlaygroundStore((s) => s.consoleOutput);
  const error = usePlaygroundStore((s) => s.error);
  const errorLine = usePlaygroundStore((s) => s.errorLine);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new content. zustand replaces the array on every
  // `setConsoleOutput`, so identity is a reliable change signal — counter
  // arithmetic could collide across evals (eval A 4 lines → eval B error
  // adds 1 → eval C 4 lines clears error: net same number, missed scroll).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [consoleOutput, error]);

  const errorCount = countErrors(consoleOutput, error);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-300">Console</span>
          {errorCount > 0 && (
            <span
              className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-300"
              title={`${errorCount} error${errorCount === 1 ? '' : 's'}`}
            >
              {errorCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const store = usePlaygroundStore.getState();
              store.setConsoleOutput([]);
              store.setError(null);
            }}
            className="text-gray-400 transition-colors hover:text-gray-100"
            title="Clear console"
            aria-label="Clear console"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
          <button
            onClick={() => {
              const text = [...consoleOutput, ...(error ? [error] : [])].join('\n');
              void navigator.clipboard.writeText(text);
            }}
            className="text-gray-400 transition-colors hover:text-gray-100"
            title="Copy console output"
            aria-label="Copy console output"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
              <rect
                x="5"
                y="5"
                width="9"
                height="9"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="none"
              />
              <path d="M3 11V3a1 1 0 011-1h8" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>
          <button
            onClick={onCollapse}
            className="text-gray-400 transition-colors hover:text-gray-100"
            title="Collapse console"
            aria-label="Collapse console"
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden="true">
              <path d="M4.5 5.5L8 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 overflow-auto p-2 font-mono text-xs"
        aria-live="polite"
      >
        {consoleOutput.length === 0 && !error ? (
          <div className="flex h-full items-center justify-center text-gray-500">
            Console output appears here
          </div>
        ) : (
          <>
            {consoleOutput.map((line, i) => (
              <div
                key={i}
                className={
                  line.startsWith('[error]')
                    ? 'text-red-400'
                    : line.startsWith('[warn]')
                      ? 'text-amber-400'
                      : 'text-gray-300'
                }
              >
                {line}
              </div>
            ))}
            {error && (
              <div className="flex flex-wrap items-baseline gap-2 text-red-400">
                <span>{error}</span>
                {errorLine !== null && onJumpToLine && (
                  <button
                    onClick={() => {
                      onJumpToLine(errorLine);
                    }}
                    className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-200 transition-colors hover:bg-red-500/20"
                    title="Jump to error line in editor"
                  >
                    Go to line {errorLine}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
