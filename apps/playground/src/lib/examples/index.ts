/**
 * Playground example library.
 *
 * Examples are grouped into category files; this barrel aggregates them into a
 * single flat EXAMPLES list (for code that wants every example) plus a
 * CATEGORIES list (for the example picker's filter pills). Add a new category
 * by creating a file that exports an `Example[]` and adding an entry here.
 */
export type { Example } from './types';

import type { Example } from './types';
import { BASIC_EXAMPLES } from './basics';
import { MECHANICAL_EXAMPLES } from './mechanical';

export interface ExampleCategory {
  id: string;
  label: string;
  examples: readonly Example[];
}

export const CATEGORIES: readonly ExampleCategory[] = [
  { id: 'basics', label: 'Basics', examples: BASIC_EXAMPLES },
  { id: 'mechanical', label: 'Mechanical', examples: MECHANICAL_EXAMPLES },
];

export const EXAMPLES: readonly Example[] = CATEGORIES.flatMap((c) => c.examples);
