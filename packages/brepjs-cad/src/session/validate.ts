import type { BimIssueLike, BimNs } from './bim.js';
import { BODY_FAILURE_CODES, type ImportedModelLike } from './buildIfc.js';
import { errorMessage, type BuildDiagnostic } from './records.js';

/** brepjs-bim's checks, by the name validate_model takes. */
export const CHECKS = ['integrity', 'schema', 'roundtrip', 'gherkin', 'geometry'] as const;
export type CheckName = (typeof CHECKS)[number];

export type Finding = BuildDiagnostic & { readonly check: CheckName };

export type ValidateOutcome =
  | {
      readonly ok: true;
      readonly findings: readonly Finding[];
      readonly ran: readonly CheckName[];
      readonly skipped: readonly { readonly check: CheckName; readonly reason: string }[];
    }
  | { readonly ok: false; readonly error: string };

/** Map an issue's entity (a BimModel local id, an IFC express id, or a label) to a record id. */
type Resolve = (entity: string | number) => string | undefined;

function finding(check: CheckName, issue: BimIssueLike, resolve: Resolve): Finding {
  // A multi-solid label reads `id [n]`; the element is the id.
  const raw =
    typeof issue.entity === 'string' ? issue.entity.replace(/ \[\d+\]$/, '') : issue.entity;
  const id =
    raw === undefined ? undefined : (resolve(raw) ?? (typeof raw === 'number' ? `#${raw}` : raw));
  return {
    check,
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    ...(id !== undefined ? { id } : {}),
  };
}

/** The byte-level checks, which read an IFC file rather than a model. */
async function checkBytes(
  bim: BimNs,
  bytes: Uint8Array,
  checks: ReadonlySet<CheckName>,
  resolve: Resolve,
  out: Finding[],
  ran: CheckName[]
): Promise<void> {
  if (checks.has('schema')) {
    for (const i of (await bim.checkSchema(bytes)).issues) out.push(finding('schema', i, resolve));
    ran.push('schema');
  }
  if (checks.has('roundtrip')) {
    for (const i of (await bim.checkRoundTrip(bytes)).issues)
      out.push(finding('roundtrip', i, resolve));
    ran.push('roundtrip');
  }
  if (checks.has('gherkin')) {
    for (const i of await bim.checkGherkinRules(bytes)) out.push(finding('gherkin', i, resolve));
    ran.push('gherkin');
  }
}

/**
 * Validate a families build: project it to a BimModel, check that (referential integrity), write it
 * to IFC in memory and check the bytes (schema, round trip, gherkin rules), and check each element's
 * solid. Findings name key paths; an IFC express id resolves through the export's GlobalIds.
 */
export async function validateFamilies(
  bim: BimNs,
  resolved: unknown,
  evaluator: unknown,
  shapes: ReadonlyMap<string, unknown>,
  checks: ReadonlySet<CheckName>
): Promise<ValidateOutcome> {
  const projected = bim.familiesToBim(resolved, {
    project: { name: 'brep-mcp-validation' },
    proxyEvaluator: evaluator,
  });
  if (!projected.ok)
    return {
      ok: false,
      error: `the model does not project to IFC: ${errorMessage(projected.error)}`,
    };
  const { model, idByKeyPath } = projected.value;
  const findings: Finding[] = [];
  const ran: CheckName[] = [];
  try {
    const keyOfLocal = new Map([...idByKeyPath].map(([keyPath, id]) => [id, keyPath]));
    if (checks.has('integrity')) {
      const report = bim.checkReferentialIntegrity(model);
      const resolve: Resolve = (e) => (typeof e === 'number' ? keyOfLocal.get(e) : undefined);
      for (const i of report.issues) findings.push(finding('integrity', i, resolve));
      ran.push('integrity');
    }
    if (checks.has('schema') || checks.has('roundtrip') || checks.has('gherkin')) {
      const written = await bim.toIfc(model, {
        applicationName: 'brepjs-cad',
        applicationVersion: '0',
      });
      if (!written.ok)
        return { ok: false, error: `the IFC writer failed: ${errorMessage(written.error)}` };
      const keyOfGuid = new Map<string, string>();
      for (const [keyPath, id] of idByKeyPath) {
        const guid = model.getElement(id)?.guid;
        if (guid !== undefined) keyOfGuid.set(guid, keyPath);
      }
      const keyOfExpress = new Map<number, string>();
      const read = await bim.fromIfc(written.value, { skipGeometry: true });
      if (read.ok) {
        for (const el of read.value.elements) {
          const keyPath = keyOfGuid.get(el.guid);
          if (keyPath !== undefined) keyOfExpress.set(el.expressId, keyPath);
        }
        bim.disposeImportedModel(read.value);
      }
      const resolve: Resolve = (e) => (typeof e === 'number' ? keyOfExpress.get(e) : undefined);
      await checkBytes(bim, written.value, checks, resolve, findings, ran);
    }
  } finally {
    model[Symbol.dispose]();
  }
  if (checks.has('geometry')) {
    for (const [keyPath, shape] of shapes) {
      for (const i of bim.checkGeometryValidity(shape, keyPath).issues) {
        findings.push(finding('geometry', i, (e) => (e === keyPath ? keyPath : undefined)));
      }
    }
    ran.push('geometry');
  }
  return { ok: true, findings, ran, skipped: [] };
}

/**
 * Validate an imported IFC file: the byte-level checks on the file itself, and each element's
 * reconstructed solids. An element whose body the importer could not fully rebuild is reported
 * with the importer's finding, since the solid check sees only what was rebuilt. Referential
 * integrity needs a BimModel, which an import does not produce.
 */
export async function validateIfc(
  bim: BimNs,
  bytes: Uint8Array,
  model: ImportedModelLike,
  idOf: ReadonlyMap<number, string>,
  checks: ReadonlySet<CheckName>
): Promise<ValidateOutcome> {
  const findings: Finding[] = [];
  const ran: CheckName[] = [];
  const skipped = checks.has('integrity')
    ? [
        {
          check: 'integrity' as const,
          reason:
            'an imported IFC file has no BimModel to check; the schema and round-trip checks cover its references',
        },
      ]
    : [];
  const resolve: Resolve = (e) => (typeof e === 'number' ? idOf.get(e) : undefined);
  await checkBytes(bim, bytes, checks, resolve, findings, ran);
  if (checks.has('geometry')) {
    for (const issue of model.diagnostics.issues) {
      if (BODY_FAILURE_CODES.has(issue.code)) findings.push(finding('geometry', issue, resolve));
    }
    for (const el of model.elements) {
      const solids = el.geometry.solids ?? [];
      if (solids.length === 0) continue;
      const id = idOf.get(el.expressId) ?? el.guid;
      for (const i of bim.checkGeometryValidity(solids, id).issues) {
        findings.push(finding('geometry', i, (e) => (e === id ? id : undefined)));
      }
    }
    ran.push('geometry');
  }
  return { ok: true, findings, ran, skipped };
}
