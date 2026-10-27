/**
 * BIM session tools: open a families program or an IFC file, rebuild it after source edits, and
 * query its elements by key path or GlobalId. The design mirrors Revit's MCP query loop (find ids
 * with counts, then fetch details), with the program on disk as the model's source of truth.
 */

import { basename } from 'node:path';
import type {
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/types.js';
import {
  breakdown,
  FIELD_GROUPS,
  matcher,
  parseWhere,
  project,
  tree,
  type FieldGroup,
} from '../session/query.js';
import type { BuildDiff } from '../session/diff.js';
import type { BuildDiagnostic } from '../session/records.js';
import { SessionError } from '../session/sessions.js';
import type { Session, SessionManager } from '../session/sessions.js';
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

const MAX_TIMEOUT_MS = 600_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const MAX_IDS = 200;
const MAX_DIAGNOSTICS = 50;
const DIFF_PAGE = 100;
const MAX_DIFF_PAGE = 500;

const SESSION_ID = { type: 'string', description: 'Session id from open_model.' };
const EXPECT_BUILD = {
  type: 'string',
  description:
    'Optional buildHash from an earlier result. The call fails with BUILD_MISMATCH if the session has been rebuilt since, so ids from an old build are never used by mistake.',
};
const TIMEOUT = {
  type: 'number',
  description: 'Build budget in ms (default 120000, max 600000). Past it the build is killed.',
};
const PREDICATES = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      op: {
        type: 'string',
        enum: ['exists', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'],
      },
      value: {},
    },
    required: ['path'],
  },
};

function cap<T>(list: readonly T[], max: number, key: string): Record<string, unknown> {
  return {
    [key]: list.slice(0, max),
    ...(list.length > max ? { [`${key}Total`]: list.length } : {}),
  };
}

/** One page of a diff: the same slice of the added, removed and changed lists, plus totals. */
function diffPage(d: BuildDiff, offset: number, limit: number): Record<string, unknown> {
  const page = <T>(xs: readonly T[]) => xs.slice(offset, offset + limit);
  const longest = Math.max(d.added.length, d.removed.length, d.changed.length);
  return {
    counts: {
      added: d.added.length,
      removed: d.removed.length,
      changed: d.changed.length,
      unchanged: d.unchanged,
    },
    offset,
    added: page(d.added),
    removed: page(d.removed),
    changed: page(d.changed),
    ...(offset + limit < longest ? { nextOffset: offset + limit } : {}),
  };
}

function diagnostics(list: readonly BuildDiagnostic[]): Record<string, unknown> {
  return cap(list, MAX_DIAGNOSTICS, 'diagnostics');
}

function overview(s: Session): Record<string, unknown> {
  const { summary } = s.build;
  const counts = breakdown(summary.elements);
  return {
    sessionId: s.id,
    kind: s.kind,
    path: s.path,
    buildHash: s.build.buildHash,
    units: summary.units,
    ...(summary.schema !== undefined ? { schema: summary.schema } : {}),
    ...(summary.applicationName !== undefined ? { applicationName: summary.applicationName } : {}),
    elementCount: summary.elements.length,
    byCategory: counts.category,
    byStorey: counts.storey,
    byFamily: counts.family,
  };
}

function parseFields(raw: string[] | undefined): ReadonlySet<FieldGroup> {
  if (raw === undefined) return new Set(FIELD_GROUPS);
  for (const f of raw) {
    if (!FIELD_GROUPS.includes(f as FieldGroup)) {
      throw new ArgError(`unknown field group '${f}' (expected ${FIELD_GROUPS.join(', ')})`);
    }
  }
  return new Set(raw as FieldGroup[]);
}

