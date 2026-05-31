import { init, isOk, type AnyShape, type Result } from 'brepjs';
import { runChecks } from './checks.js';
import { emptyReport, type VerifyReport } from './report.js';

type PartFn = () => unknown;

function isResult(v: unknown): v is Result<AnyShape> {
  return (
    typeof v === 'object' &&
    v !== null &&
    'ok' in v &&
    typeof (v as { ok: unknown }).ok === 'boolean'
  );
}

export interface RunPartResult {
  shape: AnyShape | null;
  report: VerifyReport;
}

export async function runPart(modulePath: string): Promise<RunPartResult> {
  await init();
  const report = emptyReport();
  let mod: { default?: PartFn };
  try {
    mod = (await import(modulePath)) as { default?: PartFn };
  } catch (e) {
    report.errors.push(`import failed: ${(e as Error).message}`);
    return { shape: null, report };
  }
  if (typeof mod.default !== 'function') {
    report.errors.push('module has no default-exported part function');
    return { shape: null, report };
  }
  let out: unknown;
  try {
    out = await mod.default();
  } catch (e) {
    report.errors.push(`part threw: ${(e as Error).message}`);
    return { shape: null, report };
  }
  let shape: AnyShape | null = null;
  if (isResult(out)) {
    if (isOk(out)) shape = out.value;
    else {
      report.errors.push(`part returned Err: ${String(out.error)}`);
      return { shape: null, report };
    }
  } else {
    shape = out as AnyShape;
  }
  if (!shape) {
    report.errors.push('part produced no shape');
    return { shape: null, report };
  }
  return { shape, report: runChecks(shape) };
}
