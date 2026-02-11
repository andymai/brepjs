/**
 * Functional, immutable finder — filter-based shape querying with branded types.
 * Each filter method returns a NEW finder (immutable builder pattern).
 *
 * Usage:
 *   const edges = edgeFinder()
 *     .inDirection('Z')
 *     .ofLength(10, 0.01)
 *     .findAll(shape);
 *
 * This barrel re-exports everything from the individual finder modules
 * so that existing imports from `'./finderFns.js'` continue to work.
 */

// -- Core types --
export type { ShapeFinder, Predicate, TopoKind } from './finderCore.js';

// -- Edge finder --
export { edgeFinder } from './edgeFinder.js';
export type { EdgeFinderFn } from './edgeFinder.js';

// -- Face finder --
export { faceFinder } from './faceFinder.js';
export type { FaceFinderFn } from './faceFinder.js';

// -- Wire finder --
export { wireFinder } from './wireFinder.js';
export type { WireFinderFn } from './wireFinder.js';

// -- Vertex finder --
export { vertexFinder } from './vertexFinder.js';
export type { VertexFinderFn } from './vertexFinder.js';

// -- Corner finder (2D) --
export { cornerFinder } from './cornerFinder.js';
export type { CornerFinderFn, CornerFilter, Corner, BlueprintLike } from './cornerFinder.js';
