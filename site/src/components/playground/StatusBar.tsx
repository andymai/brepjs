import { useEngineStore } from '../../stores/engineStore';
import { usePlaygroundStore, type Selection } from '../../stores/playgroundStore';
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
  const selections = usePlaygroundStore((s) => s.selections);
  const lastSelection = selections[selections.length - 1] ?? null;

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
        <span className="text-gray-500" title="brepjs version (helpful when reporting bugs)">
          brepjs v{__BREPJS_VERSION__}
        </span>
      </div>
      {lastSelection && (
        <div className="flex min-w-0 items-center gap-2 truncate whitespace-nowrap text-gray-300">
          {selections.length > 1 && (
            <span className="rounded bg-teal-primary/20 px-1.5 py-0.5 text-teal-light">
              {selections.length} selected
            </span>
          )}
          <SelectionLine selection={lastSelection} />
        </div>
      )}
    </div>
  );
}

function SelectionLine({ selection }: { selection: Selection }) {
  if (selection.kind === 'face') {
    const face = selection.info;
    return (
      <>
        <span className="font-medium">{formatSurfaceType(face.surfaceType)}</span>
        <span className="text-gray-500">·</span>
        <span>area {formatArea(face.area)}</span>
        <span className="text-gray-500">·</span>
        <span>facing {formatNormalDirection(face.normal)}</span>
      </>
    );
  }
  const edge = selection.info;
  return (
    <>
      <span className="font-medium">{formatCurveType(edge.curveType)}</span>
      <span className="text-gray-500">·</span>
      <span>length {formatLength(edge.length)}</span>
    </>
  );
}
