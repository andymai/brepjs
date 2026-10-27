/**
 * Checking a model: brepjs-bim's validators against a session's build, and the difference between
 * two sessions, such as two revisions of one IFC file.
 */

import { diffBuilds } from '../session/diff.js';
import type { ElementRecord } from '../session/records.js';
import { SessionError, type Session, type SessionManager } from '../session/sessions.js';
import { CHECKS, type CheckName, type Finding } from '../session/validate.js';
import {
  ArgError,
  jsonResult,
  optionalBoolean,
  optionalCount,
  optionalPositive,
  optionalString,
  requireString,
  stringArray,
  type ToolDef,
} from './registry.js';
import {
  DIFF_PAGE,
  diffPage,
  EXPECT_BUILD,
  MAX_DIFF_PAGE,
  MAX_TIMEOUT_MS,
  SESSION_ID,
} from './sessionTools.js';

const VALIDATE_TIMEOUT_MS = 300_000;
const QUANTITY_TIMEOUT_MS = 120_000;
const FINDINGS_PAGE = 200;
const MAX_FINDINGS_PAGE = 1000;
const SEVERITIES = ['error', 'warning', 'info'] as const;

export function checkTools(sessions: SessionManager): ToolDef[] {
  return [
    {
      name: 'validate_model',
      title: 'Validate model',
      description: `Run brepjs-bim's checks against a session's current build and return findings with severity, code and message, each mapped to the element it names (a key path for families, a GlobalId for IFC). Checks: integrity (referential integrity of the BimModel a families model projects to), schema (EXPRESS/STEP), roundtrip (write, read, write), gherkin (buildingSMART normative rules), geometry (each element's solid: validity, healability, volume). A families model is checked as the IFC export_ifc would write; an opened IFC file is checked as it is, and the geometry check also reports each element whose body the importer could not fully rebuild. Findings come errors first, ${FINDINGS_PAGE} at a time; pass offset for the rest. A run is kept until the session rebuilds, so later pages and other minSeverity values don't re-run the checks.`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          checks: {
            type: 'array',
            items: { type: 'string', enum: [...CHECKS] },
            description: 'Which checks to run (default all).',
          },
          minSeverity: {
            type: 'string',
            enum: [...SEVERITIES],
            description: 'Leave out findings below this severity (default info: everything).',
          },
          offset: { type: 'number', description: 'Page start (default 0).' },
          limit: {
            type: 'number',
            description: `Page size (default ${FINDINGS_PAGE}, max ${MAX_FINDINGS_PAGE}).`,
          },
          timeoutMs: {
            type: 'number',
            description: `Budget in ms (default ${VALIDATE_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
          },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const requested = stringArray(a, 'checks', CHECKS.length) ?? [...CHECKS];
        for (const c of requested) {
          if (!(CHECKS as readonly string[]).includes(c)) {
            throw new ArgError(`unknown check '${c}' (expected ${CHECKS.join(', ')})`);
          }
        }
        const min = optionalString(a, 'minSeverity') ?? 'info';
        const rank = SEVERITIES.indexOf(min as (typeof SEVERITIES)[number]);
        if (rank < 0) throw new ArgError(`"minSeverity" must be one of ${SEVERITIES.join(', ')}`);
        const { session, buildHash, outcome } = await sessions.validate(
          requireString(a, 'sessionId'),
          requested as CheckName[],
          {
            timeoutMs: optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? VALIDATE_TIMEOUT_MS,
            expectBuild: optionalString(a, 'expectBuild'),
          }
        );
        if (!outcome.ok)
          return jsonResult(
            { ok: false, sessionId: session.id, buildHash, error: outcome.error },
            true
          );
        const counts = { error: 0, warning: 0, info: 0 };
        const byCheck: Record<string, number> = {};
        for (const f of outcome.findings) {
          counts[f.severity]++;
          byCheck[f.check] = (byCheck[f.check] ?? 0) + 1;
        }
        const shown: Finding[] = outcome.findings
          .filter((f) => SEVERITIES.indexOf(f.severity) <= rank)
          .sort((x, y) => SEVERITIES.indexOf(x.severity) - SEVERITIES.indexOf(y.severity));
        const offset = optionalCount(a, 'offset') ?? 0;
        const limit = Math.min(optionalCount(a, 'limit') ?? FINDINGS_PAGE, MAX_FINDINGS_PAGE);
        const end = offset + limit;
        return jsonResult({
          ok: counts.error === 0,
          sessionId: session.id,
          buildHash,
          ran: outcome.ran,
          ...(outcome.skipped.length > 0 ? { skipped: outcome.skipped } : {}),
          counts,
          byCheck,
          findingsTotal: shown.length,
          findings: shown.slice(offset, end),
          ...(end < shown.length ? { nextOffset: end } : {}),
        });
      },
    },
    {
      name: 'compare_models',
      title: 'Compare models',
      description: `Diff two sessions' current builds by element identity: ids only in the second are added, ids only in the first are removed, and for each id in both, its prop, pset and quantity changes and whether its geometry, volume or bounds moved. Use it on two revisions of an IFC file (GlobalIds), or two copies of a families program (key paths). Both sessions must be the same kind. Families quantities are derived the way export_ifc writes them, once per build. Lists come ${DIFF_PAGE} entries at a time; pass offset for the rest, with fromBuild and toBuild set to the buildHashes the first page returned so a rebuild between pages is caught rather than shifting them.`,
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'The earlier session.' },
          to: { type: 'string', description: 'The later session.' },
          fromBuild: { type: 'string', description: 'The buildHash "from" must still be at.' },
          toBuild: { type: 'string', description: 'The buildHash "to" must still be at.' },
          quantities: {
            type: 'boolean',
            description:
              'Compare families quantity sets too (default true; IFC sessions always do).',
          },
          timeoutMs: {
            type: 'number',
            description: `Budget for deriving each families session's quantities, in ms (default ${QUANTITY_TIMEOUT_MS}).`,
          },
          offset: { type: 'number', description: 'Page start (default 0).' },
          limit: {
            type: 'number',
            description: `Page size (default ${DIFF_PAGE}, max ${MAX_DIFF_PAGE}).`,
          },
        },
        required: ['from', 'to'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const fromBuild = optionalString(a, 'fromBuild');
        const toBuild = optionalString(a, 'toBuild');
        const from = sessions.get(requireString(a, 'from'), fromBuild);
        const to = sessions.get(requireString(a, 'to'), toBuild);
        if (from.kind !== to.kind) {
          throw new ArgError(
            `${from.id} is a ${from.kind} session and ${to.id} a ${to.kind} one; their elements are named differently, so compare sessions of the same kind`
          );
        }
        const limit = Math.min(optionalCount(a, 'limit') ?? DIFF_PAGE, MAX_DIFF_PAGE);
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? QUANTITY_TIMEOUT_MS;
        let quantitiesSkipped: string | undefined;
        let sides: readonly [Side, Side];
        if (from.kind === 'families' && (optionalBoolean(a, 'quantities') ?? true)) {
          try {
            sides = await Promise.all([
              withQuantities(sessions, from, timeoutMs),
              withQuantities(sessions, to, timeoutMs),
            ]);
          } catch (e) {
            if (!(e instanceof SessionError) || e.code !== 'QUANTITIES_FAILED') throw e;
            quantitiesSkipped = e.message;
            sides = [asBuilt(from), asBuilt(to)];
          }
        } else {
          sides = [asBuilt(from), asBuilt(to)];
        }
        const [before, after] = sides;
        const side = (x: Side) => ({
          sessionId: x.session.id,
          path: x.session.path,
          buildHash: x.buildHash,
        });
        return jsonResult({
          from: side(before),
          to: side(after),
          ...(quantitiesSkipped !== undefined ? { quantitiesSkipped } : {}),
          diff: diffPage(
            diffBuilds(before.records, after.records),
            optionalCount(a, 'offset') ?? 0,
            limit
          ),
        });
      },
    },
  ];
}

interface Side {
  readonly session: Session;
  readonly buildHash: string;
  readonly records: readonly ElementRecord[];
}

function asBuilt(s: Session): Side {
  return { session: s, buildHash: s.build.buildHash, records: s.build.summary.elements };
}

/** A families session's records with the quantity sets an IFC export of the build carries. */
async function withQuantities(
  sessions: SessionManager,
  s: Session,
  timeoutMs: number
): Promise<Side> {
  const { buildHash, byId } = await sessions.quantities(s.id, {
    timeoutMs,
    expectBuild: s.build.buildHash,
  });
  // A rebuild queued behind the takeoff may have landed by now; the records must match it.
  const session = sessions.get(s.id, buildHash);
  const records = session.build.summary.elements.map((r) => {
    const quantities = byId[r.id];
    return quantities ? { ...r, quantities } : r;
  });
  return { session, buildHash, records };
}
