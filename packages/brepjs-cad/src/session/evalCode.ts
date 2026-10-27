import { runInThisContext } from 'node:vm';
import { format } from 'node:util';
import { errorMessage, plainJson } from './records.js';

export type EvalOutcome =
  | { readonly ok: true; readonly value: unknown; readonly logs: readonly string[] }
  | { readonly ok: false; readonly error: string; readonly logs: readonly string[] };

const MAX_LOG_LINES = 200;
const MAX_LOG_CHARS = 2000;
const MAX_RESULT_CHARS = 256 * 1024;

function captureConsole(): {
  console: Record<string, (...args: unknown[]) => void>;
  logs: string[];
} {
  const logs: string[] = [];
  const line =
    (level: string) =>
    (...args: unknown[]) => {
      if (logs.length >= MAX_LOG_LINES) return;
      const text = format(...args);
      logs.push(`${level === 'log' ? '' : `[${level}] `}${text.slice(0, MAX_LOG_CHARS)}`);
    };
  const console = Object.fromEntries(
    ['log', 'info', 'warn', 'error', 'debug'].map((level) => [level, line(level)])
  );
  return { console, logs };
}

/**
 * Run agent TypeScript as the body of `async (ctx, console) => { ... }`. It is transpiled (types
 * stripped, no type check) and evaluated in this realm, so `ctx.brep` and the build's shapes are
 * the same kernel objects the worker holds. The returned value comes back as JSON.
 */
export async function evalInBuild(ctx: object, code: string): Promise<EvalOutcome> {
  const { console, logs } = captureConsole();
  const ts = (await import('typescript')).default;
  const { outputText, diagnostics } = ts.transpileModule(
    `(async (ctx, console) => {\n${code}\n})`,
    {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }
  );
  const syntax = (diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (syntax.length > 0) {
    const error = syntax
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('; ');
    return { ok: false, error: `syntax: ${error}`, logs };
  }
  try {
    const fn = runInThisContext(outputText, { filename: 'eval_in_session.ts' }) as (
      c: object,
      log: object
    ) => Promise<unknown>;
    const value = plainJson(await fn(ctx, console));
    const json = JSON.stringify(value ?? null);
    if (json.length > MAX_RESULT_CHARS) {
      return {
        ok: false,
        error: `the result is ${json.length} characters as JSON; return something under ${MAX_RESULT_CHARS}`,
        logs,
      };
    }
    return { ok: true, value: value ?? null, logs };
  } catch (e) {
    return { ok: false, error: errorMessage(e), logs };
  }
}
