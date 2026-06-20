/**
 * Sandbox executor — run agent-authored brepjs TypeScript in an isolated child process.
 *
 * The program is written to a temp ESM directory and executed by the verify CLI in a separate
 * process, with a wall-clock timeout and a memory cap. Out-of-process execution is what makes the
 * loop *unattended-safe*: a runaway (CPU-bound infinite loop) or memory-hungry part is killed
 * rather than hanging or crashing the host. Results cross the boundary as serialized JSON (never
 * live WASM handles), and the temp program directory is always cleaned up.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VerifyReport } from '../verify/report.js';

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
  /** Pass `--metrics` so the report carries body/interference metrics for the design judge. */
  metrics?: boolean;
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
 * In-flight sandbox process *groups*, keyed by group-leader pid. Tracked so a dying host can reap
 * its runs (see installSandboxShutdownHandlers) — the per-run timeout can't, since its timer dies
 * with the host.
 */
const activeGroups = new Set<number>();

/** SIGKILL (or `signal`) an entire detached process group by its leader pid; ignore if already gone. */
function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    // Negative pid → the whole process GROUP (POSIX). On win32 (no POSIX groups) fall back to the
    // root process — best effort; the dev CLI targets POSIX.
    process.kill(process.platform === 'win32' ? pid : -pid, signal);
  } catch {
    // The group is already gone (the leader exited between the check and the signal).
  }
}

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
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // Append rather than replace, so an existing NODE_OPTIONS (flags, other limits) survives.
      NODE_OPTIONS: [process.env['NODE_OPTIONS'], `--max-old-space-size=${maxMemoryMb}`]
        .filter(Boolean)
        .join(' '),
    };

    return await spawnCliOutcome(cmd, args, env, timeoutMs);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Spawn the verify CLI in its OWN process group and enforce the wall-clock budget by SIGKILLing the
 * WHOLE group on timeout — not just the direct child.
 *
 * Why a process group rather than Node's built-in `execFile` timeout: in dev/test the CLI runs as
 * `npx tsx <main.ts>`, so the process that actually executes the part (and can spin on a CPU-bound
 * OCCT op) is a *grandchild* behind npx+tsx. `child_process`' `timeout`/`killSignal` signals only
 * the direct child, so a fired timeout SIGKILLs `npx` and orphans the still-spinning grandchild
 * forever (it reparents to init and keeps burning a core). Spawning `detached` makes the child a
 * process-group leader that npx's descendants inherit, so `process.kill(-pid, …)` reaps the entire
 * tree. The production path (`node dist/cli/main.js`) has no intermediary, but the group kill is
 * equally correct there.
 */
function spawnCliOutcome(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number
): Promise<CliOutcome> {
  return new Promise<CliOutcome>((resolve) => {
    const child = spawn(cmd, args, { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    // Track the group so a host shutdown can reap it even if this run's timer never fires.
    if (child.pid !== undefined) activeGroups.add(child.pid);

    let stdout = '';
    let stderr = '';
    let stdoutBytes = 0;
    let timedOut = false;
    let outputTooLarge = false;
    let settled = false;

    const killTree = (signal: NodeJS.Signals): void => {
      if (child.pid !== undefined) killGroup(child.pid, signal);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree('SIGKILL');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      // Already over the cap and condemned — don't re-fire the kill on every buffered chunk.
      if (outputTooLarge) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        // Mirror execFile's maxBuffer: a runaway writer is killed and classified as output-too-large.
        outputTooLarge = true;
        killTree('SIGKILL');
        return;
      }
      stdout += chunk.toString();
    });
    // stderr is diagnostic only; cap it by byte count (matching stdout — `.length` would count
    // UTF-16 code units, undercounting multi-byte output) so a chatty failure can't exhaust memory.
    let stderrBytes = 0;
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_OUTPUT_BYTES) stderr += chunk.toString();
    });

    const finish = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.pid !== undefined) activeGroups.delete(child.pid);
      resolve({ stdout, stderr, timedOut, outputTooLarge, exitCode });
    };

    // The command itself could not be spawned (e.g. ENOENT) — surface as a crash (no JSON report).
    child.on('error', (err: Error) => {
      if (!stderr) stderr = err.message;
      finish(null);
    });
    // 'close' fires once stdio is fully drained; a signal-kill reports a null exit code.
    child.on('close', (code: number | null) => finish(code));
  });
}

