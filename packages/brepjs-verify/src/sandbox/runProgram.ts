/**
 * Sandbox executor — run agent-authored brepjs TypeScript in an isolated child process.
 *
 * The program is written to a temp ESM directory and executed by the verify CLI in a separate
 * process, with a wall-clock timeout and a memory cap. Out-of-process execution is what makes the
 * loop *unattended-safe*: a runaway (CPU-bound infinite loop) or memory-hungry part is killed
 * rather than hanging or crashing the host. Results cross the boundary as the serialized verify
 * report (never live WASM handles), and the temp directory is always cleaned up.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VerifyReport } from '../verify/report.js';

const execFileAsync = promisify(execFile);

/** The verify report as serialized by the CLI (the report plus the top-level `ok` verdict). */
export type SerializedReport = VerifyReport & { ok: boolean };

/** Outcome of a sandboxed run. `completed` includes not-ok reports (the part built but failed checks). */
export type RunProgramResult =
  | { outcome: 'completed'; report: SerializedReport }
  | { outcome: 'timeout'; timeoutMs: number }
  | { outcome: 'crashed'; exitCode: number | null; detail: string };

export interface RunProgramOptions {
  /** Wall-clock budget; the child is SIGKILLed past it. Default 30000. */
  timeoutMs?: number;
  /** Child heap cap (`--max-old-space-size`), in MB. Default 2048. */
  maxMemoryMb?: number;
  /**
   * CLI entry to spawn. Defaults to the in-repo TypeScript CLI (run via `tsx`), which is correct
   * for dev/test. Production callers pass the built `dist/cli/main.js` (run via `node`). The runner
   * is inferred from the extension: `.ts` → `npx tsx`, otherwise the current `node`.
   */
  cliEntry?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_MEMORY_MB = 2048;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * Clamp a caller-supplied limit to a positive, finite value, falling back to the default otherwise.
 * Critical for the timeout: Node's `execFile` treats `timeout: 0` (and it ignores negatives) as
 * "no timeout", which would silently disable the sandbox's only runaway protection.
 */
export function positiveOrDefault(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function defaultCliEntry(): string {
  // runProgram and the CLI share a build root: dist/cli/main.js in a built/published package,
  // src/cli/main.ts in dev/test. Prefer the built JS so the default works in production too.
  const builtJs = fileURLToPath(new URL('../cli/main.js', import.meta.url));
  if (existsSync(builtJs)) return builtJs;
  return fileURLToPath(new URL('../cli/main.ts', import.meta.url));
}

function tryParseReport(out: string | undefined): SerializedReport | null {
  if (!out || !out.trim()) return null;
  try {
    return JSON.parse(out) as SerializedReport;
  } catch {
    return null;
  }
}

/** Execute `code` (an agent-authored `.brep.ts` module) in an isolated, resource-bounded child. */
export async function runProgram(
  code: string,
  opts: RunProgramOptions = {}
): Promise<RunProgramResult> {
  // Clamp to positive defaults: a non-positive timeout would disable the kill budget entirely.
  const timeoutMs = positiveOrDefault(opts.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxMemoryMb = positiveOrDefault(opts.maxMemoryMb, DEFAULT_MAX_MEMORY_MB);
  const cliEntry = opts.cliEntry ?? defaultCliEntry();
  const useTsx = cliEntry.endsWith('.ts');

  const dir = await mkdtemp(join(tmpdir(), 'brepjs-run-'));
  try {
    // Seed an ESM package so the part resolves as a module (matches the verify CLI's expectations).
    await writeFile(join(dir, 'package.json'), '{"type":"module"}\n');
    const partPath = join(dir, 'part.brep.ts');
    await writeFile(partPath, code);

    const cmd = useTsx ? 'npx' : process.execPath;
    const args = useTsx
      ? ['tsx', cliEntry, partPath, '--check']
      : [cliEntry, partPath, '--check'];

    try {
      const { stdout } = await execFileAsync(cmd, args, {
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        env: {
          ...process.env,
          // Append rather than replace, so an existing NODE_OPTIONS (flags, other limits) survives.
          NODE_OPTIONS: [process.env['NODE_OPTIONS'], `--max-old-space-size=${maxMemoryMb}`]
            .filter(Boolean)
            .join(' '),
        },
      });
      const report = tryParseReport(stdout);
      if (report) return { outcome: 'completed', report };
      return { outcome: 'crashed', exitCode: 0, detail: 'no JSON report on stdout' };
    } catch (err) {
      const e = err as {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        code?: number | string | null;
      };
      // A not-ok part exits 1 but still prints its JSON report — that is a completed run.
      const report = tryParseReport(e.stdout);
      if (report) return { outcome: 'completed', report };
      // Output cap exceeded also kills the child; classify it distinctly from a timeout.
      if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        return { outcome: 'crashed', exitCode: null, detail: 'output exceeded size limit' };
      }
      if (e.killed) return { outcome: 'timeout', timeoutMs };
      const detail = e.stderr || (err instanceof Error ? err.message : String(err));
      return {
        outcome: 'crashed',
        exitCode: typeof e.code === 'number' ? e.code : null,
        detail: detail.slice(0, 2000),
      };
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
