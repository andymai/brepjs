/**
 * Tessellation quality levels — a kernel-agnostic fidelity/speed dial.
 *
 * Callers pick an intent (`'draft' | 'standard' | 'fine'`) instead of
 * kernel-specific knobs (Manifold circular segments vs. OCCT deflection). Each
 * level maps to:
 * - a **deflection** pair, used as the default at `mesh()`/export for
 *   `extract-time` kernels (OCCT), and
 * - a per-kernel `setQuality()` for `build-time` kernels (Manifold), which
 *   translate the level to their native global setting before a solid is built.
 *
 * The current level is process-global state, scoped by `withQuality()` /
 * `withTier()` in `./index.js`. This module is pure data + state so it has no
 * dependency on the kernel registry.
 * @module
 */

export type QualityLevel = 'draft' | 'standard' | 'fine';

export interface QualityDeflection {
  /** Linear deflection (absolute, model units). */
  readonly tolerance: number;
  /** Angular deflection (radians). */
  readonly angularTolerance: number;
}

/**
 * Extract-time deflection per level. `'standard'` matches brepjs's historical
 * `mesh()` defaults (1e-3 / 0.1) so behaviour is unchanged when no quality is
 * set.
 */
const DEFLECTION: Record<QualityLevel, QualityDeflection> = {
  draft: { tolerance: 1e-2, angularTolerance: 0.5 },
  standard: { tolerance: 1e-3, angularTolerance: 0.1 },
  fine: { tolerance: 1e-4, angularTolerance: 0.05 },
};

let _current: QualityLevel = 'standard';

/** The active quality level (defaults to `'standard'`). */
export function currentQuality(): QualityLevel {
  return _current;
}

/** Deflection params for a level (defaults to the active level). */
export function qualityDeflection(level: QualityLevel = _current): QualityDeflection {
  return DEFLECTION[level];
}

/** @internal — set by `withQuality`/`withTier`; restored in their `finally`. */
export function setQualityState(level: QualityLevel): void {
  _current = level;
}
