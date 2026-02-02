/**
 * Shared precision constants for the 2D module.
 *
 * Hierarchy (from tightest to loosest):
 *  - PRECISION_INTERSECTION (1e-9): curve intersection, parameter lookups
 *  - PRECISION_OFFSET       (1e-8): offset operations (scaled ×10, ÷100, ×100 internally)
 *  - PRECISION_POINT        (1e-6): point-equality checks (default for samePoint)
 */

/** Precision for curve intersection and parameter operations. */
export const PRECISION_INTERSECTION = 1e-9;

/** Base precision for offset operations — scaled internally for sub-tasks. */
export const PRECISION_OFFSET = 1e-8;

/** Default precision for point-equality comparisons. */
export const PRECISION_POINT = 1e-6;
