/**
 * Sandbox executor — run agent-authored brepjs TypeScript in an isolated child process.
 *
 * The program is written to a temp ESM directory and executed by the verify CLI in a separate
 * process, with a wall-clock timeout and a memory cap. Out-of-process execution is what makes the
 * loop *unattended-safe*: a runaway (CPU-bound infinite loop) or memory-hungry part is killed
 * rather than hanging or crashing the host. Results cross the boundary as serialized JSON (never
 * live WASM handles), and the temp program directory is always cleaned up.
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

/** Outcome of a sandboxed export. `completed` carries the written artifact paths and any errors. */
export type ExportProgramResult =
  | { outcome: 'completed'; ok: boolean; written: string[]; errors: string[] }
  | { outcome: 'timeout'; timeoutMs: number }
  | { outcome: 'crashed'; exitCode: number | null; detail: string };

export interface SandboxOptions {
  /** Wall-clock budget; the child is SIGKILLed past it. Default 30000. */
  timeoutMs?: number;
  /** Child heap cap (`--max-old-space-size`), in MB. Default 2048. */
  maxMemoryMb?: number;
  /**
   * CLI entry to spawn. Defaults to the in-repo TypeScript CLI (run via `tsx`), correct for
   * dev/test. Production callers pass the built `dist/cli/main.js` (run via `node`). The runner is
   * inferred from the extension: `.ts` → `npx tsx`, otherwise the current `node`.
   */
  cliEntry?: string;
}

export type RunProgramOptions = SandboxOptions;
export interface ExportFormats {
  step?: boolean;
  glb?: boolean;
  stl?: boolean;
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

/** Raw outcome of running the verify CLI on a sandboxed program. */
interface CliOutcome {
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputTooLarge: boolean;
  exitCode: number | null;
}

/**
 * Write `code` to a temp ESM directory, run the verify CLI with `makeArgs(partPath)` in a
 * resource-bounded child process, and return the raw outcome. The temp *program* directory is
 * always cleaned up; any artifacts the CLI writes elsewhere (e.g. an `--out` dir) are the caller's.
 */
async function runVerifyCli(
  code: string,
  makeArgs: (partPath: string) => string[],
  opts: SandboxOptions
): Promise<CliOutcome> {
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

    const cliArgs = makeArgs(partPath);
    const cmd = useTsx ? 'npx' : process.execPath;
    const args = useTsx ? ['tsx', cliEntry, ...cliArgs] : [cliEntry, ...cliArgs];

    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
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
      return { stdout, stderr, timedOut: false, outputTooLarge: false, exitCode: 0 };
    } catch (err) {
      const e = err as {
        stdout?: string;
        stderr?: string;
        killed?: boolean;
        code?: number | string | null;
      };
      // The CLI prints its JSON document and exits 1 for a not-ok part — that is not a crash; the
      // caller inspects stdout. We only classify timeout / output-cap here.
      return {
        stdout: e.stdout ?? '',
        stderr: e.stderr ?? (err instanceof Error ? err.message : String(err)),
        timedOut: Boolean(e.killed) && e.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        outputTooLarge: e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER',
        exitCode: typeof e.code === 'number' ? e.code : null,
      };
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function tryParse<T>(out: string): T | null {
  if (!out.trim()) return null;
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

/** Execute `code` (an agent-authored `.brep.ts` module) in an isolated, resource-bounded child. */
export async function runProgram(
  code: string,
  opts: RunProgramOptions = {}
): Promise<RunProgramResult> {
  const o = await runVerifyCli(code, (partPath) => [partPath, '--check'], opts);

  // A not-ok part still prints a JSON report (exit 1) — that's a completed run.
  const report = tryParse<SerializedReport>(o.stdout);
  if (report) return { outcome: 'completed', report };
  if (o.timedOut) return { outcome: 'timeout', timeoutMs: positiveOrDefault(opts.timeoutMs, DEFAULT_TIMEOUT_MS) };
  if (o.outputTooLarge) return { outcome: 'crashed', exitCode: null, detail: 'output exceeded size limit' };
  return { outcome: 'crashed', exitCode: o.exitCode, detail: o.stderr.slice(0, 2000) || 'no JSON report on stdout' };
}

/**
 * Execute `code` and export artifacts to `outDir`. Artifacts persist in `outDir` (the caller owns
 * it); only the temp program directory is cleaned up. Returns the written paths and any errors.
 */
export async function exportProgram(
  code: string,
  outDir: string,
  formats: ExportFormats = { step: true, glb: true, stl: true },
  opts: SandboxOptions = {}
): Promise<ExportProgramResult> {
  const formatFlags = [
    formats.step ? '--step' : '',
    formats.glb ? '--glb' : '',
    formats.stl ? '--stl' : '',
  ].filter(Boolean);

  if (formatFlags.length === 0) {
    // Fail clearly instead of spawning the CLI (which would reject it as an opaque crash).
    return {
      outcome: 'crashed',
      exitCode: 1,
      detail: 'no formats selected; pass at least one of step/glb/stl',
    };
  }

  const o = await runVerifyCli(
    code,
    (partPath) => ['export', partPath, ...formatFlags, '--out', outDir],
    opts
  );

  const parsed = tryParse<{ ok: boolean; written: string[]; errors: string[] }>(o.stdout);
  if (parsed) {
    return {
      outcome: 'completed',
      ok: parsed.ok,
      written: parsed.written,
      errors: parsed.errors,
    };
  }
  if (o.timedOut) {
    return { outcome: 'timeout', timeoutMs: positiveOrDefault(opts.timeoutMs, DEFAULT_TIMEOUT_MS) };
  }
  if (o.outputTooLarge) {
    return { outcome: 'crashed', exitCode: null, detail: 'output exceeded size limit' };
  }
  return {
    outcome: 'crashed',
    exitCode: o.exitCode,
    detail: o.stderr.slice(0, 2000) || 'no JSON result on stdout',
  };
}
