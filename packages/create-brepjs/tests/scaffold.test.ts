import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(pkgRoot, '..', '..');
const bin = join(pkgRoot, 'bin', 'create-brepjs.mjs');

interface ScaffoldPkg {
  readonly name: string;
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

// Minimal ^-range check for the shapes the template uses ("^x.y.z", "||"),
// so the test needs no semver dependency.
function caretSatisfies(version: string, range: string): boolean {
  return range.split('||').some((part) => {
    const clause = part.trim();
    if (!clause.startsWith('^')) return false;
    const lower = clause.slice(1).split('.').map(Number);
    const actual = version.split('.').map(Number);
    if (lower.some(Number.isNaN) || actual.some(Number.isNaN)) return false;
    const [lMaj = 0, lMin = 0, lPat = 0] = lower;
    const [aMaj = 0, aMin = 0, aPat = 0] = actual;
    if (aMaj !== lMaj) return false;
    if (lMaj > 0) return aMin > lMin || (aMin === lMin && aPat >= lPat);
    if (aMin !== lMin) return false;
    return aPat >= lPat;
  });
}

describe('caretSatisfies', () => {
  it('handles the range shapes the template uses', () => {
    expect(caretSatisfies('18.151.1', '^18.0.0')).toBe(true);
    expect(caretSatisfies('19.0.0', '^18.0.0')).toBe(false);
    expect(caretSatisfies('0.7.1', '^0.7.0')).toBe(true);
    expect(caretSatisfies('0.7.1', '^0.1.0')).toBe(false);
    expect(caretSatisfies('6.0.3', '^5.2.0 || ^6.0.0')).toBe(true);
  });
});

describe('create-brepjs scaffold', () => {
  let tmp: string;
  let target: string;

  beforeAll(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'create-brepjs-'));
    await run(process.execPath, [bin, 'demo-app'], { cwd: tmp });
    target = join(tmp, 'demo-app');
  });

  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('writes the project files with the project name substituted', async () => {
    const pkg = await readJson<ScaffoldPkg>(join(target, 'package.json'));
    expect(pkg.name).toBe('demo-app');
    const readme = await readFile(join(target, 'README.md'), 'utf8');
    expect(readme.startsWith('# demo-app\n')).toBe(true);
    await expect(readFile(join(target, '.gitignore'), 'utf8')).resolves.toContain('node_modules');
    await expect(readFile(join(target, 'src', 'main.ts'), 'utf8')).resolves.toContain(
      'brepjs-families'
    );
  });

  it('depends on a kernel package', async () => {
    const pkg = await readJson<ScaffoldPkg>(join(target, 'package.json'));
    expect(pkg.dependencies['occt-wasm']).toBeDefined();
  });

  it('declares ranges the current workspace versions satisfy', async () => {
    const pkg = await readJson<ScaffoldPkg>(join(target, 'package.json'));
    const workspaceVersions: Record<string, string> = {
      brepjs: (await readJson<{ version: string }>(join(repoRoot, 'package.json'))).version,
      'brepjs-families': (
        await readJson<{ version: string }>(
          join(repoRoot, 'packages', 'brepjs-families', 'package.json')
        )
      ).version,
    };
    for (const [dep, version] of Object.entries(workspaceVersions)) {
      const range = pkg.dependencies[dep];
      expect(range, `template must depend on ${dep}`).toBeDefined();
      expect(
        caretSatisfies(version, range ?? ''),
        `template range ${dep}@${range} must match the workspace version ${version}`
      ).toBe(true);
    }
  });

  it('configures the lib support that using-declarations need', async () => {
    const tsconfig = await readJson<{ compilerOptions: { lib: readonly string[] } }>(
      join(target, 'tsconfig.json')
    );
    expect(tsconfig.compilerOptions.lib).toContain('ESNext.Disposable');
  });
});
