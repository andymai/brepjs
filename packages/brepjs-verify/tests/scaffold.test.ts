import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scaffoldPart } from '@/cli/scaffold.js';

describe('scaffoldPart', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-init-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('scaffolds a part, tsconfig and README', () => {
    const result = scaffoldPart('widget', dir);
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain(join(dir, 'widget.brep.ts'));
    expect(paths).toContain(join(dir, 'tsconfig.json'));
    expect(paths).toContain(join(dir, 'README.md'));
    expect(result.files.every((f) => f.created)).toBe(true);
    const part = readFileSync(join(dir, 'widget.brep.ts'), 'utf8');
    expect(part).toContain('export default');
    expect(part).toContain('const width');
  });

  it('does not overwrite existing files', () => {
    const partPath = join(dir, 'widget.brep.ts');
    writeFileSync(partPath, 'ORIGINAL');
    const result = scaffoldPart('widget', dir);
    const partFile = result.files.find((f) => f.path === partPath);
    expect(partFile?.created).toBe(false);
    expect(readFileSync(partPath, 'utf8')).toBe('ORIGINAL');
    // sibling files still get created
    expect(existsSync(join(dir, 'tsconfig.json'))).toBe(true);
  });
});
