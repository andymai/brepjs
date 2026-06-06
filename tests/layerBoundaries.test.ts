/**
 * Negative tests proving the layer-boundary script actually rejects upward
 * imports (ADR-0013 §9 — "add negative tests proving enforcement is live").
 *
 * `scripts/check-layer-boundaries.sh` only emits a friendly "passed" line; a
 * silent escape (e.g. a layer dir missing from `get_layer`, falling through to
 * -1) would pass unnoticed. These tests run the real script against throwaway
 * fixtures via the `BOUNDARY_SRC_DIR` override, so nothing touches `src/`, and
 * assert it fails on forbidden imports and passes on allowed ones.
 *
 * Focus is the layers wired in for the voxel domain — voxel (L2) and lattice
 * (L3) — but the harness covers the general rule.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repoRoot, 'scripts', 'check-layer-boundaries.sh');

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a single fixture `<layerDir>/fixture.ts` importing `importPath` into a
 * throwaway scan root, run the boundary checker against it, and return the exit
 * status (0 = passed, non-zero = violation reported).
 */
function checkImport(layerDir: string, importPath: string): { status: number; out: string } {
  const root = mkdtempSync(join(tmpdir(), 'brepjs-boundary-'));
  tmpDirs.push(root);
  mkdirSync(join(root, layerDir), { recursive: true });
  writeFileSync(join(root, layerDir, 'fixture.ts'), `import { thing } from '${importPath}';\n`);

  const result = spawnSync('bash', [script], {
    cwd: repoRoot,
    env: { ...process.env, BOUNDARY_SRC_DIR: root },
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
}

describe('layer boundaries: forbidden upward imports are rejected', () => {
  it('voxel (L2) → lattice (L3) is a violation', () => {
    const { status, out } = checkImport('voxel', '@/lattice/index.js');
    expect(status).not.toBe(0);
    expect(out).toMatch(/VIOLATION/);
  });

  it('voxel (L2) → sketching (L3) is a violation', () => {
    expect(checkImport('voxel', '@/sketching/index.js').status).not.toBe(0);
  });

  it('core (L1) → voxel (L2) is a violation (voxel sits above core)', () => {
    expect(checkImport('core', '@/voxel/index.js').status).not.toBe(0);
  });

  it('kernel (L0) → lattice (L3) is a violation (lattice is top-layer)', () => {
    expect(checkImport('kernel', '@/lattice/index.js').status).not.toBe(0);
  });
});

describe('layer boundaries: allowed downward / same-layer imports pass', () => {
  it('lattice (L3) → voxel (L2) is allowed', () => {
    expect(checkImport('lattice', '@/voxel/index.js').status).toBe(0);
  });

  it('voxel (L2) → topology (L2) is allowed (same layer)', () => {
    expect(checkImport('voxel', '@/topology/index.js').status).toBe(0);
  });

  it('voxel (L2) → core (L1) is allowed (downward)', () => {
    expect(checkImport('voxel', '@/core/result.js').status).toBe(0);
  });
});
