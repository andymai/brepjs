import { useEffect, useRef } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';

interface OutputPanelProps {
  onCollapse: () => void;
}

function countErrors(lines: string[], error: string | null): number {
  let n = error ? 1 : 0;
  for (const l of lines) if (l.startsWith('[error]')) n++;
  return n;
}

export default function OutputPanel({ onCollapse }: OutputPanelProps) {
  const consoleOutput = usePlaygroundStore((s) => s.consoleOutput);
  const error = usePlaygroundStore((s) => s.error);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll on new lines so the latest output is always visible. Triggers
  // on length+error change rather than the consoleOutput reference itself
  // because identity-equal arrays could otherwise short-circuit the effect.
  const tick = consoleOutput.length + (error ? 1 : 0);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tick]);

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
            {error && <div className="text-red-400">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}
