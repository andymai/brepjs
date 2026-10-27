import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseSandboxGroup, trackSandboxGroup } from '../sandbox/runProgram.js';
import { toolDir } from '../verify/brepjsRuntime.js';
import type { WorkerMessage, WorkerOp, WorkerOps } from './protocol.js';

export const DEFAULT_WORKER_MEMORY_MB = 2048;
const STDERR_TAIL_BYTES = 4096;

export class WorkerError extends Error {
  constructor(
    readonly reason: 'timeout' | 'exited',
    message: string
  ) {
    super(message);
    this.name = 'WorkerError';
  }
}

function workerEntry(): { entry: string; execArgv: string[] } {
  const dir = toolDir();
  const runningFromSrc = import.meta.url.startsWith(pathToFileURL(join(dir, 'src') + '/').href);
  const built = join(dir, 'dist', 'session', 'worker.js');
  if (!runningFromSrc && existsSync(built)) return { entry: built, execArgv: [] };
  // Dev and tests run the TypeScript source. tsx's loader goes in by absolute URL because the
  // worker's cwd is the user's project, where tsx need not be installed.
  const tsx = createRequire(join(dir, 'package.json')).resolve('tsx');
  return {
    entry: join(dir, 'src', 'session', 'worker.ts'),
    execArgv: ['--import', pathToFileURL(tsx).href],
  };
}

interface Pending {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

/**
 * One session worker process. It runs in its own process group (so a kill reaches anything it
 * spawned) under a heap cap, and every request carries a wall-clock budget: past it, the whole
 * group is killed and the request fails. A worker never outlives the server: the sandbox shutdown
 * handlers reap its group, and the worker exits when the IPC channel closes.
 */
export class SessionWorker {
  readonly #child: ChildProcess;
  readonly #pending = new Map<number, Pending>();
  readonly #ready: Promise<void>;
  #nextId = 1;
  #exited = false;
  #stderrTail = '';

  constructor(opts: { readonly maxMemoryMb?: number; readonly cwd?: string } = {}) {
    const { entry, execArgv } = workerEntry();
    const heap = opts.maxMemoryMb ?? DEFAULT_WORKER_MEMORY_MB;
    this.#child = fork(entry, [], {
      execArgv: [...execArgv, `--max-old-space-size=${heap}`],
      detached: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      serialization: 'advanced',
      ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
    });
    const pid = this.#child.pid;
    if (pid !== undefined) trackSandboxGroup(pid);
    this.#child.stderr?.on('data', (chunk: Buffer) => {
      this.#stderrTail = (this.#stderrTail + chunk.toString()).slice(-STDERR_TAIL_BYTES);
    });
    // Neither the process nor its channel should keep the server alive on their own; a pending
    // request's timer does that while one is in flight.
    this.#child.unref();
    this.#child.channel?.unref();

    let markReady: () => void = () => {};
    this.#ready = new Promise<void>((resolve) => (markReady = resolve));
    this.#child.on('message', (raw: WorkerMessage) => {
      if (raw.type === 'ready') {
        markReady();
        return;
      }
      const pending = this.#pending.get(raw.id);
      if (pending === undefined) return;
      this.#pending.delete(raw.id);
      clearTimeout(pending.timer);
      if ('error' in raw) pending.reject(new Error(raw.error));
      else pending.resolve(raw.result);
    });
    const onGone = (detail: string): void => {
      if (this.#exited) return;
      this.#exited = true;
      if (pid !== undefined) releaseSandboxGroup(pid);
      const tail = this.#stderrTail.trim();
      for (const p of this.#pending.values()) {
        clearTimeout(p.timer);
        p.reject(new WorkerError('exited', `session worker ${detail}${tail ? `: ${tail}` : ''}`));
      }
      this.#pending.clear();
    };
    this.#child.on('exit', (code, signal) => onGone(`exited (${signal ?? `code ${code}`})`));
    this.#child.on('error', (err) => onGone(`failed: ${err.message}`));
  }

  get alive(): boolean {
    return !this.#exited;
  }

  /** Send one request; rejects with a WorkerError on timeout (after killing the worker) or exit. */
  request<K extends WorkerOp>(
    op: K,
    args: WorkerOps[K]['args'],
    timeoutMs: number
  ): Promise<WorkerOps[K]['result']> {
    if (this.#exited)
      return Promise.reject(new WorkerError('exited', 'session worker is not running'));
    const id = this.#nextId++;
    return new Promise<WorkerOps[K]['result']>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new WorkerError('timeout', `session worker did not answer '${op}' within ${timeoutMs} ms`)
        );
        this.kill();
      }, timeoutMs);
      this.#pending.set(id, {
        resolve: (v) => resolve(v as WorkerOps[K]['result']),
        reject,
        timer,
      });
      void this.#ready.then(() => {
        if (!this.#pending.has(id)) return;
        this.#child.send({ id, op, args }, (err) => {
          if (err === null || !this.#pending.has(id)) return;
          this.#pending.delete(id);
          clearTimeout(timer);
          reject(new WorkerError('exited', `could not reach the session worker: ${err.message}`));
        });
      });
    });
  }

  kill(): void {
    const pid = this.#child.pid;
    if (pid !== undefined && !this.#exited) releaseSandboxGroup(pid);
  }
}
