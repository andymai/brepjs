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

// Minimal range check for the shapes the template uses ("^x.y.z",
// ">=x.y.z <a.b.c", "||"), so the test needs no semver dependency.
function parseVersion(v: string): readonly [number, number, number] {
  const [maj = NaN, min = NaN, pat = NaN] = v.split('.').map(Number);
  return [maj, min, pat];
}

function compare(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function caretSatisfies(version: string, clause: string): boolean {
  const lower = parseVersion(clause.slice(1));
  const actual = parseVersion(version);
  if (lower.some(Number.isNaN) || actual.some(Number.isNaN)) return false;
  if (actual[0] !== lower[0]) return false;
  if (lower[0] > 0) return compare(actual, lower) >= 0;
  if (actual[1] !== lower[1]) return false;
  return actual[2] >= lower[2];
}

function comparatorSatisfies(version: string, clause: string): boolean {
  const actual = parseVersion(version);
  if (actual.some(Number.isNaN)) return false;
  return clause.split(/\s+/).every((token) => {
    if (token.startsWith('>=')) return compare(actual, parseVersion(token.slice(2))) >= 0;
    if (token.startsWith('<')) return compare(actual, parseVersion(token.slice(1))) < 0;
    return false;
  });
}

function rangeSatisfies(version: string, range: string): boolean {
  return range.split('||').some((part) => {
    const clause = part.trim();
    return clause.startsWith('^')
      ? caretSatisfies(version, clause)
      : comparatorSatisfies(version, clause);
  });
}

describe('rangeSatisfies', () => {
  it('handles the range shapes the template uses', () => {
    expect(rangeSatisfies('18.151.1', '^18.0.0')).toBe(true);
    expect(rangeSatisfies('19.0.0', '^18.0.0')).toBe(false);
    expect(rangeSatisfies('0.7.1', '^0.7.0')).toBe(true);
    expect(rangeSatisfies('0.7.1', '^0.1.0')).toBe(false);
    expect(rangeSatisfies('6.0.3', '^5.2.0 || ^6.0.0')).toBe(true);
    expect(rangeSatisfies('0.8.1', '>=0.8.0 <1.0.0')).toBe(true);
    expect(rangeSatisfies('0.9.4', '>=0.8.0 <1.0.0')).toBe(true);
    expect(rangeSatisfies('1.0.0', '>=0.8.0 <1.0.0')).toBe(false);
    expect(rangeSatisfies('0.7.9', '>=0.8.0 <1.0.0')).toBe(false);
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
    await expect(readFile(join(target, 'src', 'main.tsx'), 'utf8')).resolves.toContain(
      'brepjs-families'
    );
  });

  it('depends on a kernel package', async () => {
    const pkg = await readJson<ScaffoldPkg>(join(target, 'package.json'));
    expect(pkg.dependencies['occt-wasm']).toBeDefined();
  });

  it('declares ranges the current workspace versions satisfy', async () => {
    const pkg = await readJson<ScaffoldPkg>(join(target, 'package.json'));
    const workspaceVersion = async (rel: string): Promise<string> =>
      (await readJson<{ version: string }>(join(repoRoot, rel, 'package.json'))).version;
    const deps: Record<string, string> = {
      brepjs: await workspaceVersion('.'),
      'brepjs-families': await workspaceVersion('packages/brepjs-families'),
      'brepjs-bim': await workspaceVersion('packages/brepjs-bim'),
    };
    for (const [dep, version] of Object.entries(deps)) {
      const range = pkg.dependencies[dep];
      expect(range, `template must depend on ${dep}`).toBeDefined();
      expect(
        rangeSatisfies(version, range ?? ''),
        `template range ${dep}@${range} must match the workspace version ${version}`
      ).toBe(true);
    }
    const cadRange = pkg.devDependencies?.['brepjs-cad'];
    const cadVersion = await workspaceVersion('packages/brepjs-cad');
    expect(cadRange, 'template must dev-depend on brepjs-cad').toBeDefined();
    expect(
      rangeSatisfies(cadVersion, cadRange ?? ''),
      `template range brepjs-cad@${cadRange} must match the workspace version ${cadVersion}`
    ).toBe(true);
  });

  it('configures the libs and types the template code needs', async () => {
    const tsconfig = await readJson<{
      compilerOptions: { lib: readonly string[]; types: readonly string[] };
    }>(join(target, 'tsconfig.json'));
    expect(tsconfig.compilerOptions.lib).toContain('ESNext.Disposable');
    // TypeScript 6 no longer auto-includes @types packages.
    expect(tsconfig.compilerOptions.types).toContain('node');
  });

  // The full user journey against the live npm registry: install, typecheck,
  // evaluate the template model. Minutes of network-bound work, so it runs
  // where the packages-create CI job opts in rather than on every local run.
  const smoke = process.env['SCAFFOLD_SMOKE'] === '1' ? it : it.skip;

  smoke(
    'installs, typechecks, and runs against the published registry',
    async () => {
      // Drop the parent `npm run`'s npm_config_* env: leaked workspace flags
      // (e.g. allow-scripts) are rejected by the nested project-scoped install.
      const env = Object.fromEntries(
        Object.entries(process.env).filter(([k]) => !k.toLowerCase().startsWith('npm_config_'))
      );
      await run('npm', ['install', '--no-audit', '--no-fund'], { cwd: target, env });
      await run('npm', ['run', 'typecheck'], { cwd: target, env });
      const { stdout } = await run('npm', ['start'], { cwd: target, env });
      expect(stdout).toContain('triangles');
      const preview = await run('npm', ['run', 'preview', '--', '--write-only'], {
        cwd: target,
        env,
      });
      expect(preview.stdout).toContain('"ok": true');
      await run('npm', ['run', 'export:ifc'], { cwd: target, env });
      await expect(readFile(join(target, 'dist', 'model.ifc'), 'utf8')).resolves.toContain(
        'IFCWALL'
      );
      await run('npm', ['test'], { cwd: target, env });
    },
    900_000
  );
});
