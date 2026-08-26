import { describe, it, expect } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePreviewPayload, type PreviewModelPayload } from 'brepjs-viewer';
import { resolveFamiliesEntry } from '@/preview/evaluate.js';

interface PreviewSummary {
  ok: boolean;
  elements: number;
  failed: string[];
  measurements: { triangleCount: number; bounds?: { zMax: number } };
  viewer?: string;
}

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cli = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/tsxProject', import.meta.url));

describe('brep preview --write-only', () => {
  it('evaluates a families TSX model into summary + GLB artifacts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-preview-'));
    try {
      const glb = join(dir, 'model.glb');
      const json = join(dir, 'model.json');
      const stdout = execFileSync(
        'npx',
        [
          'tsx',
          cli,
          'preview',
          join(fixtureDir, 'main.tsx'),
          '--write-only',
          '--glb',
          glb,
          '--json',
          json,
        ],
        { encoding: 'utf8', cwd: pkgRoot }
      );
      const summary = JSON.parse(stdout) as PreviewSummary;
      expect(summary.ok).toBe(true);
      expect(summary.elements).toBe(1);
      expect(summary.failed).toEqual([]);
      expect(summary.measurements.triangleCount).toBeGreaterThan(0);
      expect(existsSync(glb)).toBe(true);
      expect(existsSync(json)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});

describe('brep preview module contract', () => {
  it('previews a tree rooted at a family component (function-typed element)', () => {
    const stdout = execFileSync(
      'npx',
      ['tsx', cli, 'preview', join(fixtureDir, 'component.tsx'), '--write-only'],
      { encoding: 'utf8', cwd: pkgRoot }
    );
    const summary = JSON.parse(stdout) as PreviewSummary;
    expect(summary.ok).toBe(true);
    expect(summary.elements).toBe(1);
  }, 120000);

  it('resolves the project-local brepjs-families ESM entry from the model path', () => {
    const abs = resolveFamiliesEntry(join(fixtureDir, 'main.tsx'));
    expect(abs).toBeDefined();
    expect(abs).toMatch(/brepjs-families[\\/]dist[\\/]/);
    expect(abs?.endsWith('.js')).toBe(true);
  });
});

describe('brep preview server', () => {
  it('serves the payload and pushes updates on watched edits', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-preview-watch-'));
    cpSync(fixtureDir, dir, { recursive: true });
    symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir');
    const child = spawn(
      'npx',
      ['tsx', cli, 'preview', join(dir, 'model.tsx'), '--watch', '--no-open'],
      { cwd: pkgRoot }
    );
    let stdout = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
    try {
      const summary = await waitFor(
        () => {
          const text = stdout.trim();
          if (!text.startsWith('{') || !text.endsWith('}')) return undefined;
          return JSON.parse(text) as PreviewSummary;
        },
        90000,
        'preview summary on stdout'
      );
      expect(summary.ok).toBe(true);
      expect(summary.viewer).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?preview=1$/);
      const origin = new URL(summary.viewer as string).origin;

      const first = await fetchPayload(origin);
      expect(first.elements).toHaveLength(1);
      expect(first.elements[0]?.keyPath).toBe('assembly/panel');
      expect(first.data.index.length).toBeGreaterThan(0);
      expect(first.data.edges.length).toBeGreaterThan(0);
      expect(first.tree?.type).toBe('Group');
      expect(first.tree?.children).toHaveLength(1);
      expect(first.measurements.bounds?.zMax).toBeCloseTo(4, 5);

      const events = await fetch(`${origin}/__preview/events`);
      expect(events.headers.get('content-type')).toBe('text/event-stream');
      await events.body?.cancel();

      // A malformed percent escape must 403, not crash the server (decodeURIComponent
      // would otherwise throw through the async handler and kill the process).
      const malformed = await fetch(`${origin}/%zz`);
      expect(malformed.status).toBe(403);
      expect((await fetchPayload(origin)).elements).toHaveLength(1);

      writeFileSync(
        join(dir, 'dims.ts'),
        'export const panelSize: readonly [number, number, number] = [20, 10, 8];\n'
      );
      await waitFor(
        async () => {
          const p = await fetchPayload(origin);
          return p.measurements.bounds?.zMax === 8 ? p : undefined;
        },
        90000,
        'updated payload after dependency edit'
      );
    } finally {
      await shutdown(child);
      rmSync(dir, { recursive: true, force: true });
    }
  }, 240000);
});

async function fetchPayload(origin: string): Promise<PreviewModelPayload> {
  const r = await fetch(`${origin}/__preview/model`);
  if (!r.ok) throw new Error(`fetch payload: ${r.status}`);
  return decodePreviewPayload(await r.arrayBuffer());
}

async function waitFor<T>(
  probe: () => T | undefined | Promise<T | undefined>,
  timeoutMs: number,
  what: string
): Promise<T> {
  const started = Date.now();
  for (;;) {
    let result: T | undefined;
    try {
      result = await probe();
    } catch {
      result = undefined;
    }
    if (result !== undefined) return result;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((res) => setTimeout(res, 250));
  }
}

function shutdown(child: ChildProcess): Promise<void> {
  return new Promise((res) => {
    child.once('exit', () => res());
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
}
