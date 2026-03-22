/**
 * Namespace: booleans — boolean operations on shapes
 */
export { fuse, cut, intersect, section, sectionToFace, split, slice } from '@/topology/api.js';

export { fuseAll, cutAll } from '@/topology/booleanFns.js';

export { checkBoolean } from '@/topology/booleanDiagnosticFns.js';

export { hull } from '@/topology/hullFns.js';

export { convexHull } from '@/operations/convexHullFns.js';

export { minkowski } from '@/topology/minkowskiFns.js';
