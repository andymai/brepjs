import {
  init,
  isOk,
  mesh,
  exportGlb,
  exportSTEP,
  type AnyShape,
  type BrepError,
  type Result,
} from 'brepjs';
import { pathToFileURL } from 'node:url';
import { runChecks } from './checks.js';
import { buildHints, emptyReport, pushError, type ErrorInfo, type VerifyReport } from './report.js';

type PartFn = () => unknown;

// Author parts are `.brep.ts`. Node strips types natively (engines requires >=24),
// but only in an ESM context — so a part loaded under a CommonJS project fails. A
// transpiler fallback (tsx) is NOT viable: it loads `brepjs` in a separate module
// realm, so the part gets an uninitialized kernel. Surface a clear fix instead.
async function loadPart(modulePath: string): Promise<{ default?: PartFn }> {
  try {
    return (await import(pathToFileURL(modulePath).href)) as { default?: PartFn };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A TypeScript part (.ts/.mts/.cts/.tsx) that fails to load is almost always a
    // CommonJS-project module-type issue — point the user at the fix.
    if (/\.[mc]?tsx?$/.test(modulePath) && /import statement|file extension/i.test(msg)) {
      throw new Error(
        `cannot load TypeScript part "${modulePath}": author parts in an ESM project ` +
          `(set "type": "module" in package.json) or rename the file to .mts. (${msg})`,
        { cause: e }
      );
    }
    throw e;
  }
}

function isResult(v: unknown): v is Result<AnyShape> {
  return typeof v === 'object' && v !== null && 'ok' in v && typeof v.ok === 'boolean';
}

function isBrepError(v: unknown): v is BrepError {
  if (typeof v !== 'object' || v === null) return false;
  const rec = v as Record<string, unknown>;
  return typeof rec['code'] === 'string' && typeof rec['message'] === 'string';
}

function toErrorInfo(prefix: string, e: unknown): ErrorInfo {
  if (isBrepError(e)) {
    return { message: `${prefix}: ${e.message}`, code: e.code, suggestion: e.suggestion };
  }
  if (e instanceof Error) {
    return { message: `${prefix}: ${e.message}` };
  }
  return { message: `${prefix}: ${String(e)}` };
}

export interface RunPartOptions {
  step?: boolean;
  glb?: boolean;
}

export interface RunPartResult {
  /**
   * The built shape, or null on failure. This is a LIVE WASM-backed kernel handle: the CLI exits
   * right after use, but long-running programmatic callers own its lifetime and should release it
   * (e.g. `using s = result.shape` or a `DisposalScope`) once done, or WASM memory accumulates.
   */
  shape: AnyShape | null;
  report: VerifyReport;
  step?: ArrayBuffer | undefined;
  glb?: ArrayBuffer | undefined;
}

function finalize(result: RunPartResult): RunPartResult {
  result.report.hints = buildHints(result.report);
  return result;
}

export async function runPart(
  modulePath: string,
  opts: RunPartOptions = {}
): Promise<RunPartResult> {
  const report = emptyReport();
  try {
    await init();
  } catch (e) {
    pushError(report, toErrorInfo('kernel init failed', e));
    return finalize({ shape: null, report });
  }
  let mod: { default?: PartFn };
  try {
    mod = await loadPart(modulePath);
  } catch (e) {
    pushError(report, toErrorInfo('import failed', e));
    return finalize({ shape: null, report });
  }
  if (typeof mod.default !== 'function') {
    pushError(report, { message: 'module has no default-exported part function' });
    return finalize({ shape: null, report });
  }
  let out: unknown;
  try {
    out = await mod.default();
  } catch (e) {
    pushError(report, toErrorInfo('part threw', e));
    return finalize({ shape: null, report });
  }
  let shape: AnyShape | null;
  if (isResult(out)) {
    if (!isOk(out)) {
      pushError(report, toErrorInfo('part returned Err', out.error));
      return finalize({ shape: null, report });
    }
    shape = out.value;
  } else {
    shape = out as AnyShape;
  }
  if (!shape) {
    pushError(report, { message: 'part produced no shape' });
    return finalize({ shape: null, report });
  }
  // Push export errors into the report we actually return (runChecks's), so a failed export
  // surfaces as ok:false rather than being dropped.
  const result = runChecks(shape);
  let glb: ArrayBuffer | undefined;
  let step: ArrayBuffer | undefined;
  if (opts.glb) {
    try {
      glb = exportGlb(mesh(shape));
    } catch (e) {
      pushError(result, toErrorInfo('exportGlb', e));
    }
  }
  if (opts.step) {
    const r = exportSTEP(shape);
    if (isOk(r)) step = await r.value.arrayBuffer();
    else pushError(result, toErrorInfo('exportSTEP', r.error));
  }
  return finalize({ shape, report: result, step, glb });
}
