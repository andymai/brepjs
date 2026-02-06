import { useEngineStore } from '../../stores/engineStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';

export default function StatusBar() {
  const engineStatus = useEngineStore((s) => s.status);
  const stage = useEngineStore((s) => s.stage);
  const error = usePlaygroundStore((s) => s.error);
  const timeMs = usePlaygroundStore((s) => s.timeMs);
  const isRunning = usePlaygroundStore((s) => s.isRunning);

  let statusText: string;
  let statusColor: string;

  if (engineStatus === 'loading') {
    statusText = stage || 'Loading...';
    statusColor = 'text-amber-400';
  } else if (engineStatus === 'error') {
    statusText = 'Engine error';
    statusColor = 'text-red-400';
  } else if (isRunning) {
    statusText = 'Running...';
    statusColor = 'text-amber-400';
  } else if (error) {
    statusText = 'Error';
    statusColor = 'text-red-400';
  } else if (engineStatus === 'ready') {
    statusText = 'Ready';
    statusColor = 'text-green-400';
  } else {
    statusText = 'Idle';
    statusColor = 'text-gray-500';
  }

  return (
    <div className="flex h-7 items-center justify-between border-t border-border-subtle bg-surface px-3 text-xs">
      <div className="flex items-center gap-3">
        <span className={statusColor}>{statusText}</span>
        {timeMs != null && !isRunning && (
          <span className="text-gray-500">{timeMs.toFixed(0)}ms</span>
        )}
      </div>
      {error && <span className="truncate text-red-400">{error}</span>}
    </div>
  );
}
