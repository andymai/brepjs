import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportProgram } from '@/sandbox/runProgram.js';
import { exportPartTool } from '@/mcp/tools.js';

const VALID_PART = `import { box } from 'brepjs';\nexport default () => box(10, 10, 10);\n`;

describe('exportProgram (sandbox export)', () => {
  it('exports a STEP artifact for a valid part into the given directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brepjs-exp-'));
    try {
      const res = await exportProgram(VALID_PART, dir, { step: true });
      expect(res.outcome).toBe('completed');
      if (res.outcome === 'completed') {
        expect(res.ok).toBe(true);
        expect(res.written.some((p) => p.endsWith('.step'))).toBe(true);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('fails clearly (without spawning) when no formats are selected', async () => {
    const res = await exportProgram(VALID_PART, '/tmp', {});
    expect(res.outcome).toBe('crashed');
    if (res.outcome === 'crashed') expect(res.detail).toContain('format');
  });
});

describe('exportPartTool (MCP export_part handler)', () => {
  it('returns the written artifacts for a valid part', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brepjs-exp-'));
    try {
      const res = await exportPartTool({ code: VALID_PART, outDir: dir, formats: { step: true } });
      expect(res.isError).toBeFalsy();
      const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
      const payload = JSON.parse(text) as { ok: boolean; written: string[] };
      expect(payload.ok).toBe(true);
      expect(payload.written.length).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);

  it('rejects missing code or outDir without running the sandbox', async () => {
    expect((await exportPartTool({ code: '   ', outDir: '/tmp' })).isError).toBe(true);
    expect((await exportPartTool({ code: 'x', outDir: '  ' })).isError).toBe(true);
  });
});
