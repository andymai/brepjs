import { useEngineStore } from '../../stores/engineStore';

export default function LoadingOverlay() {
  const status = useEngineStore((s) => s.status);
  const stage = useEngineStore((s) => s.stage);
  const progress = useEngineStore((s) => s.progress);
  const error = useEngineStore((s) => s.error);

  if (status === 'ready') return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gray-950/90 backdrop-blur-sm">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-primary text-xl font-bold text-white">
        b
      </div>

      <div className="mt-6 w-64">
        {status === 'error' ? (
          <p className="text-center text-sm text-red-400">{error}</p>
        ) : (
          <>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-overlay">
              <div
                className="h-full rounded-full bg-indigo-primary transition-all duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="text-center text-sm text-gray-400">{stage || 'Initializing...'}</p>
          </>
        )}
      </div>
    </div>
  );
}
