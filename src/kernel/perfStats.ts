/**
 * Operation-level performance instrumentation.
 *
 * Lightweight timing module with zero allocation on the hot path.
 * Each operation category has a cumulative duration counter.
 *
 * Used by kernel adapters to record timing for boolean, loft,
 * extrude, shell, fillet, mesh, edge mesh, and transform operations.
 */

const CATEGORIES = [
  'boolean',
  'loft',
  'extrude',
  'shell',
  'fillet',
  'mesh',
  'edgeMesh',
  'transform',
] as const;

export type PerfCategory = (typeof CATEGORIES)[number];

interface CategoryStats {
  totalMs: number;
  count: number;
}

export type PerformanceStats = Record<PerfCategory, CategoryStats>;

// Mutable accumulators — no allocation on hot path
const _totals: Record<string, number> = Object.create(null) as Record<string, number>;
const _counts: Record<string, number> = Object.create(null) as Record<string, number>;

function _init(): void {
  for (const c of CATEGORIES) {
    _totals[c] = 0;
    _counts[c] = 0;
  }
}
_init();

/**
 * Start timing an operation. Returns a function to call when the operation completes.
 * Uses `performance.now()` for sub-millisecond precision.
 */
export function perfTimer(category: PerfCategory): () => void {
  const start = performance.now();
  return () => {
    _totals[category] = (_totals[category] ?? 0) + (performance.now() - start);
    _counts[category] = (_counts[category] ?? 0) + 1;
  };
}

/** Read accumulated stats (non-destructive). */
export function getPerformanceStats(): PerformanceStats {
  const result = {} as PerformanceStats;
  for (const c of CATEGORIES) {
    result[c] = { totalMs: _totals[c] ?? 0, count: _counts[c] ?? 0 };
  }
  return result;
}

/** Reset all counters to zero. */
export function resetPerformanceStats(): void {
  _init();
}
