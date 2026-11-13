import { useEffect, useState } from 'react';
import { usePlaygroundStore } from '../../stores/playgroundStore';

// A short run needs no counter. A long one (a heavy model on a phone) needs
// proof that the page still works.
const SHOW_ELAPSED_AFTER_S = 2;

function ElapsedSeconds({ startedAt }: { startedAt: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const update = () => {
      setSeconds(Math.floor((performance.now() - startedAt) / 1000));
    };
    update();
    const id = setInterval(update, 1000);
    return () => {
      clearInterval(id);
    };
  }, [startedAt]);
  if (seconds < SHOW_ELAPSED_AFTER_S) return null;
  return <span className="tabular-nums text-teal-primary/70"> {seconds} s</span>;
}

/**
 * Elegant generation indicator shown over the 3D viewer while geometry
 * recomputes (the `isRunning` window). The previous part stays faintly visible
 * behind a light scrim; a teal wireframe cube whose edges "march" conveys that
 * geometry is being built, softening the perceived wait. Non-interactive.
 */
export default function GenerationOverlay() {
  const isRunning = usePlaygroundStore((s) => s.isRunning);
  const runStartedAt = usePlaygroundStore((s) => s.runStartedAt);
  if (!isRunning) return null;

  return (
    <div
      className="gen-overlay pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-gray-950/25 backdrop-blur-[1px]"
      aria-hidden="true"
    >
      {/* Isometric wireframe cube: hexagon silhouette + three edges to the front corner. */}
      <svg className="gen-cube h-16 w-16" viewBox="0 0 100 100" fill="none">
        <path
          d="M50 78 L74.2 64 L74.2 36 L50 22 L25.8 36 L25.8 64 Z"
          stroke="#4acecc"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <line x1="50" y1="50" x2="50" y2="78" stroke="#4acecc" strokeWidth="2.2" />
        <line x1="50" y1="50" x2="74.2" y2="36" stroke="#4acecc" strokeWidth="2.2" />
        <line x1="50" y1="50" x2="25.8" y2="36" stroke="#4acecc" strokeWidth="2.2" />
      </svg>
      <span className="text-xs font-medium tracking-wide text-teal-primary/90">
        <span className="animate-pulse">Generating…</span>
        {runStartedAt !== null && <ElapsedSeconds startedAt={runStartedAt} />}
      </span>
    </div>
  );
}
