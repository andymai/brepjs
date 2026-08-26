import { describe, it, expect } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VerifyReport } from '@/verify/report.js';

type SerializedReport = VerifyReport & { ok: boolean };

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cli = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/tsxProject', import.meta.url));

// The node:module hooks only govern real ESM resolution, which vitest's module runner
// bypasses in-process — so every loader test runs the CLI in a child process, the same
// way a user does.
describe('TSX loader', () => {
  it('verifies a multi-file TSX families project (with --check) through the hook', () => {
    const stdout = execFileSync('npx', ['tsx', cli, join(fixtureDir, 'main.tsx'), '--check'], {
      encoding: 'utf8',
      cwd: pkgRoot,
    });
    const json = JSON.parse(stdout) as SerializedReport;
    expect(json.errors, json.errors.join('; ')).toEqual([]);
    expect(json.ok).toBe(true);
    // 20x10x4 from dims.ts, threaded through JSX props and resolve() — proves the .tsx
    // transform, the automatic jsx-runtime import, and the .js -> .ts/.tsx fallback all
    // executed in the one kernel realm.
    expect(json.measurements.volume).toBeCloseTo(800, 1);
  }, 120000);
});

describe('brep watch', () => {
  it('re-verifies with fresh module state when a dependency file changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-watch-'));
    const reports: SerializedReport[] = [];
    const child = spawnWatch(dir, reports);
    try {
      await waitFor(() => reports.length >= 1, 90000, 'first watch report');
      expect(reports[0]?.measurements.volume).toBeCloseTo(800, 1);
      // Edit a DEPENDENCY, not the entry: proves the tree watcher sees it AND that the
      // rerun imports fresh module state instead of the first version cached by URL.
      writeFileSync(
        join(dir, 'dims.ts'),
        'export const panelSize: readonly [number, number, number] = [20, 10, 8];\n'
      );
      await waitFor(() => reports.length >= 2, 90000, 'post-edit watch report');
      expect(reports[1]?.measurements.volume).toBeCloseTo(1600, 1);
      // Edit tsconfig.json: the rerun must read the NEW jsx config (per-generation cache
      // invalidation in the hook), so a bogus jsxImportSource now fails the import.
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            module: 'esnext',
            moduleResolution: 'bundler',
            target: 'es2022',
            strict: true,
            jsx: 'react-jsx',
            jsxImportSource: 'brepjs-families/bogus',
          },
        })
      );
      await waitFor(() => reports.length >= 3, 90000, 'post-tsconfig-edit watch report');
      expect(reports[2]?.ok).toBe(false);
    } finally {
      child.kill('SIGTERM');
      await new Promise((res) => child.once('exit', res));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240000);
});

function spawnWatch(dir: string, reports: SerializedReport[]) {
  cpSync(fixtureDir, dir, { recursive: true });
  // Bare imports (brepjs-families) must resolve from the tmp copy; link the repo's
  // installed tree rather than paying for an install.
  symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir');
  const child = spawn('npx', ['tsx', cli, 'watch', join(dir, 'main.tsx')], { cwd: pkgRoot });
  let buffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    // serializeReport pretty-prints, so each report is a multi-line JSON object; the
    // top-level close brace on its own line is the report boundary.
    for (let end = buffer.indexOf('\n}\n'); end >= 0; end = buffer.indexOf('\n}\n')) {
      const chunkText = buffer.slice(0, end + 2);
      buffer = buffer.slice(end + 3);
      reports.push(JSON.parse(chunkText) as SerializedReport);
    }
  });
  return child;
}

function waitFor(cond: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const started = Date.now();
  return new Promise((res, rej) => {
    const tick = () => {
      if (cond()) return res();
      if (Date.now() - started > timeoutMs) return rej(new Error(`timed out waiting for ${what}`));
      setTimeout(tick, 250);
    };
    tick();
  });
}
