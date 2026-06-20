import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRunRecord, appendRunRecord } from '@/sandbox/runRecord.js';
import type { RunProgramResult } from '@/sandbox/runProgram.js';

const COMPLETED: RunProgramResult = {
  outcome: 'completed',
  report: {
    ok: true,
    shapeType: 'Solid',
    checks: [],
    measurements: { volume: 1000 },
    topology: { faceCount: 6, edgeCount: 12, wireCount: 6, vertexCount: 8 },
    errors: [],
    errorInfos: [],
    hints: [],
    assertions: [],
  },
};
const TIMED_OUT: RunProgramResult = { outcome: 'timeout', timeoutMs: 8000 };
const fixedNow = (): Date => new Date('2026-06-13T00:00:00.000Z');

describe('buildRunRecord', () => {
  it('captures a completed run with measurements and a stable, content-addressed hash', () => {
    const r = buildRunRecord('export default () => box(1, 1, 1);', COMPLETED, fixedNow);
    expect(r.outcome).toBe('completed');
    expect(r.ok).toBe(true);
    expect(r.measurements?.volume).toBe(1000);
    expect(r.topology?.faceCount).toBe(6);
    expect(r.timestamp).toBe('2026-06-13T00:00:00.000Z');
    expect(r.resultHash).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic: same program + result → same hash.
    const again = buildRunRecord('export default () => box(1, 1, 1);', COMPLETED, fixedNow);
    expect(again.resultHash).toBe(r.resultHash);
  });

  it('captures a timeout as not-ok with no measurements', () => {
    const r = buildRunRecord('while(true){}', TIMED_OUT, fixedNow);
    expect(r.outcome).toBe('timeout');
    expect(r.ok).toBe(false);
    expect(r.measurements).toBeUndefined();
  });
});

describe('appendRunRecord', () => {
  it('appends exactly one JSONL line per record', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'brepjs-rec-'));
    const path = join(dir, 'runs.jsonl');
    try {
      await appendRunRecord(path, buildRunRecord('a', COMPLETED, fixedNow));
      await appendRunRecord(path, buildRunRecord('b', TIMED_OUT, fixedNow));
      const lines = (await readFile(path, 'utf8')).trim().split('\n');
      expect(lines).toHaveLength(2);
      const [first, second] = lines;
      expect((JSON.parse(first ?? '{}') as { outcome: string }).outcome).toBe('completed');
      expect((JSON.parse(second ?? '{}') as { outcome: string }).outcome).toBe('timeout');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
