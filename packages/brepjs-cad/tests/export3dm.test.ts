import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rhino3dm from 'rhino3dm';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const cli = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));
const fixtureDir = fileURLToPath(new URL('./fixtures/tsxProject', import.meta.url));

interface Export3dmSummary {
  ok: boolean;
  written: string[];
  elements: number;
  failed: string[];
}

function run3dm(entry: string, outDir: string): Export3dmSummary {
  const stdout = execFileSync('npx', ['tsx', cli, 'export', entry, '--3dm', '--out', outDir], {
    encoding: 'utf8',
    cwd: pkgRoot,
  });
  return JSON.parse(stdout) as Export3dmSummary;
}

describe('brep export --3dm', () => {
  it('writes one named, layered mesh object per element of a families tree', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-3dm-'));
    try {
      // A nested, not-yet-existing out dir: the exporter must create it.
      const summary = run3dm(join(fixtureDir, 'model.tsx'), join(dir, 'nested', 'out'));
      expect(summary.ok).toBe(true);
      expect(summary.elements).toBe(1);
      const rh = await rhino3dm();
      const doc = rh.File3dm.fromByteArray(readFileSync(join(dir, 'nested', 'out', 'model.3dm')));
      expect(doc.objects().count).toBe(1);
      const obj = doc.objects().get(0);
      expect(obj.attributes().name).toBe('assembly/panel');
      const layer = doc.layers().get(obj.attributes().layerIndex);
      expect(layer.name).toBe('assembly');
      const mesh = obj.geometry() as InstanceType<typeof rh.Mesh>;
      expect(mesh.faces().count).toBeGreaterThan(0);
      expect(mesh.vertices().count).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);

  it('exports a plain-shape module as a single object', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-3dm-shape-'));
    try {
      const summary = run3dm(join(fixtureDir, 'main.tsx'), dir);
      expect(summary.ok).toBe(true);
      expect(summary.elements).toBe(1);
      const rh = await rhino3dm();
      const doc = rh.File3dm.fromByteArray(readFileSync(join(dir, 'main.3dm')));
      expect(doc.objects().count).toBe(1);
      expect(doc.objects().get(0).attributes().name).toBe('part');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120000);
});
