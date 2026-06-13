import { describe, it, expect } from 'vitest';
import { runProgram } from '@/sandbox/runProgram.js';

const VALID_PART = `import { box } from 'brepjs';\nexport default () => box(10, 10, 10);\n`;
// A synchronous infinite loop blocks the child's event loop — only an out-of-process
// timeout/kill can stop it, which is exactly what the sandbox must guarantee.
const RUNAWAY_PART = `export default () => {\n  // eslint-disable-next-line\n  while (true) {}\n};\n`;

describe('runProgram (sandbox executor)', () => {
  it('runs a valid part in a child process and returns a completed report', async () => {
    const res = await runProgram(VALID_PART);
    expect(res.outcome).toBe('completed');
    if (res.outcome === 'completed') {
      expect(res.report.ok).toBe(true);
      expect(res.report.measurements.volume).toBeCloseTo(1000, 1);
    }
  }, 60000);

  it('kills a runaway (infinite-loop) part and reports a timeout', async () => {
    const res = await runProgram(RUNAWAY_PART, { timeoutMs: 8000 });
    expect(res.outcome).toBe('timeout');
    if (res.outcome === 'timeout') expect(res.timeoutMs).toBe(8000);
  }, 30000);

  it('reports crashed when the runner produces no report (bad CLI entry)', async () => {
    // A non-existent .js entry runs under `node` and exits non-zero with no JSON on stdout —
    // exactly the "the child died without a report" path the crashed outcome must catch.
    const res = await runProgram(VALID_PART, { cliEntry: '/nonexistent/brepjs-verify-cli.js' });
    expect(res.outcome).toBe('crashed');
    if (res.outcome === 'crashed') expect(res.detail.length).toBeGreaterThan(0);
  }, 30000);
});
