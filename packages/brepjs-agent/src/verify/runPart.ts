import { init, isOk, mesh, exportGlb, exportSTEP, type AnyShape, type Result } from 'brepjs';
import { runChecks } from './checks.js';
import { emptyReport, type VerifyReport } from './report.js';

type PartFn = () => unknown;

function isResult(v: unknown): v is Result<AnyShape> {
  return typeof v === 'object' && v !== null && 'ok' in v && typeof v.ok === 'boolean';
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

export async function runPart(
  modulePath: string,
  opts: RunPartOptions = {},
): Promise<RunPartResult> {
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
  let shape: AnyShape | null;
  if (isResult(out)) {
    if (isOk(out)) shape = out.value;
    else {
      report.errors.push(`part returned Err: ${out.error.message}`);
      return { shape: null, report };
    }
  } else {
    shape = out as AnyShape;
  }
  if (!shape) {
    report.errors.push('part produced no shape');
    return { shape: null, report };
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
      result.errors.push(`exportGlb: ${(e as Error).message}`);
    }
  }
  if (opts.step) {
    const r = exportSTEP(shape);
    if (isOk(r)) step = await r.value.arrayBuffer();
    else result.errors.push(`exportSTEP: ${r.error.message}`);
  }
  return { shape, report: result, step, glb };
}