/** SIGKILL every in-flight sandbox process group now. Exported so a host can reap explicitly. */
export function killActiveSandboxes(signal: NodeJS.Signals = 'SIGKILL'): void {
  for (const pid of activeGroups) killGroup(pid, signal);
  activeGroups.clear();
}

let shutdownHandlersInstalled = false;

/**
 * Install process-shutdown hooks that reap any in-flight sandbox process groups when THIS process
 * (the host — e.g. the MCP server) terminates. Idempotent; call once at startup from an entrypoint.
 *
 * Rationale: the per-run timeout (`spawnCliOutcome`) only protects a run while the host is alive —
 * its timer dies with the host. If the host is stopped (the agent disconnects) before a run's
 * budget elapses, the `detached` sandbox group is in its own session and survives, burning a core
 * indefinitely. These hooks SIGKILL every tracked group on the way down so a dying host doesn't
 * leak its children. (A hard SIGKILL of the host can't be trapped — that residual needs the kernel's
 * PR_SET_PDEATHSIG, which Node doesn't expose.)
 */
export function installSandboxShutdownHandlers(): void {
  if (shutdownHandlersInstalled) return;
  shutdownHandlersInstalled = true;
  // Normal or explicit exit: reap synchronously (process.kill is sync and valid in an 'exit' handler).
  process.on('exit', () => killActiveSandboxes('SIGKILL'));
  // Signal-initiated stop (the agent terminating the server): reap, then keep terminating with the
  // conventional 128+signal exit code so the host still exits promptly.
  process.once('SIGTERM', () => {
    killActiveSandboxes('SIGKILL');
    process.exit(143);
  });
  process.once('SIGINT', () => {
    killActiveSandboxes('SIGKILL');
    process.exit(130);
  });
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
  if (o.timedOut)
    return { outcome: 'timeout', timeoutMs: positiveOrDefault(opts.timeoutMs, DEFAULT_TIMEOUT_MS) };
  if (o.outputTooLarge)
    return { outcome: 'crashed', exitCode: null, detail: 'output exceeded size limit' };
  return {
    outcome: 'crashed',
    exitCode: o.exitCode,
    detail: o.stderr.slice(0, 2000) || 'no JSON report on stdout',
  };
}

/** Outcome of a sandboxed `--check --step` run. `completed` carries the report; `stepPath` is set
 * only when a valid solid produced a STEP. */
export type RunProgramWithStepResult =
  | { outcome: 'completed'; report: SerializedReport; stepPath?: string }
  | { outcome: 'timeout'; timeoutMs: number }
  | { outcome: 'crashed'; exitCode: number | null; detail: string };

/**
 * Execute `code` with `verify --check --step` in ONE bounded child process: a single spawn yields
 * both the `auto`-signal report (parsed from stdout) and the STEP the judge renders — one kernel
 * boot, not the two a `runProgram` + `exportProgram` pair would cost. The caller owns `stepOutPath`;
 * only the temp program dir is cleaned up.
 */
export async function runProgramWithStep(
  code: string,
  stepOutPath: string,
  opts: RunProgramOptions = {}
): Promise<RunProgramWithStepResult> {
  // Clear any stale STEP at the caller's path first, so a post-run existsSync unambiguously means
  // "this run wrote it" (the CLI writes a STEP only for a valid solid; it never deletes a prior one).
  await rm(stepOutPath, { force: true });
  const o = await runVerifyCli(
    code,
    (partPath) => [
      partPath,
      '--check',
      '--step',
      stepOutPath,
      ...(opts.metrics ? ['--metrics'] : []),
    ],
    opts
  );

  // A not-ok part still prints a JSON report (exit 1) — that's a completed run. The STEP exists only
  // when a valid solid built, so surface `stepPath` only when the file is actually present.
  const report = tryParse<SerializedReport>(o.stdout);
  if (report) {
    return existsSync(stepOutPath)
      ? { outcome: 'completed', report, stepPath: stepOutPath }
      : { outcome: 'completed', report };
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
    detail: o.stderr.slice(0, 2000) || 'no JSON report on stdout',
  };
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
