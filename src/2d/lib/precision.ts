/**
 * Shared precision constants for the 2D module — re-exports from Layer 0.
 *
 * ADR-0006: src/utils/vec2d.ts is the canonical source.
 *
 * Hierarchy (from tightest to loosest):
 *  - PRECISION_INTERSECTION (1e-9): curve intersection, parameter lookups
 *  - PRECISION_OFFSET       (1e-8): offset operations (scaled ×10, ÷100, ×100 internally)
 *  - PRECISION_POINT        (1e-6): point-equality checks (default for samePoint)
 */

export { PRECISION_INTERSECTION, PRECISION_OFFSET, PRECISION_POINT } from '@/utils/vec2d.js';
