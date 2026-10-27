import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeOutput, type Confirm } from '@/mcp/output.js';

const never: Confirm = () => Promise.resolve('unsupported');

describe('writeOutput', () => {
  it('replaces an approved file in one step, leaving nothing beside it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-output-'));
    try {
      const out = join(dir, 'issues.bcf');
      writeFileSync(out, 'old');
      expect(await writeOutput(never, out, 'new', true, 'a file')).toBeUndefined();
      expect(readFileSync(out, 'utf8')).toBe('new');
      expect(readdirSync(dir)).toEqual(['issues.bcf']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cleans up when the replacement cannot land', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-output-'));
    try {
      // A non-empty directory at the path makes the final rename fail after the write.
      const out = join(dir, 'issues.bcf');
      mkdirSync(out);
      writeFileSync(join(out, 'keep'), 'x');
      await expect(writeOutput(never, out, 'new', true, 'a file')).rejects.toThrow();
      expect(readdirSync(dir)).toEqual(['issues.bcf']);
      expect(readdirSync(out)).toEqual(['keep']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('asks before replacing a file it was not approved to replace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brepjs-cad-output-'));
    try {
      const out = join(dir, 'a.csv');
      writeFileSync(out, 'old');
      const stop = await writeOutput(never, out, 'new', false, 'a schedule');
      expect(stop?.isError).toBe(true);
      expect(readFileSync(out, 'utf8')).toBe('old');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
