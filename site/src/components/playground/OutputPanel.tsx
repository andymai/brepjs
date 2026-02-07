import { usePlaygroundStore } from '../../stores/playgroundStore';

interface OutputPanelProps {
  onCollapse: () => void;
}

export default function OutputPanel({ onCollapse }: OutputPanelProps) {
  const consoleOutput = usePlaygroundStore((s) => s.consoleOutput);
  const error = usePlaygroundStore((s) => s.error);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1">
        <span className="text-xs font-medium text-gray-400">Console</span>
        <button
          onClick={onCollapse}
          className="text-gray-500 transition-colors hover:text-gray-300"
          title="Collapse console"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3">
            <path d="M4.5 5.5L8 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {consoleOutput.length === 0 && !error ? (
          <div className="flex h-full items-center justify-center text-gray-600">
            Console output appears here
          </div>
        ) : (
          <>
            {consoleOutput.map((line, i) => (
              <div
                key={i}
                className={line.startsWith('[warn]') ? 'text-amber-400' : 'text-gray-400'}
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
