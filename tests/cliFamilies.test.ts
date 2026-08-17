/**
 * brepjs CLI — copy-in distribution against a fixture registry: dependency
 * closure (deps written first), clobber protection, up-to-date detection,
 * and diff exit codes. Pure node; no kernel.
 */

import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '../bin/brepjs.mjs');
const REGISTRY = join(HERE, 'fixtures/cliRegistry');

let cwd = '';

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'brepjs-cli-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(...args: string[]): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [BIN, ...args, '--registry', REGISTRY], {
    cwd,
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('brepjs add', () => {
  it('copies a family and its familyDeps, deps first', async () => {
    const r = run('add', 'beta');
    expect(r.status).toBe(0);
    const alpha = await readFile(join(cwd, 'src/families/alpha.ts'), 'utf8');
    const beta = await readFile(join(cwd, 'src/families/beta.ts'), 'utf8');
    expect(alpha.startsWith('// brepjs-family: alpha@2')).toBe(true);
    expect(beta.startsWith('// brepjs-family: beta@1')).toBe(true);
    // Missing npm deps are reported (no package.json in the scratch project).
    expect(r.out).toContain('npm install');
    expect(r.out).toContain('zod');
  });

  it('is idempotent on unmodified files', () => {
    expect(run('add', 'alpha').status).toBe(0);
    const again = run('add', 'alpha');
    expect(again.status).toBe(0);
    expect(again.out).toContain('up to date');
  });

  it('refuses to clobber a modified file without --force', async () => {
    expect(run('add', 'alpha').status).toBe(0);
    const target = join(cwd, 'src/families/alpha.ts');
    await writeFile(target, '// brepjs-family: alpha@2\nexport const alpha = 99;\n');
    const refused = run('add', 'alpha');
    expect(refused.status).toBe(1);
    expect(refused.out).toContain('--force');
    expect((await readFile(target, 'utf8')).includes('99')).toBe(true);

    const forced = run('add', 'alpha', '--force');
    expect(forced.status).toBe(0);
    expect((await readFile(target, 'utf8')).includes('99')).toBe(false);
  });

  it('errors on unknown families', () => {
    const r = run('add', 'nope');
    expect(r.status).toBe(1);
    expect(r.out).toContain("unknown family 'nope'");
  });

  it('skips deps already present in package.json', async () => {
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ dependencies: { 'brepjs-families': '^0.1.0', zod: '^4.0.0' } })
    );
    const r = run('add', 'beta');
    expect(r.status).toBe(0);
    expect(r.out).not.toContain('npm install');
  });
});

describe('brepjs diff', () => {
  it('reports up to date with exit 0, differences with exit 1', async () => {
    expect(run('add', 'alpha').status).toBe(0);
    expect(run('diff', 'alpha').status).toBe(0);
    expect(run('diff', 'alpha').out).toContain('up to date');

    await writeFile(
      join(cwd, 'src/families/alpha.ts'),
      '// brepjs-family: alpha@1\nexport const alpha = 42;\n'
    );
    const changed = run('diff', 'alpha');
    expect(changed.status).toBe(1);
    // The stale version marker is called out alongside the content drift.
    expect(changed.out).toContain('local alpha@1, registry alpha@2');
  });

  it('reports families that were never copied in', () => {
    const r = run('diff', 'alpha');
    expect(r.status).toBe(1);
    expect(r.out).toContain('not copied in');
  });
});

describe('usage', () => {
  it('prints usage and exits 2 without a valid command', () => {
    const r = run();
    expect(r.status).toBe(2);
    expect(r.out).toContain('usage:');
  });
});

describe('registry trust boundary', () => {
  async function withRegistry(
    mutate: (manifest: { families: { files: string[]; npmDeps: string[] }[] }) => void
  ): Promise<string> {
    const dir = join(cwd, 'evil-registry');
    const manifest = JSON.parse(await readFile(join(REGISTRY, 'manifest.json'), 'utf8')) as {
      families: { files: string[]; npmDeps: string[] }[];
    };
    mutate(manifest);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'families'), { recursive: true });
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest));
    return dir;
  }

  function runAgainst(registry: string, ...args: string[]): { status: number | null; out: string } {
    const r = spawnSync(process.execPath, [BIN, ...args, '--registry', registry], {
      cwd,
      encoding: 'utf8',
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  }

  it('rejects manifest file entries that escape families/', async () => {
    const evil = await withRegistry((m) => {
      const fam = m.families[0];
      if (fam) fam.files = ['families/../../escape.ts'];
    });
    const r = runAgainst(evil, 'add', 'alpha');
    expect(r.status).toBe(1);
    expect(r.out).toContain('outside families/');
  });

  it('rejects npm dependency names that could smuggle arguments', async () => {
    const evil = await withRegistry((m) => {
      const fam = m.families[0];
      if (fam) fam.npmDeps = ['--registry=https://evil.example'];
    });
    const r = runAgainst(evil, 'add', 'alpha');
    expect(r.status).toBe(1);
    expect(r.out).toContain('invalid npm dependency name');
  });

  it('rejects plaintext http registries', () => {
    const r = runAgainst('http://registry.example/reg', 'add', 'alpha');
    expect(r.status).toBe(1);
    expect(r.out).toContain('https');
  });

  it('a conflict anywhere in the closure aborts before any file is written', async () => {
    // Copy beta (which brings alpha), locally modify beta, delete alpha:
    // re-adding beta must refuse AND not recreate alpha (plan-then-apply).
    expect(run('add', 'beta').status).toBe(0);
    await writeFile(
      join(cwd, 'src/families/beta.ts'),
      '// brepjs-family: beta@1\nexport const beta = 99;\n'
    );
    await rm(join(cwd, 'src/families/alpha.ts'));
    const r = run('add', 'beta');
    expect(r.status).toBe(1);
    await expect(readFile(join(cwd, 'src/families/alpha.ts'), 'utf8')).rejects.toThrow();
  });

  it('refuses to write through a symlinked file even with --force', async () => {
    expect(run('add', 'alpha').status).toBe(0);
    const outside = join(cwd, 'outside.ts');
    await writeFile(outside, 'precious');
    const target = join(cwd, 'src/families/alpha.ts');
    await rm(target);
    const { symlink } = await import('node:fs/promises');
    await symlink(outside, target);
    const r = run('add', 'alpha', '--force');
    expect(r.status).toBe(1);
    expect(r.out).toContain('symlink');
    expect(await readFile(outside, 'utf8')).toBe('precious');
  });
});
