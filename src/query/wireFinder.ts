/**
 * Wire-specific finder — filters wires by open/closed status, edge count, etc.
 */

import type { Wire } from '../core/shapeTypes.js';
import { curveIsClosed } from '../topology/curveFns.js';
import { iterTopo } from '../topology/cast.js';
import { type ShapeFinder, type Predicate, createTypedFinder } from './finderCore.js';

// ---------------------------------------------------------------------------
// Wire finder interface
// ---------------------------------------------------------------------------

export interface WireFinderFn extends ShapeFinder<Wire> {
  readonly isClosed: () => WireFinderFn;
  readonly isOpen: () => WireFinderFn;
  readonly ofEdgeCount: (count: number) => WireFinderFn;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function buildWireFinder(filters: ReadonlyArray<Predicate<Wire>>): WireFinderFn {
  return createTypedFinder<Wire, WireFinderFn>(
    'wire',
    filters,
    buildWireFinder,
    (_base, withFilter) => ({
      isClosed: () => withFilter((wire) => curveIsClosed(wire)),

      isOpen: () => withFilter((wire) => !curveIsClosed(wire)),

      ofEdgeCount: (count) =>
        withFilter((wire) => {
          let edgeCount = 0;
          for (const _raw of iterTopo(wire.wrapped, 'edge')) {
            edgeCount++;
          }
          return edgeCount === count;
        }),
    })
  );
}

/** Create an immutable wire finder. */
export function wireFinder(): WireFinderFn {
  return buildWireFinder([]);
}
