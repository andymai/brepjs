import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { diffBuilds, newGeometryFailures, type BuildDiff } from './diff.js';
import {
  canonicalJson,
  errorMessage,
  type BuildDiagnostic,
  type BuildSummary,
  type ElementRecord,
  type SessionKind,
} from './records.js';
import type { EvalOutcome } from './evalCode.js';
import type { QuantitiesById } from './quantities.js';
import type { CheckName, ValidateOutcome } from './validate.js';
import type { ExportIfcArgs, ExportIfcOutcome } from './exportIfc.js';
import type { WorkerOps } from './protocol.js';
import type { RenderRequest, ShotCamera } from './render.js';
import { sourceSetOf, type SourceSet } from './sources.js';
import { SessionWorker, WorkerError } from './workerClient.js';

export const DEFAULT_BUILD_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_SESSIONS = 4;

const PROGRAM_EXT = new Set(['.ts', '.tsx', '.mts', '.js', '.mjs']);

export class SessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly detail: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

export interface Build {
  readonly summary: BuildSummary;
  readonly index: ReadonlyMap<string, ElementRecord>;
  readonly sources: SourceSet;
  /** Hash of the element records: equal hashes mean an identical build. */
  readonly buildHash: string;
  readonly builtAt: Date;
}

export interface Session {
  readonly id: string;
  readonly kind: SessionKind;
  readonly path: string;
  readonly typecheck: boolean;
  readonly timeoutMs: number;
  readonly openedAt: Date;
  worker: SessionWorker | undefined;
  /** The candidate worker of a rebuild in progress, killed if the session closes under it. */
  building: SessionWorker | undefined;
  build: Build;
  /** How the current build differs from the one before it, kept so large diffs can be paged. */
  lastDiff: { readonly previousBuildHash: string; readonly diff: BuildDiff } | undefined;
  /**
   * GlobalIds as the last export_ifc wrote them, by key path and back. A key path's GlobalId
   * derives from it and the project id alone, so the mapping holds across rebuilds until the
   * next export.
   */
  exported: ExportedIds | undefined;
  /** Quantity sets derived for a build, kept until the next one. */
  quantityCache: { readonly buildHash: string; readonly byId: QuantitiesById } | undefined;
  /** The last validation of a build, kept so its findings can be paged without re-running it. */
  validationCache:
    | { readonly buildHash: string; readonly checks: string; readonly outcome: ValidateOutcome }
    | undefined;
  lastFailure: { readonly at: Date; readonly diagnostics: readonly BuildDiagnostic[] } | undefined;
  queue: Promise<unknown>;
}

export type OpenResult =
  | { readonly ok: true; readonly session: Session; readonly durationMs: number }
  | {
      readonly ok: false;
      readonly path: string;
      readonly diagnostics: readonly BuildDiagnostic[];
      readonly durationMs: number;
    };

export type RebuildResult =
  | {
      readonly ok: true;
      readonly session: Session;
      readonly previousBuildHash: string;
      readonly diff: BuildDiff;
      readonly durationMs: number;
    }
  | {
      readonly ok: false;
      readonly session: Session;
      readonly diagnostics: readonly BuildDiagnostic[];
      readonly durationMs: number;
    };

export interface ExportedIds {
  readonly projectId: string;
  readonly byKeyPath: ReadonlyMap<string, string>;
  readonly keyPathOf: ReadonlyMap<string, string>;
}

export interface SessionStatus {
  readonly session: Session;
  readonly stale: boolean;
}

export interface SessionManagerOptions {
  readonly maxSessions?: number;
  readonly maxMemoryMb?: number;
  readonly cwd?: string;
  readonly onChange?: () => void;
}

type Attempt =
  | { readonly ok: true; readonly worker: SessionWorker; readonly build: Build }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

function kindOf(path: string): SessionKind | undefined {
  const ext = extname(path).toLowerCase();
  if (ext === '.ifc') return 'ifc';
  return PROGRAM_EXT.has(ext) ? 'families' : undefined;
}

function workerDiagnostic(e: unknown): BuildDiagnostic {
  if (e instanceof WorkerError) {
    return {
      severity: 'error',
      code: e.reason === 'timeout' ? 'BUILD_TIMEOUT' : 'WORKER_EXITED',
      message: e.message,
    };
  }
  return { severity: 'error', code: 'BUILD_FAILED', message: errorMessage(e) };
}

