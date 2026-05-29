/**
 * Playground example library.
 *
 * Examples are grouped into category files; this barrel aggregates them into a
 * single flat EXAMPLES list for the command palette. Add a new category by
 * creating a file that exports an `Example[]` and spreading it here.
 */
export type { Example } from './types';

import type { Example } from './types';
import { BASIC_EXAMPLES } from './basics';
import { GEOMETRY_EXAMPLES } from './geometry';
import { MECHANICAL_EXAMPLES } from './mechanical';

export const EXAMPLES: readonly Example[] = [
  ...BASIC_EXAMPLES,
  ...GEOMETRY_EXAMPLES,
  ...MECHANICAL_EXAMPLES,
];
