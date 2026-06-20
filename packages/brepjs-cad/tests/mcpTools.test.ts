import { describe, it, expect } from 'vitest';
import { runProgramTool } from '@/mcp/tools.js';

const VALID_PART = `import { box } from 'brepjs';\nexport default () => box(10, 10, 10);\n`;
const RUNAWAY_PART = `export default () => {\n  // eslint-disable-next-line\n  while (true) {}\n};\n`;

describe('runProgramTool (MCP run_program handler)', () => {
  it('returns a non-error result with the verify report for a valid part', async () => {
    const res = await runProgramTool({ code: VALID_PART });
    expect(res.isError).toBeFalsy();
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    const payload = JSON.parse(text) as { outcome: string; ok: boolean; report: { measurements: { volume?: number } } };
    expect(payload.outcome).toBe('completed');
    expect(payload.ok).toBe(true);
    expect(payload.report.measurements.volume).toBeCloseTo(1000, 1);
  }, 60000);

  it('returns an error result when a part runs away (timeout)', async () => {
    const res = await runProgramTool({ code: RUNAWAY_PART, timeoutMs: 8000 });
    expect(res.isError).toBe(true);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toContain('timeout');
  }, 30000);

  it('rejects empty code without running the sandbox', async () => {
    const res = await runProgramTool({ code: '   ' });
    expect(res.isError).toBe(true);
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '';
    expect(text).toContain('code');
  });
});
