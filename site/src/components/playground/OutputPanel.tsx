import { usePlaygroundStore } from '../../stores/playgroundStore';

export default function OutputPanel() {
  const consoleOutput = usePlaygroundStore((s) => s.consoleOutput);
  const error = usePlaygroundStore((s) => s.error);

  if (consoleOutput.length === 0 && !error) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-600">
        Console output appears here
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-2 font-mono text-xs">
      {consoleOutput.map((line, i) => (
        <div
          key={i}
          className={line.startsWith('[warn]') ? 'text-amber-400' : 'text-gray-400'}
        >
          {line}
        </div>
      ))}
      {error && <div className="text-red-400">{error}</div>}
    </div>
  );
}
