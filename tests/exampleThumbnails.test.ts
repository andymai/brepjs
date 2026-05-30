/**
 * Every playground example must have a committed thumbnail for the example
 * picker. This gate fails CI if an example is added (or its id changed) without
 * regenerating thumbnails — run `npm run thumbs --workspace apps/playground`
 * against a running dev server to refresh them.
 *
 * Pure filesystem check; no kernel needed.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLES } from '../apps/playground/src/lib/examples/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const THUMB_DIR = resolve(here, '../apps/playground/public/example-thumbs');

describe('example thumbnails', () => {
  for (const ex of EXAMPLES) {
    it(`has a committed thumbnail: ${ex.id}`, () => {
      const path = resolve(THUMB_DIR, `${ex.id}.webp`);
      expect(existsSync(path), `missing ${ex.id}.webp — run \`npm run thumbs\``).toBe(true);
    });
  }
});
