import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init } from 'brepjs';
import { exportPart } from '@/cli/exportPart.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

describe('exportPart', () => {
  let out: string;
  beforeAll(async () => {
    await init();
  }, 30000);
  beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'brepjs-verify-export-'));
  });
  afterEach(() => {
    rmSync(out, { recursive: true, force: true });
  });

  it('writes only requested formats for a valid part', async () => {
    const result = await exportPart(fix('validBox.brep.ts'), { step: true, stl: true }, out);
    expect(result.ok).toBe(true);
    expect(existsSync(join(out, 'validBox.step'))).toBe(true);
    expect(existsSync(join(out, 'validBox.stl'))).toBe(true);
    expect(existsSync(join(out, 'validBox.glb'))).toBe(false);
  }, 60000);

  it('writes all three formats with --all equivalent', async () => {
    const result = await exportPart(
      fix('validBox.brep.ts'),
      { step: true, glb: true, stl: true },
      out,
    );
    expect(result.ok).toBe(true);
    expect(result.written.length).toBe(3);
    expect(existsSync(join(out, 'validBox.glb'))).toBe(true);
  }, 60000);

  it('gates on validity: writes nothing for an invalid part', async () => {
    const result = await exportPart(fix('degenerate.brep.ts'), { step: true, stl: true }, out);
    expect(result.ok).toBe(false);
    expect(result.written.length).toBe(0);
    expect(existsSync(join(out, 'degenerate.step'))).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  }, 60000);
});
