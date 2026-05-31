import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';
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