export function sessionTools(sessions: SessionManager): ToolDef[] {
  return [
    {
      name: 'open_model',
      title: 'Open BIM model',
      description:
        'Open a BIM model as a session: a brepjs-families program (a .tsx or .ts module whose default export is an element tree) or an .ifc file. The model is built in a sandboxed worker, like `brep preview` would, and the result gives a sessionId, a buildHash, and element counts by category, storey and family. Families elements are addressed by key path (for example ground/south/voids:entry), IFC elements by GlobalId. Type errors fail the build unless typecheck is false.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Path to the program or .ifc file, absolute or relative to the server cwd.',
          },
          typecheck: {
            type: 'boolean',
            description: 'Type-check a families program before running it (default true).',
          },
          timeoutMs: TIMEOUT,
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const typecheck = optionalBoolean(a, 'typecheck');
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS);
        const r = await sessions.open(requireString(a, 'path'), {
          ...(typecheck !== undefined ? { typecheck } : {}),
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        });
        if (!r.ok) {
          return jsonResult(
            { ok: false, path: r.path, ...diagnostics(r.diagnostics), durationMs: r.durationMs },
            true
          );
        }
        return jsonResult({
          ok: true,
          ...overview(r.session),
          ...diagnostics(r.session.build.summary.diagnostics),
          durationMs: r.durationMs,
        });
      },
    },
    {
      name: 'list_sessions',
      title: 'List sessions',
      description:
        'List open sessions with their source path, buildHash and element count. A session is stale when its source files changed on disk since the last build; call rebuild to pick the edits up.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async () => {
        const status = await sessions.status();
        return jsonResult({
          maxSessions: sessions.maxSessions,
          sessions: status.map(({ session: s, stale }) => ({
            sessionId: s.id,
            kind: s.kind,
            path: s.path,
            buildHash: s.build.buildHash,
            elementCount: s.build.summary.elements.length,
            stale,
            workerAlive: s.worker?.alive ?? false,
            ...(s.lastFailure ? { lastRebuildFailedAt: s.lastFailure.at.toISOString() } : {}),
            builtAt: s.build.builtAt.toISOString(),
          })),
        });
      },
    },
    {
      name: 'close_model',
      title: 'Close session',
      description:
        "Close a session: stop its worker and free its memory. The model's files are not touched.",
      inputSchema: {
        type: 'object',
        properties: { sessionId: SESSION_ID },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const id = requireString(a, 'sessionId');
        sessions.close(id);
        return jsonResult({ ok: true, sessionId: id, closed: true });
      },
    },
    {
      name: 'rebuild',
      title: 'Rebuild session',
      description:
        "Re-read a session's source after you edit it and diff the new build against the last good one: added and removed ids, and for each changed element its prop, pset and identity before/after values, whether its geometry changed, and its volume (mm³) and bounds (mm) deltas. Check that the diff touches only the elements you meant to change. Each list holds the first 100 entries; when there are more, nextOffset is set and get_diff returns the rest. A rebuild fails when the program fails to build or when an element's geometry fails that built before; a failed rebuild keeps serving the last good build (servingLastGood: true) and returns the errors.",
      inputSchema: {
        type: 'object',
        properties: { sessionId: SESSION_ID, timeoutMs: TIMEOUT },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const id = requireString(a, 'sessionId');
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS);
        const r = await sessions.rebuild(id, timeoutMs !== undefined ? { timeoutMs } : {});
        if (!r.ok) {
          return jsonResult(
            {
              ok: false,
              sessionId: id,
              servingLastGood: true,
              buildHash: r.session.build.buildHash,
              ...diagnostics(r.diagnostics),
              durationMs: r.durationMs,
            },
            true
          );
        }
        const { diff } = r;
        return jsonResult({
          ok: true,
          sessionId: id,
          buildHash: r.session.build.buildHash,
          previousBuildHash: r.previousBuildHash,
          elementCount: r.session.build.summary.elements.length,
          diff: diffPage(diff, 0, DIFF_PAGE),
          ...diagnostics(r.session.build.summary.diagnostics),
          durationMs: r.durationMs,
        });
      },
    },
    {
      name: 'get_diff',
      title: 'Get rebuild diff',
      description:
        "Page through the diff from the session's last successful rebuild, the one that produced its current build. Use it when a rebuild result sets nextOffset: each page holds the same slice of the added, removed and changed lists.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          offset: { type: 'number', description: 'Page start (default 0).' },
          limit: {
            type: 'number',
            description: `Page size (default ${DIFF_PAGE}, max ${MAX_DIFF_PAGE}).`,
          },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const s = sessions.get(requireString(a, 'sessionId'), optionalString(a, 'expectBuild'));
        if (s.lastDiff === undefined) {
          throw new SessionError('NO_DIFF', `session ${s.id} has not been rebuilt since it opened`);
        }
        const limit = Math.min(optionalCount(a, 'limit') ?? DIFF_PAGE, MAX_DIFF_PAGE);
        return jsonResult({
          sessionId: s.id,
          buildHash: s.build.buildHash,
          previousBuildHash: s.lastDiff.previousBuildHash,
          diff: diffPage(s.lastDiff.diff, optionalCount(a, 'offset') ?? 0, limit),
        });
      },
    },
    {
      name: 'query_elements',
      title: 'Query elements',
      description:
        'Find elements in a session. All filters in `where` must hold. Returns a page of matching ids plus counts by category, storey and family over every match, so a broad query can be narrowed before fetching details with get_elements.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          where: {
            type: 'object',
            description: 'Filters. Omit to match every element.',
            properties: {
              category: {
                type: ['string', 'array'],
                items: { type: 'string' },
                description:
                  'Families archetype (wall, door, storey, opening) or IFC category (WALL, DOOR, STOREY). Case-insensitive.',
              },
              family: {
                type: ['string', 'array'],
                items: { type: 'string' },
                description: 'Families type name (Wall, Door). Case-insensitive.',
              },
              storey: {
                type: 'string',
                description: 'Containing storey: its id, or a glob on its name (case-insensitive).',
              },
              name: { type: 'string', description: 'Glob on the element name (case-insensitive).' },
              id: {
                type: 'string',
                description:
                  'Glob on the id. `*` and `?` stay within a key-path segment, `**` crosses them: ground/*/voids:*',
              },
              props: {
                ...PREDICATES,
                description:
                  'Families prop predicates. path is a dot path into props (width, at.0). op defaults to eq with a value, exists without.',
              },
              psets: {
                ...PREDICATES,
                description:
                  'Property or quantity set predicates. path is SetName.Property, e.g. Pset_WallCommon.FireRating.',
              },
              bounds: {
                type: 'object',
                description: 'Axis-aligned box in mm; either corner may be omitted.',
                properties: {
                  min: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                  max: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
                  mode: { type: 'string', enum: ['intersects', 'within'] },
                },
              },
              hasGeometry: {
                type: 'boolean',
                description: 'false selects containers such as storeys and spatial nodes.',
              },
            },
          },
          limit: {
            type: 'number',
            description: `Page size (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
          },
          offset: { type: 'number', description: 'Page start (default 0).' },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const s = sessions.get(requireString(a, 'sessionId'), optionalString(a, 'expectBuild'));
        const where = parseWhere(a['where']);
        const limit = Math.min(optionalCount(a, 'limit') ?? DEFAULT_LIMIT, MAX_LIMIT);
        const offset = optionalCount(a, 'offset') ?? 0;
        const matched = s.build.summary.elements.filter(matcher(where));
        return jsonResult({
          sessionId: s.id,
          buildHash: s.build.buildHash,
          total: matched.length,
          offset,
          ids: matched.slice(offset, offset + limit).map((r) => r.id),
          breakdown: breakdown(matched),
        });
      },
    },
    {
      name: 'get_elements',
      title: 'Get elements',
      description:
        'Full data for elements by id (key path or GlobalId): identity (name, type, archetype, category, storey, parent), props, psets, quantities, material, classification, relationships (Contains, Voids, Fills), children, and geometry (hasGeometry, geometryHash, bounds in mm, volume in mm³). Pass fields to return only some groups; identity is always included.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          ids: { type: 'array', items: { type: 'string' }, description: `Up to ${MAX_IDS} ids.` },
          fields: {
            type: 'array',
            items: { type: 'string', enum: [...FIELD_GROUPS] },
            description: 'Groups to include (default all). Pass [] for identity only.',
          },
        },
        required: ['sessionId', 'ids'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const s = sessions.get(requireString(a, 'sessionId'), optionalString(a, 'expectBuild'));
        const ids = stringArray(a, 'ids', MAX_IDS);
        if (ids === undefined || ids.length === 0)
          throw new ArgError('"ids" must list at least one id');
        const fields = parseFields(stringArray(a, 'fields', FIELD_GROUPS.length));
        const elements: Record<string, unknown>[] = [];
        const missing: string[] = [];
        for (const id of ids) {
          const rec = s.build.index.get(id);
          if (rec) elements.push(project(rec, fields));
          else missing.push(id);
        }
        return jsonResult({
          sessionId: s.id,
          buildHash: s.build.buildHash,
          elements,
          ...(missing.length > 0 ? { missing } : {}),
        });
      },
    },
  ];
}

const TREE_URI = /^brep:\/\/sessions\/([^/]+)\/tree$/;
const ELEMENT_URI = /^brep:\/\/sessions\/([^/]+)\/elements\/(.+)$/;

export const SESSION_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  {
    uriTemplate: 'brep://sessions/{sessionId}/tree',
    name: 'session-tree',
    title: 'Session element tree',
    description:
      'The element tree of an open session: id, type, category and name per element, nested by parent.',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'brep://sessions/{sessionId}/elements/{elementId}',
    name: 'session-element',
    title: 'Session element',
    description:
      'One element of an open session, in the get_elements shape. Percent-encode the key path or GlobalId.',
    mimeType: 'application/json',
  },
];

export function listSessionResources(sessions: SessionManager): Resource[] {
  return sessions.all().map((s) => ({
    uri: `brep://sessions/${s.id}/tree`,
    name: `${s.id}-tree`,
    title: `${basename(s.path)} element tree`,
    mimeType: 'application/json',
  }));
}

/** Read a brep://sessions resource, or undefined when the URI is not one. */
export function readSessionResource(
  sessions: SessionManager,
  uri: string
): ReadResourceResult | undefined {
  const treeMatch = TREE_URI.exec(uri);
  if (treeMatch) {
    const s = sessions.get(decodeURIComponent(treeMatch[1] ?? ''));
    const { root, unparented } = tree(s.build.summary.elements, s.build.summary.root);
    const body = {
      sessionId: s.id,
      buildHash: s.build.buildHash,
      root,
      ...(unparented.length > 0 ? { unparented } : {}),
    };
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body) }] };
  }
  const elementMatch = ELEMENT_URI.exec(uri);
  if (elementMatch) {
    const s = sessions.get(decodeURIComponent(elementMatch[1] ?? ''));
    const id = decodeURIComponent(elementMatch[2] ?? '');
    const rec = s.build.index.get(id);
    if (rec === undefined) return undefined;
    const body = {
      sessionId: s.id,
      buildHash: s.build.buildHash,
      element: project(rec, new Set(FIELD_GROUPS)),
    };
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body) }] };
  }
  return undefined;
}
