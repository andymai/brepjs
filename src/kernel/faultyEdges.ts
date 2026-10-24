/**
 * A fillet or chamfer the kernel could not build, naming the edges it failed
 * on. The indexes point into the edges array passed to the kernel method, so
 * the caller can map them back to its own edge handles without retrying edge
 * by edge.
 */

const FAULTY_EDGES_MARKER = Symbol.for('brepjs.kernel.faultyEdgeIndexes');

export class FaultyEdgesError extends Error {
  constructor(message: string, faultyEdgeIndexes: readonly number[], options?: ErrorOptions) {
    super(message, options);
    this.name = 'FaultyEdgesError';
    // Global-registry symbol, read in place of `instanceof`, so the indexes
    // survive a second copy of this class across a bundle boundary.
    Object.defineProperty(this, FAULTY_EDGES_MARKER, { value: faultyEdgeIndexes });
  }
}

/** The failing edges' indexes carried by a {@link FaultyEdgesError}, or `undefined`. */
export function faultyEdgeIndexesOf(error: unknown): readonly number[] | undefined {
  if (!(error instanceof Error)) return undefined;
  const indexes: unknown = Reflect.get(error, FAULTY_EDGES_MARKER);
  return Array.isArray(indexes) ? (indexes as number[]) : undefined;
}
