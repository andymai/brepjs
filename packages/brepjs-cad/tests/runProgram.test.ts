import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProgram, runProgramWithStep, positiveOrDefault } from '@/sandbox/runProgram.js';

const VALID_PART = `import { box } from 'brepjs';\nexport default () => box(10, 10, 10);\n`;
// A synchronous infinite loop blocks the child's event loop — only an out-of-process
// timeout/kill can stop it, which is exactly what the sandbox must guarantee.
const RUNAWAY_PART = `export default () => {\n  // eslint-disable-next-line\n  while (true) {}\n};\n`;
// A part that throws builds no shape — a completed (ok:false) report with no STEP artifact.
const INVALID_PART = `export default () => {\n  throw new Error('boom');\n};\n`;

// The dev/test sandbox runs the CLI via `npx tsx <main.ts>`, which spawns the part-executing
// `node` as a GRANDCHILD behind npx+tsx. Pinning the `.ts` entry forces that grandchild chain
// (rather than a built `dist/.../main.js`, which would run as a single direct child).
const TS_CLI_ENTRY = fileURLToPath(new URL('../src/cli/main.ts', import.meta.url));

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = the process exists but we don't own it (still "alive"); ESRCH = gone.
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

  it('kills the whole process tree (leaf included), not just the direct child, on timeout', async () => {
    // The runaway records the LEAF pid — the `node` process actually running the part — to a file
    // before spinning. If the timeout only SIGKILLs the direct child (npx), this leaf is orphaned
    // and keeps burning a core indefinitely. The sandbox must reap the whole tree.
    const pidFile = join(tmpdir(), `brepjs-orphan-leaf-${process.pid}-${Date.now()}.pid`);
    const PID_RECORDING_RUNAWAY = [
      `import { writeFileSync } from 'node:fs';`,
      `export default () => {`,
      `  writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
      `  // eslint-disable-next-line`,
      `  while (true) {}`,
      `};`,
      ``,
    ].join('\n');

    let leafPid: number | undefined;
    try {
      const res = await runProgram(PID_RECORDING_RUNAWAY, {
        timeoutMs: 10000,
        cliEntry: TS_CLI_ENTRY,
      });
      expect(res.outcome).toBe('timeout');

      // The leaf actually started executing the part before the kill (otherwise the test below
      // would be vacuous — it'd "pass" only because the part never ran).
      expect(existsSync(pidFile)).toBe(true);
      leafPid = Number(readFileSync(pidFile, 'utf8'));
      expect(Number.isInteger(leafPid)).toBe(true);

      // Poll (don't fix-wait) for the leaf to be reaped — avoids flakiness from the brief
      // dead-but-not-yet-reaped window on loaded machines.
      for (let i = 0; i < 80 && isAlive(leafPid); i++) await delay(100);
      expect(isAlive(leafPid)).toBe(false);
    } finally {
      if (leafPid !== undefined && isAlive(leafPid)) {
        try {
          process.kill(leafPid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
      if (existsSync(pidFile)) rmSync(pidFile, { force: true });
    }
  }, 45000);

  it('reaps an in-flight sandbox when the host process is terminated (host-death)', async () => {
    // The per-run timeout protects a run only while the host's timer is alive. If the host (the MCP
    // server) is stopped mid-build, its detached sandbox group must still be reaped — not orphaned
    // to spin forever. This is the failure that left 13h-old runaways burning cores.
    const pidFile = join(tmpdir(), `brepjs-orphan-host-${process.pid}-${Date.now()}.pid`);
    const hostScript = fileURLToPath(new URL('./fixtures/sandboxHost.ts', import.meta.url));
    // Run the host as a direct `node` child (mirrors the production `node dist/mcp/server.js`), so
    // the SIGTERM lands on the process that installed the handlers — not on an `npx` wrapper.
    const host = spawn(process.execPath, ['--import', 'tsx', hostScript, pidFile], {
      stdio: 'ignore',
    });

    let leafPid = -1;
    try {
      // Wait until the sandbox leaf is actually executing the part.
      const deadline = Date.now() + 45000;
      while (!existsSync(pidFile)) {
        if (Date.now() > deadline) throw new Error('sandbox leaf never started');
        await delay(150);
      }
      leafPid = Number(readFileSync(pidFile, 'utf8'));
      expect(Number.isInteger(leafPid)).toBe(true);
      expect(isAlive(leafPid)).toBe(true);

      // Simulate the agent stopping the MCP server while a build is in flight.
      host.kill('SIGTERM');

      // The shutdown reaper must SIGKILL the whole sandbox tree, not orphan the spinning leaf.
      for (let i = 0; i < 80 && isAlive(leafPid); i++) await delay(100);
      expect(isAlive(leafPid)).toBe(false);
    } finally {
      if (leafPid > 0 && isAlive(leafPid)) {
        try {
          process.kill(leafPid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
      try {
        host.kill('SIGKILL');
      } catch {
        /* already gone */
      }
      if (existsSync(pidFile)) rmSync(pidFile, { force: true });
    }
  }, 70000);

  it('reports crashed when the runner produces no report (bad CLI entry)', async () => {
    // A non-existent .js entry runs under `node` and exits non-zero with no JSON on stdout —
    // exactly the "the child died without a report" path the crashed outcome must catch.
    const res = await runProgram(VALID_PART, { cliEntry: '/nonexistent/brepjs-cad-cli.js' });
    expect(res.outcome).toBe('crashed');
    if (res.outcome === 'crashed') expect(res.detail.length).toBeGreaterThan(0);
  }, 30000);
});

describe('runProgramWithStep (single-spawn report + STEP)', () => {
  it('runs a valid part and returns a completed report AND writes a STEP file at the given path', async () => {
    const stepPath = join(tmpdir(), `brepjs-rpws-${process.pid}-${Date.now()}.step`);
    try {
      const res = await runProgramWithStep(VALID_PART, stepPath);
      expect(res.outcome).toBe('completed');
      if (res.outcome === 'completed') {
        expect(res.report.ok).toBe(true);
        expect(res.report.measurements.volume).toBeCloseTo(1000, 1);
        // The STEP is written to the caller-supplied path and surfaced as stepPath.
        expect(res.stepPath).toBe(stepPath);
        expect(existsSync(stepPath)).toBe(true);
        // OCCT writes a standard ISO-10303-21 STEP document.
        expect(readFileSync(stepPath, 'utf8')).toMatch(/ISO-10303-21/);
      }
    } finally {
      if (existsSync(stepPath)) rmSync(stepPath, { force: true });
    }
  }, 60000);

  it('returns a completed (not-ok) report and no stepPath when the part builds no solid', async () => {
    const stepPath = join(tmpdir(), `brepjs-rpws-bad-${process.pid}-${Date.now()}.step`);
    try {
      const res = await runProgramWithStep(INVALID_PART, stepPath);
      expect(res.outcome).toBe('completed');
      if (res.outcome === 'completed') {
        expect(res.report.ok).toBe(false);
        // No valid solid ⇒ no STEP written ⇒ stepPath omitted.
        expect(res.stepPath).toBeUndefined();
        expect(existsSync(stepPath)).toBe(false);
      }
    } finally {
      if (existsSync(stepPath)) rmSync(stepPath, { force: true });
    }
  }, 60000);
});

describe('positiveOrDefault (timeout/memory guard)', () => {
  it('clamps non-positive and non-finite values to the default', () => {
    // A 0 or negative timeout would disable Node execFile's kill budget entirely.
    expect(positiveOrDefault(0, 30000)).toBe(30000);
    expect(positiveOrDefault(-5, 30000)).toBe(30000);
    expect(positiveOrDefault(undefined, 30000)).toBe(30000);
    expect(positiveOrDefault(Number.NaN, 30000)).toBe(30000);
    expect(positiveOrDefault(Infinity, 30000)).toBe(30000);
    expect(positiveOrDefault(8000, 30000)).toBe(8000);
  });
});
