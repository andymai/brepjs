import type { BimIssueLike, BimNs, IfcProjectSpec } from './bim.js';
import { errorMessage, type BuildDiagnostic } from './records.js';

export interface ExportIfcArgs {
  readonly project: IfcProjectSpec;
  /** Export elements no IFC route matches as IfcBuildingElementProxy instead of failing. */
  readonly proxies: boolean;
  readonly applicationVersion: string;
}

export type ExportIfcOutcome =
  | {
      readonly ok: true;
      readonly bytes: Uint8Array;
      readonly issues: readonly BuildDiagnostic[];
      readonly proxied: readonly string[];
      /** GlobalId per exported key path, as written into the file. */
      readonly globalIds: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

function isIssue(v: unknown): v is BimIssueLike {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { code?: unknown }).code === 'string' &&
    typeof (v as { message?: unknown }).message === 'string'
  );
}

/** Validation issues name a BimModel local id; agents work in key paths. */
function issueDiagnostic(issue: BimIssueLike, keyOf: ReadonlyMap<number, string>): BuildDiagnostic {
  const id =
    typeof issue.entity === 'number'
      ? (keyOf.get(issue.entity) ?? `#${issue.entity}`)
      : issue.entity;
  return {
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    ...(id !== undefined ? { id } : {}),
  };
}

function errorDiagnostics(error: unknown, keyOf: ReadonlyMap<number, string>): BuildDiagnostic[] {
  const e = error as { code?: unknown; cause?: unknown; metadata?: Record<string, unknown> };
  const where = e.metadata?.['keyPath'] ?? e.metadata?.['path'];
  const head: BuildDiagnostic = {
    severity: 'error',
    code: typeof e.code === 'string' ? e.code : 'IFC_EXPORT_FAILED',
    message: errorMessage(error),
    ...(typeof where === 'string' ? { id: where } : {}),
  };
  const nested = Array.isArray(e.cause) ? e.cause.filter(isIssue) : [];
  return [head, ...nested.map((i) => issueDiagnostic(i, keyOf))];
}

/**
 * Project a resolved families tree to IFC and write it through toIfcValidated (referential
 * integrity, schema, and a write-read-write round trip). The session's evaluator supplies the
 * evaluated bodies, so nothing is materialized twice.
 */
export async function exportFamiliesIfc(
  bim: BimNs,
  resolved: unknown,
  evaluator: unknown,
  args: ExportIfcArgs
): Promise<ExportIfcOutcome> {
  const projected = bim.familiesToBim(resolved, {
    project: args.project,
    ...(args.proxies ? { proxyEvaluator: evaluator } : { bodyEvaluator: evaluator }),
  });
  if (!projected.ok)
    return { ok: false, diagnostics: errorDiagnostics(projected.error, new Map()) };
  const { model, idByKeyPath, proxied } = projected.value;
  try {
    const keyOf = new Map([...idByKeyPath].map(([keyPath, id]) => [id, keyPath]));
    const written = await bim.toIfcValidated(model, {
      applicationName: 'brepjs-cad',
      applicationVersion: args.applicationVersion,
    });
    if (!written.ok) return { ok: false, diagnostics: errorDiagnostics(written.error, keyOf) };
    const globalIds: Record<string, string> = {};
    for (const [keyPath, id] of idByKeyPath) {
      const guid = model.getElement(id)?.guid;
      if (guid !== undefined) globalIds[keyPath] = guid;
    }
    return {
      ok: true,
      bytes: written.value.bytes,
      issues: written.value.report.issues.map((i) => issueDiagnostic(i, keyOf)),
      proxied: proxied.map((p) => p.keyPath),
      globalIds,
    };
  } finally {
    model[Symbol.dispose]();
  }
}
