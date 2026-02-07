/**
 * Shape modifier types and query module infrastructure.
 *
 * Contains types for fillet/chamfer operations and the lazy query module loader
 * needed by shell/fillet/chamfer operations.
 *
 * These are re-exported from shapes.ts for backward compatibility.
 */

import { bug } from '../core/errors.js';
import type { EdgeFinder, FaceFinder } from '../query/index.js';
import type { Edge } from '../core/shapeTypes.js';

// ---------------------------------------------------------------------------
// Lazy query module loader — avoids hard compile-time dependency on query/
// while still allowing runtime access to EdgeFinder / FaceFinder constructors.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy-loaded module type
let _queryModule: any = null;

export function getQueryModule(): {
  EdgeFinder: new () => EdgeFinder;
  FaceFinder: new () => FaceFinder;
} {
  if (!_queryModule) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lazy runtime load of optional peer module
    _queryModule = (globalThis as any).__brepjs_query_module__;
    if (!_queryModule) {
      bug(
        'shapes',
        'Query module not registered. Call registerQueryModule() or import query/index.js before using shell/fillet/chamfer.'
      );
    }
  }
  return _queryModule;
}

/**
 * Register the query module so that shell/fillet/chamfer can construct
 * EdgeFinder and FaceFinder at runtime without a hard import.
 */
export function registerQueryModule(mod: {
  EdgeFinder: new () => EdgeFinder;
  FaceFinder: new () => FaceFinder;
}): void {
  _queryModule = mod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- global registration
  (globalThis as any).__brepjs_query_module__ = mod;
}

// ---------------------------------------------------------------------------
// Fillet / Chamfer types
// ---------------------------------------------------------------------------

/**
 * A chamfer radius specification.
 *
 * - A number for symmetric chamfer.
 * - Two distances for asymmetric chamfer (first distance for the selected face).
 * - A distance and angle for asymmetric chamfer.
 */
export type ChamferRadius =
  | number
  | {
      distances: [number, number];
      selectedFace: (f: FaceFinder) => FaceFinder;
    }
  | {
      distance: number;
      angle: number;
      selectedFace: (f: FaceFinder) => FaceFinder;
    };

export type FilletRadius = number | [number, number];

/**
 * A generic way to define radii for fillet or chamfer operations.
 */
export type RadiusConfig<R = number> =
  | ((e: Edge) => R | null)
  | R
  | { filter: EdgeFinder; radius: R; keep?: boolean };

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isNumber(r: unknown): r is number {
  return typeof r === 'number';
}

export function isChamferRadius(r: unknown): r is ChamferRadius {
  if (typeof r === 'number') return true;
  if (typeof r === 'object' && r !== null) {
    const obj = r as Record<string, unknown>;
    return (
      ('distances' in obj && Array.isArray(obj['distances']) && 'selectedFace' in obj) ||
      ('distance' in obj && 'angle' in obj && 'selectedFace' in obj)
    );
  }
  return false;
}

export function isFilletRadius(r: unknown): r is FilletRadius {
  if (typeof r === 'number') return true;
  if (Array.isArray(r) && r.length === 2) {
    return r.every(isNumber);
  }
  return false;
}
