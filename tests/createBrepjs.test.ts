/**
 * create-brepjs — scaffolds a working project skeleton: template files land
 * with the right names (npm-mangled ones renamed), the package takes the
 * project name, and non-empty targets are refused. Pure node; no kernel.
 */

import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BIN = join(
  dirname(fileURLToPath(import.meta.url)),
  '../packages/create-brepjs/bin/create-brepjs.mjs'
);

let cwd = '';

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'create-brepjs-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function run(...args: string[]): { status: number | null; out: string } {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('create-brepjs', () => {
  it('scaffolds a project with renamed template files and the project name', async () => {
    const r = run('my-model');
    expect(r.status).toBe(0);
    const root = join(cwd, 'my-model');
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as {
      name: string;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe('my-model');
    expect(Object.keys(pkg.dependencies)).toContain('brepjs-families');
    await expect(readFile(join(root, '.gitignore'), 'utf8')).resolves.toContain('node_modules');
    await expect(readFile(join(root, 'src/main.tsx'), 'utf8')).resolves.toContain(
      'brepjs-families'
    );
    await expect(readFile(join(root, 'tsconfig.json'), 'utf8')).resolves.toBeTruthy();
    // The template placeholder never leaks through.
    await expect(readFile(join(root, 'package.json.tpl'), 'utf8')).rejects.toThrow();
    expect(r.out).toContain('npx brepjs add');
  });

  it('refuses a non-empty target directory', async () => {
    await mkdir(join(cwd, 'taken'));
    await writeFile(join(cwd, 'taken/existing.txt'), 'x');
    const r = run('taken');
    expect(r.status).toBe(1);
    expect(r.out).toContain('not empty');
  });

  it('rejects hostile project names', () => {
    for (const name of [
      '--oops',
      '../escape',
      'a/../../b',
      '/абс',
      '/abs',
      'name/',
      '@scope/pkg',
    ]) {
      const r = run(name);
      expect(r.status, name).toBe(1);
      expect(r.out, name).toContain('invalid project name');
    }
  });

  it('accepts a nested relative path and names the package by its basename', async () => {
    const r = run('models/tiny-house');
    expect(r.status).toBe(0);
    const pkg = JSON.parse(await readFile(join(cwd, 'models/tiny-house/package.json'), 'utf8')) as {
      name: string;
    };
    expect(pkg.name).toBe('tiny-house');
  });
});
