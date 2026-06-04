import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isEntrypoint } from '../src/cli/main.js';

// Regression: the npm-installed bin (node_modules/.bin/brepjs) is a SYMLINK to
// dist/cli/main.js. A naive `import.meta.url === pathToFileURL(argv[1])` check
// fails through the symlink, so the CLI silently no-ops for every real user.
describe('isEntrypoint (symlink-aware)', () => {
  let dir: string;
  let real: string;
  let link: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'brepjs-entry-'));
    real = join(dir, 'main.js');
    link = join(dir, 'brepjs-bin');
    writeFileSync(real, '// stub');
    symlinkSync(real, link);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('treats a symlinked invocation as the entrypoint', () => {
    expect(isEntrypoint(link, pathToFileURL(real).href)).toBe(true);
  });

  it('treats a direct invocation as the entrypoint', () => {
    expect(isEntrypoint(real, pathToFileURL(real).href)).toBe(true);
  });

  it('is false for an unrelated argv and for missing argv', () => {
    expect(isEntrypoint(join(dir, 'other.js'), pathToFileURL(real).href)).toBe(false);
    expect(isEntrypoint(undefined, pathToFileURL(real).href)).toBe(false);
  });
});
