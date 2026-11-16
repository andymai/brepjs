/**
 * Which test file holds the geometry gate of each playground example, and
 * which examples get the connected-body check. This module imports no kernel
 * code, so the kernel-free guard in `tests/playgroundExamples.test.ts` can
 * read it.
 */
import { basename } from 'node:path';
import { CATEGORIES } from '../../apps/playground/src/lib/examples/index.js';
import type { Example } from '../../apps/playground/src/lib/examples/types.js';

interface ExampleTestFile {
  readonly file: string;
  readonly category: string;
  /** First letters of the ids the file holds, both ends included. The default is all of them. */
  readonly letters?: readonly [string, string];
}

/**
 * One fork runs one file, so the longest file sets the time of its CI shard.
 * Mechanical has more than half of the build time and is in two files. The
 * cut is by the first letter of the id, so a new example does not move the
 * others to a different file (the brepkit known-failure list has the file
 * name as its key).
 *
 * `tests/playgroundExamples.test.ts` fails when an example is in no file or
 * in two.
 */
export const EXAMPLE_TEST_FILES: readonly ExampleTestFile[] = [
  { file: 'playgroundExamplesShowcase.test.ts', category: 'showcase' },
  { file: 'playgroundExamplesBasics.test.ts', category: 'basics' },
  { file: 'playgroundExamplesMechanicalAL.test.ts', category: 'mechanical', letters: ['a', 'l'] },
  { file: 'playgroundExamplesMechanicalMZ.test.ts', category: 'mechanical', letters: ['m', 'z'] },
  { file: 'playgroundExamplesSheetMetal.test.ts', category: 'sheet-metal' },
  { file: 'playgroundExamplesBim.test.ts', category: 'bim' },
  { file: 'playgroundExamplesFamilies.test.ts', category: 'families' },
];

/** The examples that the test file at `path` holds. */
export function examplesOfFile(path: string): readonly Example[] {
  const entry = EXAMPLE_TEST_FILES.find((f) => f.file === basename(path));
  if (!entry) throw new Error(`${basename(path)} is not in EXAMPLE_TEST_FILES`);
  const category = CATEGORIES.find((c) => c.id === entry.category);
  if (!category) throw new Error(`no example category "${entry.category}"`);
  const [first, last] = entry.letters ?? ['\u0000', '\uffff'];
  return category.examples.filter((e) => {
    const letter = e.id.charAt(0);
    return letter >= first && letter <= last;
  });
}

// Multi-part mechanism/assembly examples return an array of DISTINCT bodies,
// each of which must be a single connected solid. A body that is secretly a
// multi-solid compound (a pin floating off its disc, parts glued by a fuse
// that never welded) passes eval+mesh (a disjoint compound still meshes) yet
// detaches on STEP/GLB export. getSolids() is the only thing that catches it.
export const CONNECTED_BODY_EXAMPLES: readonly string[] = [
  'universal-joint',
  'geneva-drive',
  'bench-vise',
  'scotch-yoke',
  'three-jaw-chuck',
  'worm-gear-drive',
];
