/**
 * Regression guard for the playground examples.
 *
 * Every entry in the playground's EXAMPLES list must evaluate and mesh against
 * the kernel under test. Nothing else verifies this; the production smoke test
 * only checks the engine boots, not that each example runs. Without this, an
 * example can silently rot into a blank viewer.
 *
 * The geometry tests are in the files of `EXAMPLE_TEST_FILES`
 * (`helpers/playgroundExampleCategories.ts`). This file holds the checks that
 * need no kernel.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../apps/playground/src/lib/examples/index.js';
import {
  CONNECTED_BODY_EXAMPLES,
  EXAMPLE_TEST_FILES,
  examplesOfFile,
} from './helpers/playgroundExampleCategories.js';

describe('playground examples', () => {
  it('has a unique id and label for every entry', () => {
    const ids = EXAMPLES.map((e) => e.id);
    const labels = EXAMPLES.map((e) => e.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('has every example in exactly one geometry test file', () => {
    const files = new Map<string, string[]>();
    for (const { file } of EXAMPLE_TEST_FILES) {
      expect(existsSync(resolve(import.meta.dirname, file)), `tests/${file} does not exist`).toBe(
        true
      );
      for (const example of examplesOfFile(file))
        files.set(example.id, [...(files.get(example.id) ?? []), file]);
    }
    for (const example of EXAMPLES)
      expect(files.get(example.id), `files that hold ${example.id}`).toHaveLength(1);
  });

  it('checks connected bodies only for examples that exist', () => {
    const ids = new Set(EXAMPLES.map((e) => e.id));
    expect(CONNECTED_BODY_EXAMPLES.filter((id) => !ids.has(id))).toEqual([]);
  });

  // A finishing op (fillet/chamfer/etc.) that returns Result.Err must NOT be
  // swallowed with a fallback to the pre-op shape: that makes a no-op pass the
  // eval+mesh check while silently shipping an unfinished part. Require
  // Result-returning ops to be unwrap()'d so failures throw and get caught.
  // Matches patterns like `x.ok ? x.value : base` and `isOk(x) ? unwrap(x) : base`.
  const SILENT_FALLBACK = /(\.ok\s*\?[^:]*:|isOk\s*\([^)]*\)\s*\?[^:]*:)/;
  for (const example of EXAMPLES) {
    it(`has no silent finishing-op fallback: ${example.id}`, () => {
      expect(
        SILENT_FALLBACK.test(example.code),
        `${example.id} swallows a Result with a fallback; unwrap() finishing ops instead so failures surface`
      ).toBe(false);
    });
  }
});