/**
 * Open models, one sandboxed worker each. The server keeps every build's element records, so
 * queries never wait on a worker. A rebuild runs in a fresh worker and replaces the session's
 * worker only when it succeeds: a broken edit, a crash, or a timeout leaves the last good build in
 * place.
 */
export class SessionManager {
  readonly #sessions = new Map<string, Session>();
  readonly #maxSessions: number;
  readonly #maxMemoryMb: number | undefined;
  readonly #cwd: string;
  readonly #onChange: (() => void) | undefined;
  #nextId = 1;
  /** Opens still building, counted against the limit so concurrent opens can't overshoot it. */
  #opening = 0;
  readonly #inflight = new Set<SessionWorker>();
  /** Bumped by closeAll, so an open that started before it doesn't spawn a worker after it. */
  #epoch = 0;

  constructor(opts: SessionManagerOptions = {}) {
    this.#maxSessions = opts.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.#maxMemoryMb = opts.maxMemoryMb;
    this.#cwd = opts.cwd ?? process.cwd();
    this.#onChange = opts.onChange;
  }

  /** Where relative paths from tool arguments resolve. */
  get cwd(): string {
    return this.#cwd;
  }

  get maxSessions(): number {
    return this.#maxSessions;
  }

  all(): readonly Session[] {
    return [...this.#sessions.values()];
  }

  async open(
    path: string,
    opts: { readonly typecheck?: boolean; readonly timeoutMs?: number } = {}
  ): Promise<OpenResult> {
    const started = Date.now();
    const abs = resolve(this.#cwd, path);
    const kind = kindOf(abs);
    if (kind === undefined) {
      throw new SessionError(
        'UNSUPPORTED_SOURCE',
        `cannot open '${path}': expected a families program (.tsx, .ts, .js) or an .ifc file`
      );
    }
    try {
      if (!(await stat(abs)).isFile()) throw new Error('not a file');
    } catch {
      throw new SessionError('NOT_FOUND', `no file at '${abs}'`);
    }
    if (this.#sessions.size + this.#opening >= this.#maxSessions) {
      throw new SessionError(
        'TOO_MANY_SESSIONS',
        `${this.#sessions.size} sessions are open (the limit is ${this.#maxSessions}); close one with close_model`,
        { open: [...this.#sessions.keys()] }
      );
    }
    const typecheck = opts.typecheck ?? true;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
    this.#opening++;
    const epoch = this.#epoch;
    let attempt: Attempt;
    try {
      attempt = await this.#attempt(kind, abs, typecheck, timeoutMs, {
        wanted: () => epoch === this.#epoch,
      });
    } finally {
      this.#opening--;
    }
    if (!attempt.ok) {
      return {
        ok: false,
        path: abs,
        diagnostics: attempt.diagnostics,
        durationMs: Date.now() - started,
      };
    }
    const session: Session = {
      id: `s${this.#nextId++}`,
      kind,
      path: abs,
      typecheck,
      timeoutMs,
      openedAt: new Date(),
      worker: attempt.worker,
      build: attempt.build,
      building: undefined,
      lastDiff: undefined,
      exported: undefined,
      quantityCache: undefined,
      validationCache: undefined,
      lastFailure: undefined,
      queue: Promise.resolve(),
    };
    this.#sessions.set(session.id, session);
    this.#onChange?.();
    return { ok: true, session, durationMs: Date.now() - started };
  }

  /** The session, after checking that the caller's `expectBuild` (if any) is still current. */
  get(id: string, expectBuild?: string): Session {
    const s = this.#sessions.get(id);
    if (s === undefined) {
      throw new SessionError('NO_SUCH_SESSION', `no open session '${id}'`, {
        open: [...this.#sessions.keys()],
      });
    }
    this.#checkBuild(s, expectBuild);
    return s;
  }

  #checkBuild(s: Session, expectBuild: string | undefined): void {
    if (expectBuild !== undefined && expectBuild !== s.build.buildHash) {
      throw new SessionError(
        'BUILD_MISMATCH',
        `session ${s.id} is at build ${s.build.buildHash}, not ${expectBuild}; re-query before acting on old ids`,
        { buildHash: s.build.buildHash }
      );
    }
  }

  rebuild(id: string, opts: { readonly timeoutMs?: number } = {}): Promise<RebuildResult> {
    const session = this.get(id);
    // One build at a time per session; a second rebuild waits for the first and builds after it.
    const closed = (when: string) =>
      new SessionError('NO_SUCH_SESSION', `session '${session.id}' was closed ${when}`);
    const run = session.queue.then(async (): Promise<RebuildResult> => {
      if (!this.#sessions.has(session.id)) throw closed('before the rebuild started');
      const started = Date.now();
      let attempt: Attempt;
      try {
        attempt = await this.#attempt(
          session.kind,
          session.path,
          session.typecheck,
          opts.timeoutMs ?? session.timeoutMs,
          {
            wanted: () => this.#sessions.has(session.id),
            onSpawn: (w) => (session.building = w),
          }
        );
      } finally {
        session.building = undefined;
      }
      if (!this.#sessions.has(session.id)) {
        if (attempt.ok) attempt.worker.kill();
        throw closed('during the rebuild');
      }
      const previous = session.build;
      if (attempt.ok) {
        // Geometry that fails now but built before is a broken edit, not a new good build. Failures
        // the last good build already had don't block, or a model with one could never rebuild.
        const broken = newGeometryFailures(
          previous.summary.elements,
          attempt.build.summary.elements
        );
        if (broken.length > 0) {
          attempt.worker.kill();
          attempt = {
            ok: false,
            diagnostics: broken.map((r) => ({
              severity: 'error',
              code: 'ELEMENT_GEOMETRY_FAILED',
              message: r.geometryError ?? 'geometry failed',
              id: r.id,
            })),
          };
        }
      }
      if (!attempt.ok) {
        session.lastFailure = { at: new Date(), diagnostics: attempt.diagnostics };
        return {
          ok: false,
          session,
          diagnostics: attempt.diagnostics,
          durationMs: Date.now() - started,
        };
      }
      const diff = diffBuilds(previous.summary.elements, attempt.build.summary.elements);
      session.worker?.kill();
      session.worker = attempt.worker;
      session.build = attempt.build;
      // The records can match while the file differs (an IFC header, say), and the byte-level
      // checks read the file, so a rebuild drops the last validation whatever its hash.
      session.validationCache = undefined;
      session.lastDiff = { previousBuildHash: previous.buildHash, diff };
      session.lastFailure = undefined;
      return {
        ok: true,
        session,
        previousBuildHash: previous.buildHash,
        diff,
        durationMs: Date.now() - started,
      };
    });
    session.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Render the session's current build. The render waits behind any rebuild, and `prepare` runs
   * once it is the session's turn, so the request (and whatever the caller reports with it) is
   * computed from the build that gets drawn; `expectBuild` is checked at that point too. A render
   * that times out stops the worker: the records stay queryable, and a rebuild starts a new one.
   */
  render<T>(
    id: string,
    opts: { readonly timeoutMs: number; readonly expectBuild?: string | undefined },
    prepare: (session: Session) => {
      readonly request?: RenderRequest | undefined;
      readonly meta: T;
    }
  ): Promise<{
    readonly session: Session;
    readonly pngs?: readonly Uint8Array[];
    /** The camera each image was framed with, in model millimetres. */
    readonly cameras?: readonly (ShotCamera | null)[];
    /** Ids the render payload carries a mesh for. */
    readonly drawable?: ReadonlySet<string>;
    readonly meta: T;
  }> {
    return this.#onCurrentBuild(id, opts.expectBuild, 'render', async (session) => {
      const { request, meta } = prepare(session);
      if (request === undefined) return { session, meta };
      const { pngs, cameras, drawable } = await this.#request(
        session,
        'render',
        request,
        opts.timeoutMs
      );
      return { session, pngs, cameras, drawable: new Set(drawable), meta };
    });
  }

