/**
 * Checking a model: brepjs-bim's validators against a session's build, and the difference between
 * two sessions, such as two revisions of one IFC file.
 */

import { diffBuilds } from '../session/diff.js';
import type { SessionManager } from '../session/sessions.js';
import { CHECKS, type CheckName, type Finding } from '../session/validate.js';
import {
  ArgError,
  jsonResult,
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
const MAX_FINDINGS = 200;
const SEVERITIES = ['error', 'warning', 'info'] as const;

export function checkTools(sessions: SessionManager): ToolDef[] {
  return [
    {
      name: 'validate_model',
      title: 'Validate model',
      description:
        "Run brepjs-bim's checks against a session's current build and return findings with severity, code and message, each mapped to the element it names (a key path for families, a GlobalId for IFC). Checks: integrity (referential integrity of the BimModel a families model projects to), schema (EXPRESS/STEP), roundtrip (write, read, write), gherkin (buildingSMART normative rules), geometry (each element's solid: validity, healability, volume). A families model is checked as the IFC export_ifc would write; an opened IFC file is checked as it is.",
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
        return jsonResult({
          ok: counts.error === 0,
          sessionId: session.id,
          buildHash,
          ran: outcome.ran,
          ...(outcome.skipped.length > 0 ? { skipped: outcome.skipped } : {}),
          counts,
          byCheck,
          findings: shown.slice(0, MAX_FINDINGS),
          ...(shown.length > MAX_FINDINGS ? { findingsTotal: shown.length } : {}),
        });
      },
    },
    {
      name: 'compare_models',
      title: 'Compare models',
      description:
        "Diff two sessions' current builds by element identity: ids only in the second are added, ids only in the first are removed, and for each id in both, its prop, pset and quantity changes and whether its geometry, volume or bounds moved. Use it on two revisions of an IFC file (GlobalIds), or two copies of a families program (key paths). Both sessions must be the same kind. Lists come 100 entries at a time; pass offset for the rest.",
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'The earlier session.' },
          to: { type: 'string', description: 'The later session.' },
          offset: { type: 'number', description: 'Page start (default 0).' },
          limit: {
            type: 'number',
            description: `Page size (default ${DIFF_PAGE}, max ${MAX_DIFF_PAGE}).`,
          },
        },
        required: ['from', 'to'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const from = sessions.get(requireString(a, 'from'));
        const to = sessions.get(requireString(a, 'to'));
        if (from.kind !== to.kind) {
          throw new ArgError(
            `${from.id} is a ${from.kind} session and ${to.id} a ${to.kind} one; their elements are named differently, so compare sessions of the same kind`
          );
        }
        const diff = diffBuilds(from.build.summary.elements, to.build.summary.elements);
        const limit = Math.min(optionalCount(a, 'limit') ?? DIFF_PAGE, MAX_DIFF_PAGE);
        const side = (s: typeof from) => ({
          sessionId: s.id,
          path: s.path,
          buildHash: s.build.buildHash,
        });
        return jsonResult({
          from: side(from),
          to: side(to),
          diff: diffPage(diff, optionalCount(a, 'offset') ?? 0, limit),
        });
      },
    },
  ];
}
