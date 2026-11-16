import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VerifyReport } from '@/verify/report.js';

type SerializedReport = VerifyReport & { ok: boolean };

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const cli = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));

describe('verify CLI', () => {
  it('prints an ok report and writes STEP (primary) + GLB', () => {
    const step = '/tmp/brepjs-agent-cli.step';
    const glb = '/tmp/brepjs-agent-cli.glb';
    for (const f of [step, glb]) if (existsSync(f)) rmSync(f);
    const stdout = execFileSync(
      'npx',
      ['tsx', cli, fix('validBox.brep.ts'), '--step', step, '--glb', glb],
      {
        encoding: 'utf8',
        cwd: pkgRoot,
      }
    );
    const json = JSON.parse(stdout) as SerializedReport;
    expect(json.ok).toBe(true);
    expect(json.measurements.volume).toBeCloseTo(1000, 1);
    expect(existsSync(step)).toBe(true);
    expect(existsSync(glb)).toBe(true);
  }, 60000);

  let bannerDir = '';
  afterEach(() => {
    if (bannerDir) rmSync(bannerDir, { recursive: true, force: true });
  });

  it('keeps the OCCT STEP transfer banner out of stderr', () => {
    bannerDir = mkdtempSync(join(tmpdir(), 'brep-banner-'));
    const step = join(bannerDir, 'part.step');
    const run = spawnSync('npx', ['tsx', cli, fix('validBox.brep.ts'), '--step', step], {
      encoding: 'utf8',
      cwd: pkgRoot,
    });
    expect(run.status).toBe(0);
    expect(existsSync(step)).toBe(true);
    expect(run.stderr).not.toContain('Statistics on Transfer');
    expect(run.stderr).not.toMatch(/^\*{6}/m);
  }, 60000);
});

describe('init CLI', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  it('scaffolds files into --out and prints a clean JSON manifest', () => {
    dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-cli-init-'));
    const stdout = execFileSync('npx', ['tsx', cli, 'init', 'gizmo', '--out', dir], {
      encoding: 'utf8',
      cwd: pkgRoot,
    });
    const manifest = JSON.parse(stdout) as { files: { path: string; created: boolean }[] };
    expect(manifest.files.every((f) => f.created)).toBe(true);
    expect(existsSync(join(dir, 'gizmo.brep.ts'))).toBe(true);
    expect(existsSync(join(dir, 'tsconfig.json'))).toBe(true);
  }, 30000);
});

describe('export CLI', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  it('writes requested artifacts for a valid part', () => {
    dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-cli-export-'));
    const stdout = execFileSync(
      'npx',
      ['tsx', cli, 'export', fix('validBox.brep.ts'), '--step', '--stl', '--out', dir],
      { encoding: 'utf8', cwd: pkgRoot }
    );
    const result = JSON.parse(stdout) as { ok: boolean; written: string[] };
    expect(result.ok).toBe(true);
    expect(existsSync(join(dir, 'validBox.step'))).toBe(true);
    expect(existsSync(join(dir, 'validBox.stl'))).toBe(true);
  }, 60000);

  it('exits nonzero and writes nothing for an invalid part', () => {
    dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-cli-export-bad-'));
    let exitCode = 0;
    try {
      execFileSync(
        'npx',
        ['tsx', cli, 'export', fix('degenerate.brep.ts'), '--all', '--out', dir],
        { encoding: 'utf8', cwd: pkgRoot }
      );
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(1);
    expect(existsSync(join(dir, 'degenerate.step'))).toBe(false);
  }, 60000);
});

describe('--param', () => {
  const run = (...args: string[]) =>
    spawnSync('npx', ['tsx', cli, ...args], { encoding: 'utf8', cwd: pkgRoot });

  it('builds the part with the given values', () => {
    const r = run(fix('paramBox.brep.ts'), '--param', 'width=40', '--param', 'height=20');
    const json = JSON.parse(r.stdout) as SerializedReport;
    expect(r.status).toBe(0);
    expect(json.params).toEqual({ width: 40, height: 20, label: 'a' });
    expect(json.measurements.volume).toBeCloseTo(8000, 1);
  }, 60000);

  it('exits 1 with the error code when a value is outside its limits', () => {
    const r = run(fix('paramBox.brep.ts'), '--param', 'width=500');
    const json = JSON.parse(r.stdout) as SerializedReport;
    expect(r.status).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.errorInfos[0]?.code).toBe('PARAM_OUT_OF_RANGE');
  }, 60000);

  it('rejects a flag with no name=value form', () => {
    const r = run(fix('paramBox.brep.ts'), '--param', 'width');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('expected name=value');
  }, 60000);

  it('exports with the given values', () => {
    const out = mkdtempSync(join(tmpdir(), 'brep-param-export-'));
    try {
      const r = run(
        'export',
        fix('paramBox.brep.ts'),
        '--step',
        '--out',
        out,
        '--param',
        'width=40'
      );
      expect(r.status).toBe(0);
      expect(existsSync(join(out, 'paramBox.step'))).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60000);
});
