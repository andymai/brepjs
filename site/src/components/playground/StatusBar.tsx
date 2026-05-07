import { useEngineStore } from '../../stores/engineStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import {
  formatArea,
  formatCurveType,
  formatLength,
  formatNormalDirection,
  formatSurfaceType,
} from '../../lib/selectionLabels';

export default function StatusBar() {
  const engineStatus = useEngineStore((s) => s.status);
  const stage = useEngineStore((s) => s.stage);
  const error = usePlaygroundStore((s) => s.error);
  const timeMs = usePlaygroundStore((s) => s.timeMs);
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const selection = usePlaygroundStore((s) => s.selection);

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
    <div
      className="flex h-7 items-center justify-between border-t border-border-subtle bg-surface px-3 text-xs"
      role="status"
    >
      <div className="flex items-center gap-3">
        <span className={statusColor}>{statusText}</span>
        {timeMs !== null && !isRunning && (
          <span className="text-gray-500">{timeMs.toFixed(0)}ms</span>
        )}
      </div>
      {selection && (
        <div className="flex items-center gap-2 text-gray-300">
          <SelectionLine selection={selection} />
        </div>
      )}
    </div>
  );
}

function SelectionLine({ selection }: { selection: NonNullable<ReturnType<typeof usePlaygroundStore.getState>['selection']> }) {
  if (selection.kind === 'face') {
    const f = selection.info;
    return (
      <>
        <span className="font-medium">{formatSurfaceType(f.surfaceType)}</span>
        <span className="text-gray-500">·</span>
        <span>area {formatArea(f.area)}</span>
        <span className="text-gray-500">·</span>
        <span>facing {formatNormalDirection(f.normal)}</span>
      </>
    );
  }
  const e = selection.info;
  return (
    <>
      <span className="font-medium">{formatCurveType(e.curveType)}</span>
      <span className="text-gray-500">·</span>
      <span>length {formatLength(e.length)}</span>
    </>
  );
}
