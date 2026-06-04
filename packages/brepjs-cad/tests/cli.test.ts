import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
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
    const stdout = execFileSync('npx', ['tsx', cli, fix('validBox.brep.ts'), '--step', step, '--glb', glb], {
      encoding: 'utf8', cwd: pkgRoot,
    });
    const json = JSON.parse(stdout) as SerializedReport;
    expect(json.ok).toBe(true);
    expect(json.measurements.volume).toBeCloseTo(1000, 1);
    expect(existsSync(step)).toBe(true);
    expect(existsSync(glb)).toBe(true);
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
      encoding: 'utf8', cwd: pkgRoot,
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
      { encoding: 'utf8', cwd: pkgRoot },
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
        { encoding: 'utf8', cwd: pkgRoot },
      );
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 0;
    }
    expect(exitCode).toBe(1);
    expect(existsSync(join(dir, 'degenerate.step'))).toBe(false);
  }, 60000);
});