  /** Write a families session's current build as IFC bytes; IFC sessions cannot be re-exported. */
  exportIfc(
    id: string,
    args: ExportIfcArgs,
    opts: { readonly timeoutMs: number; readonly expectBuild?: string | undefined }
  ): Promise<{
    readonly session: Session;
    readonly outcome: ExportIfcOutcome;
    /** The build exported, captured on its turn in the queue. */
    readonly buildHash: string;
  }> {
    const session = this.get(id);
    if (session.kind === 'ifc') {
      throw new SessionError(
        'UNSUPPORTED',
        `session ${id} is an imported IFC file; brepjs-bim has no path from an imported model back to one it can write, so open the families program instead`
      );
    }
    return this.#onCurrentBuild(id, opts.expectBuild, 'export', async (s) => {
      const buildHash = s.build.buildHash;
      const outcome = await this.#request(s, 'exportIfc', args, opts.timeoutMs);
      return { session: s, outcome, buildHash };
    });
  }

  /**
   * Quantity sets per element id for the current build. An IFC session has them in its records;
   * a families session derives them once per build through an in-memory IFC export.
   */
  quantities(
    id: string,
    opts: { readonly timeoutMs: number; readonly expectBuild?: string | undefined }
  ): Promise<{
    readonly session: Session;
    readonly buildHash: string;
    readonly byId: QuantitiesById;
  }> {
    return this.#onCurrentBuild(id, opts.expectBuild, 'quantity takeoff', async (s) => {
      const buildHash = s.build.buildHash;
      if (s.kind === 'ifc') {
        const byId = Object.fromEntries(
          s.build.summary.elements.flatMap((r) => (r.quantities ? [[r.id, r.quantities]] : []))
        );
        return { session: s, buildHash, byId };
      }
      if (s.quantityCache?.buildHash === buildHash) {
        return { session: s, buildHash, byId: s.quantityCache.byId };
      }
      const outcome = await this.#request(s, 'quantities', {}, opts.timeoutMs);
      if (!outcome.ok) throw new SessionError('QUANTITIES_FAILED', outcome.error);
      s.quantityCache = { buildHash, byId: outcome.quantities };
      return { session: s, buildHash, byId: outcome.quantities };
    });
  }

  /** Run brepjs-bim's checks against the session's current build, or reuse the last run's. */
  validate(
    id: string,
    checks: readonly CheckName[],
    opts: { readonly timeoutMs: number; readonly expectBuild?: string | undefined }
  ): Promise<{
    readonly session: Session;
    readonly buildHash: string;
    readonly outcome: ValidateOutcome;
  }> {
    return this.#onCurrentBuild(id, opts.expectBuild, 'validation', async (s) => {
      const buildHash = s.build.buildHash;
      const key = [...checks].sort().join(',');
      const cached = s.validationCache;
      if (cached?.buildHash === buildHash && cached.checks === key) {
        return { session: s, buildHash, outcome: cached.outcome };
      }
      const outcome = await this.#request(s, 'validate', { checks }, opts.timeoutMs);
      if (outcome.ok) s.validationCache = { buildHash, checks: key, outcome };
      return { session: s, buildHash, outcome };
    });
  }

  /** Run agent code against the session's current build, in its worker. */
  evalCode(
    id: string,
    code: string,
    opts: { readonly timeoutMs: number; readonly expectBuild?: string | undefined }
  ): Promise<{
    readonly session: Session;
    readonly outcome: EvalOutcome;
    readonly buildHash: string;
  }> {
    return this.#onCurrentBuild(id, opts.expectBuild, 'eval', async (s) => {
      const buildHash = s.build.buildHash;
      return {
        session: s,
        outcome: await this.#request(s, 'eval', { code }, opts.timeoutMs),
        buildHash,
      };
    });
  }

  /** Remember the GlobalIds an export wrote. Call it once the file is on disk. */
  recordExport(id: string, projectId: string, globalIds: Readonly<Record<string, string>>): void {
    const session = this.#sessions.get(id);
    if (session === undefined) return;
    const pairs = Object.entries(globalIds);
    session.exported = {
      projectId,
      byKeyPath: new Map(pairs),
      keyPathOf: new Map(pairs.map(([keyPath, guid]) => [guid, keyPath])),
    };
  }

  /**
   * Run `fn` on the session's turn in its queue, after any rebuild ahead of it, so it sees the
   * build it acts on; `expectBuild` is checked at that point.
   */
  #onCurrentBuild<R>(
    id: string,
    expectBuild: string | undefined,
    what: string,
    fn: (session: Session) => Promise<R>
  ): Promise<R> {
    const session = this.get(id);
    const run = session.queue.then(() => {
      if (!this.#sessions.has(session.id)) {
        throw new SessionError(
          'NO_SUCH_SESSION',
          `session '${session.id}' was closed before the ${what}`
        );
      }
      this.#checkBuild(session, expectBuild);
      return fn(session);
    });
    session.queue = run.catch(() => undefined);
    return run;
  }

  /** A request to the session's live worker. A timeout stops the worker; rebuild starts a new one. */
  async #request<K extends 'render' | 'exportIfc' | 'eval' | 'quantities' | 'validate'>(
    session: Session,
    op: K,
    args: WorkerOps[K]['args'],
    timeoutMs: number
  ): Promise<WorkerOps[K]['result']> {
    const worker = session.worker;
    if (!worker?.alive) {
      throw new SessionError(
        'WORKER_STOPPED',
        `session ${session.id} has no running worker; call rebuild to start one`
      );
    }
    try {
      return await worker.request(op, args, timeoutMs);
    } catch (e) {
      const stopped =
        e instanceof WorkerError ? '; the worker stopped, so rebuild before trying again' : '';
      const code = {
        render: 'RENDER_FAILED',
        exportIfc: 'EXPORT_FAILED',
        eval: 'EVAL_FAILED',
        quantities: 'QUANTITIES_FAILED',
        validate: 'VALIDATE_FAILED',
      }[op];
      throw new SessionError(code, `${errorMessage(e)}${stopped}`);
    }
  }

  close(id: string): void {
    const s = this.get(id);
    s.worker?.kill();
    s.building?.kill();
    this.#sessions.delete(id);
    this.#onChange?.();
  }

  closeAll(): void {
    for (const s of this.#sessions.values()) s.worker?.kill();
    for (const w of this.#inflight) w.kill();
    this.#epoch++;
    this.#sessions.clear();
  }

  /** Every session, marked stale when its source files no longer hash to what was built. */
  async status(): Promise<SessionStatus[]> {
    return Promise.all(
      this.all().map(async (session) => {
        const now = await sourceSetOf(session.path, session.kind);
        return { session, stale: now.hash !== session.build.sources.hash };
      })
    );
  }

  async #attempt(
    kind: SessionKind,
    path: string,
    typecheck: boolean,
    timeoutMs: number,
    hooks: {
      /** Re-checked after the source scan: a close during it must not lead to a spawn. */
      readonly wanted?: () => boolean;
      readonly onSpawn?: (worker: SessionWorker) => void;
    } = {}
  ): Promise<Attempt> {
    const sources = await sourceSetOf(path, kind);
    if (hooks.wanted?.() === false) {
      return {
        ok: false,
        diagnostics: [
          { severity: 'error', code: 'CANCELLED', message: 'closed before the build started' },
        ],
      };
    }
    const worker = new SessionWorker({
      cwd: this.#cwd,
      ...(this.#maxMemoryMb !== undefined ? { maxMemoryMb: this.#maxMemoryMb } : {}),
    });
    this.#inflight.add(worker);
    hooks.onSpawn?.(worker);
    let outcome;
    try {
      outcome = await worker.request('build', { kind, path, typecheck }, timeoutMs);
    } catch (e) {
      worker.kill();
      return { ok: false, diagnostics: [workerDiagnostic(e)] };
    } finally {
      this.#inflight.delete(worker);
    }
    if (!outcome.ok) {
      worker.kill();
      return { ok: false, diagnostics: outcome.diagnostics };
    }
    const summary = outcome.summary;
    return {
      ok: true,
      worker,
      build: {
        summary,
        index: new Map(summary.elements.map((r) => [r.id, r])),
        sources,
        // Source locations stay out of the hash: a comment that moves lines is not a new build.
        buildHash: createHash('sha256')
          .update(canonicalJson(summary.elements.map(({ source: _source, ...r }) => r)))
          .digest('hex')
          .slice(0, 12),
        builtAt: new Date(),
      },
    };
  }
}
