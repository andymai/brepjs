/**
 * Schedules over a session's elements: which fields a selection carries, then a table of them,
 * filtered with the same `where` as query_elements, grouped, sorted and totalled.
 */

import { extname, resolve } from 'node:path';
import { matcher, parseWhere } from '../session/query.js';
import type { QuantitiesById } from '../session/quantities.js';
import type { ElementRecord } from '../session/records.js';
import { runSchedule, schedulableFields, toCsv, usesQuantities } from '../session/schedule.js';
import type { Session, SessionManager } from '../session/sessions.js';
import { writeOutput, type Confirm } from './output.js';
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
import { EXPECT_BUILD, MAX_TIMEOUT_MS, SESSION_ID } from './sessionTools.js';

const QUANTITY_TIMEOUT_MS = 120_000;
const DEFAULT_ROWS = 200;
const MAX_ROWS = 2000;
const MAX_FIELDS = 40;
const QUANTITY_UNITS =
  'IFC quantities are in the units of an IFC file: brepjs-bim exports metres, square metres and cubic metres; an imported file keeps its own. volume is in cubic millimetres.';

const WHERE = {
  type: 'object',
  description:
    'The same filters as query_elements (category, family, storey, name, id, props, psets, bounds).',
};

function parseSortBy(raw: unknown): { field: string; descending?: boolean }[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw))
    throw new ArgError('"sortBy" must be an array of { field, descending? }');
  return raw.map((s, i) => {
    if (typeof s === 'string') return { field: s };
    if (
      typeof s !== 'object' ||
      s === null ||
      typeof (s as { field?: unknown }).field !== 'string'
    ) {
      throw new ArgError(`sortBy[${i}] needs a field`);
    }
    const { field, descending } = s as { field: string; descending?: unknown };
    return descending === true ? { field, descending: true } : { field };
  });
}

/** The selected records, and quantities for them when the fields need any. */
async function selection(
  sessions: SessionManager,
  a: Readonly<Record<string, unknown>>,
  needQuantities: boolean
): Promise<{
  session: Session;
  buildHash: string;
  records: ElementRecord[];
  quantities?: QuantitiesById;
}> {
  const sessionId = requireString(a, 'sessionId');
  const expectBuild = optionalString(a, 'expectBuild');
  const where = parseWhere(a['where']);
  if (!needQuantities) {
    const session = sessions.get(sessionId, expectBuild);
    const records = session.build.summary.elements.filter(matcher(where));
    return { session, buildHash: session.build.buildHash, records };
  }
  const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? QUANTITY_TIMEOUT_MS;
  const { session, buildHash, byId } = await sessions.quantities(sessionId, {
    timeoutMs,
    expectBuild,
  });
  const records = session.build.summary.elements.filter(matcher(where));
  return { session, buildHash, records, quantities: byId };
}

export function scheduleTools(sessions: SessionManager, confirm: Confirm): ToolDef[] {
  return [
    {
      name: 'list_schedulable_fields',
      title: 'List schedulable fields',
      description:
        'List the fields a selection of elements carries, for building a schedule: the built-ins (id, name, category, family, storey, predefinedType, volume), every props.<path>, psets.<Set>.<Prop> and quantities.<Set>.<Prop>, each with its type and how many of the elements have it. Families sessions get their quantities from an in-memory IFC export, so they match what export_ifc writes; pass quantities: false to skip that.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          where: WHERE,
          quantities: { type: 'boolean', description: 'Include quantity sets (default true).' },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const s = await selection(sessions, a, optionalBoolean(a, 'quantities') ?? true);
        return jsonResult({
          sessionId: s.session.id,
          buildHash: s.buildHash,
          matched: s.records.length,
          fields: schedulableFields(s.records, s.quantities),
          ...(s.quantities ? { units: QUANTITY_UNITS } : {}),
        });
      },
    },
    {
      name: 'schedule',
      title: 'Schedule',
      description:
        'A schedule of the elements `where` selects: one row per element with the given fields, or with groupBy one row per group with its count and the sum of every other numeric field. sortBy orders the rows; totals sum each numeric field over every selected element. With outPath the full table is also written as CSV (asking before replacing a file). Get field names from list_schedulable_fields.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          where: WHERE,
          fields: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Columns, e.g. ["name", "storey", "quantities.Qto_WallBaseQuantities.NetVolume"].',
          },
          groupBy: { type: 'array', items: { type: 'string' } },
          sortBy: {
            type: 'array',
            items: {
              anyOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: { field: { type: 'string' }, descending: { type: 'boolean' } },
                  required: ['field'],
                },
              ],
            },
            description: 'Sort keys, first one strongest. A field name alone sorts ascending.',
          },
          limit: {
            type: 'number',
            description: `Rows to return (default ${DEFAULT_ROWS}, max ${MAX_ROWS}).`,
          },
          outPath: {
            type: 'string',
            description: 'Write the whole table here as CSV (must end in .csv).',
          },
          overwrite: { type: 'boolean', description: 'Replace an existing CSV without asking.' },
          timeoutMs: { type: 'number', description: 'Budget for deriving quantities, in ms.' },
        },
        required: ['sessionId', 'fields'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      handler: async (a) => {
        const fields = stringArray(a, 'fields', MAX_FIELDS);
        if (fields === undefined || fields.length === 0)
          throw new ArgError('"fields" must list at least one field');
        const groupBy = stringArray(a, 'groupBy', MAX_FIELDS);
        const outArg = optionalString(a, 'outPath');
        if (outArg !== undefined && extname(outArg).toLowerCase() !== '.csv') {
          throw new ArgError('"outPath" must end in .csv');
        }
        const spec = { fields, ...(groupBy ? { groupBy } : {}), sortBy: parseSortBy(a['sortBy']) };
        const s = await selection(sessions, a, usesQuantities([...fields, ...(groupBy ?? [])]));
        const table = runSchedule(s.records, spec, s.quantities);
        const limit = Math.min(optionalCount(a, 'limit') ?? DEFAULT_ROWS, MAX_ROWS);
        let csvPath: string | undefined;
        if (outArg !== undefined) {
          csvPath = resolve(sessions.cwd, outArg);
          const stop = await writeOutput(
            confirm,
            csvPath,
            toCsv(table.columns, table.rows),
            optionalBoolean(a, 'overwrite') === true,
            'a schedule CSV'
          );
          if (stop) return stop;
        }
        return jsonResult({
          sessionId: s.session.id,
          buildHash: s.buildHash,
          matched: s.records.length,
          columns: table.columns,
          rows: table.rows.slice(0, limit),
          rowCount: table.rows.length,
          totals: table.totals,
          ...(csvPath !== undefined ? { csvPath } : {}),
          ...(s.quantities ? { units: QUANTITY_UNITS } : {}),
        });
      },
    },
  ];
}
