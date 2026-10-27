/**
 * BIM session tools: open a families program or an IFC file, rebuild it after source edits, and
 * query its elements by key path or GlobalId. The design mirrors Revit's MCP query loop (find ids
 * with counts, then fetch details), with the program on disk as the model's source of truth.
 */

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, parse as parsePath, resolve } from 'node:path';
import type {
  CallToolResult,
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
import type { BuildDiagnostic, ElementRecord } from '../session/records.js';
import type { RenderSection, RenderShot, RenderView } from '../session/render.js';
import { COLOR_BY, planStyle, storeyPlan, type ColorBy } from '../session/style.js';
import type { IfcProjectSpec } from '../session/bim.js';
import { SessionError } from '../session/sessions.js';
import type { Session, SessionManager } from '../session/sessions.js';
import {
  ArgError,
  errorResult,
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
const RENDER_TIMEOUT_MS = 120_000;
const RENDER_VIEWS: readonly RenderView[] = ['iso', 'front', 'top', 'right'];
const VIEW_MODES = ['solid', 'wireframe', 'xray'] as const;
const MAX_SELECTION = 500;
const MAX_NOT_DRAWN = 20;
const EXPORT_TIMEOUT_MS = 300_000;
const MAX_GLOBAL_IDS = 500;
const MAX_EXPORT_ISSUES = 50;

/** What the session tools need from the server they run in. */
export interface SessionToolHost {
  /** The package version, written into exported files. */
  readonly version: string;
  /** Ask the person at the client a yes/no question, when the client can show one. */
  confirm(message: string): Promise<'yes' | 'no' | 'unsupported'>;
  /** List eval_in_session, which runs agent code with the server's permissions. */
  readonly allowCode?: boolean | undefined;
}

const EVAL_TIMEOUT_MS = 30_000;

function evalTool(sessions: SessionManager): ToolDef {
  return {
    name: 'eval_in_session',
    title: 'Run code in a session',
    description:
      "Run TypeScript against a session's live build, in its worker, and return the JSON result. The code is the body of an async function that receives ctx: { kind, brep (the brepjs namespace), records, record(id), model }. For a families session model is { root (the resolved tree), byKeyPath (each element's mesh and B-rep shape) }; for an IFC session it is the imported model. Return a JSON-serializable value; console output comes back as logs. There are no imports: use ctx.brep. Use it for questions the other tools can't answer, such as a measurement between two elements. The code runs with the server's own permissions, which is why the tool is listed only when brep-mcp starts with --allow-code. A timeout stops the session's worker, so rebuild before using the session again.",
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: SESSION_ID,
        expectBuild: EXPECT_BUILD,
        code: {
          type: 'string',
          description:
            'Function body, e.g. "return ctx.records.filter((r) => r.category === \'wall\').length;"',
        },
        timeoutMs: {
          type: 'number',
          description: `Budget in ms (default ${EVAL_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
        },
      },
      required: ['sessionId', 'code'],
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    handler: async (a) => {
      const sessionId = requireString(a, 'sessionId');
      const code = requireString(a, 'code');
      const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? EVAL_TIMEOUT_MS;
      const { outcome, buildHash } = await sessions.evalCode(sessionId, code, {
        timeoutMs,
        expectBuild: optionalString(a, 'expectBuild'),
      });
      return jsonResult({ sessionId, buildHash, ...outcome }, !outcome.ok);
    },
  };
}

/** The project scoping an export's GlobalIds: the nearest package.json name, else the file's. */
function defaultProject(modelPath: string): IfcProjectSpec {
  let dir = dirname(modelPath);
  const root = parsePath(dir).root;
  for (;;) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const name = (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: unknown }).name;
        if (typeof name === 'string' && name !== '') return { name, projectId: name };
      } catch {
        // an unreadable package.json names nothing; keep walking
      }
    }
    if (dir === root) break;
    dir = dirname(dir);
  }
  const name = basename(modelPath, extname(modelPath));
  return { name, projectId: name };
}

function parseProject(raw: unknown, fallback: IfcProjectSpec): IfcProjectSpec {
  if (raw === undefined) return fallback;
  if (!isRecord(raw)) throw new ArgError('"project" must be an object');
  const name = optionalString(raw, 'name') ?? fallback.name;
  const projectId = optionalString(raw, 'projectId') ?? name;
  const description = optionalString(raw, 'description');
  return { name, projectId, ...(description !== undefined ? { description } : {}) };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
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

/** A record by its id, or by the GlobalId the last export gave it. */
function lookup(s: Session, id: string): ElementRecord | undefined {
  return s.build.index.get(id) ?? s.build.index.get(s.exported?.keyPathOf.get(id) ?? '');
}

/** The get_elements shape, with the element's exported GlobalId when an export assigned one. */
function elementView(
  s: Session,
  rec: ElementRecord,
  fields: ReadonlySet<FieldGroup>
): Record<string, unknown> {
  const view = project(rec, fields);
  const exported = rec.guid === undefined ? s.exported?.byKeyPath.get(rec.id) : undefined;
  return exported !== undefined ? { ...view, guid: exported } : view;
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function oneOf<T extends string>(
  a: Record<string, unknown>,
  key: string,
  allowed: readonly T[]
): T | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new ArgError(`"${key}" must be one of ${allowed.join(', ')}`);
  }
  return v as T;
}

function parseViews(raw: unknown): RenderView[] {
  if (raw === undefined) return ['iso'];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > RENDER_VIEWS.length) {
    throw new ArgError(
      `"views" must list 1 to ${RENDER_VIEWS.length} of ${RENDER_VIEWS.join(', ')}`
    );
  }
  return raw.map((v) => {
    if (typeof v !== 'string' || !(RENDER_VIEWS as readonly string[]).includes(v)) {
      throw new ArgError(`unknown view '${String(v)}' (expected ${RENDER_VIEWS.join(', ')})`);
    }
    return v as RenderView;
  });
}

function parseSection(raw: unknown): RenderSection | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw)) throw new ArgError('"section" must be an object');
  const axis = oneOf(raw, 'axis', ['x', 'y', 'z'] as const);
  const at = raw['at'];
  if (axis === undefined || typeof at !== 'number' || !Number.isFinite(at)) {
    throw new ArgError('"section" needs an axis (x, y, z) and a position "at" in mm');
  }
  return { axis, at, keep: oneOf(raw, 'keep', ['below', 'above'] as const) ?? 'below' };
}

function parsePlan(raw: unknown): { storey: string; cutHeight?: number } | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || typeof raw['storey'] !== 'string') {
    throw new ArgError('"plan" needs a storey id or name');
  }
  const cutHeight = optionalPositive(raw, 'cutHeight', Number.MAX_VALUE);
  return { storey: raw['storey'], ...(cutHeight !== undefined ? { cutHeight } : {}) };
}

function imageResult(digest: unknown, pngs: readonly Uint8Array[]): CallToolResult {
  return {
    content: [
      { type: 'text', text: JSON.stringify(digest) },
      ...pngs.map((png) => ({
        type: 'image' as const,
        data: Buffer.from(png).toString('base64'),
        mimeType: 'image/png',
      })),
    ],
  };
}

export function sessionTools(sessions: SessionManager, host: SessionToolHost): ToolDef[] {
  return [
    ...(host.allowCode === true ? [evalTool(sessions)] : []),
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
      name: 'render_view',
      title: 'Render view',
      description:
        "Render a session's current build to 1200 x 900 PNGs, returned as images after a short text digest. highlight draws the given elements solid in orange and ghosts the rest; isolate draws only the given elements; both take ids or globs, and a container (a storey, a composed family) stands for the elements under it. colorBy colors what is drawn by category, storey or family and returns the legend. plan draws one storey from above, cut 1200 mm (or cutHeight) above its floor. After a rebuild, render with highlight set to the changed ids to check the edit by eye.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          views: {
            type: 'array',
            items: { type: 'string', enum: [...RENDER_VIEWS] },
            description: 'Camera views, one image each (default ["iso"]). Ignored with plan.',
          },
          viewMode: { type: 'string', enum: [...VIEW_MODES], description: 'Default solid.' },
          highlight: {
            type: 'array',
            items: { type: 'string' },
            description: `Up to ${MAX_SELECTION} ids or globs.`,
          },
          isolate: {
            type: 'array',
            items: { type: 'string' },
            description: `Up to ${MAX_SELECTION} ids or globs.`,
          },
          colorBy: { type: 'string', enum: [...COLOR_BY] },
          plan: {
            type: 'object',
            description:
              'A storey plan: the storey id or name, and the cut height above its floor in mm.',
            properties: { storey: { type: 'string' }, cutHeight: { type: 'number' } },
            required: ['storey'],
          },
          section: {
            type: 'object',
            description:
              'A cut at "at" mm along axis; keep picks the lower (below, default) or higher side.',
            properties: {
              axis: { type: 'string', enum: ['x', 'y', 'z'] },
              at: { type: 'number' },
              keep: { type: 'string', enum: ['below', 'above'] },
            },
            required: ['axis', 'at'],
          },
          dims: {
            type: 'boolean',
            description: "Burn the drawn elements' size into the image (default true).",
          },
          timeoutMs: {
            type: 'number',
            description: `Render budget in ms (default ${RENDER_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
          },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const expectBuild = optionalString(a, 'expectBuild');
        const views = parseViews(a['views']);
        const requestedSection = parseSection(a['section']);
        const planArg = parsePlan(a['plan']);
        const highlight = stringArray(a, 'highlight', MAX_SELECTION);
        const isolate = stringArray(a, 'isolate', MAX_SELECTION);
        const colorBy = oneOf<ColorBy>(a, 'colorBy', COLOR_BY);
        const viewMode = oneOf(a, 'viewMode', VIEW_MODES);
        const dims = optionalBoolean(a, 'dims') ?? true;
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? RENDER_TIMEOUT_MS;
        // Everything that reads the build runs inside the session queue, against the build drawn.
        const result = await sessions.render(sessionId, { timeoutMs, expectBuild }, (s) => {
          const records = s.build.summary.elements;
          let shotViews = views;
          let section = requestedSection;
          let scope: ReadonlySet<string> | undefined;
          let planInfo: Record<string, unknown> | undefined;
          if (planArg) {
            const plan = storeyPlan(records, planArg.storey, planArg.cutHeight);
            if (plan === undefined) {
              const storeys = records.filter((r) => r.category.toLowerCase() === 'storey');
              throw new ArgError(
                `no storey '${planArg.storey}' (storeys: ${storeys.map((r) => r.name ?? r.id).join(', ') || 'none'})`
              );
            }
            shotViews = ['top'];
            section ??= plan.section;
            scope = plan.members;
            planInfo = { storey: plan.storey.id, cutAt: plan.section.at };
          }
          const style = planStyle(records, { highlight, isolate, colorBy, scope });
          const digest = {
            sessionId: s.id,
            buildHash: s.build.buildHash,
            views: shotViews,
            drawn: style.drawn,
            highlighted: style.highlighted,
            ...(style.legend.length > 0 ? { legend: style.legend } : {}),
            ...(style.unmatched.length > 0 ? { unmatched: style.unmatched } : {}),
            ...(planInfo ? { plan: planInfo } : {}),
            ...(section ? { section } : {}),
          };
          if (style.drawn === 0) return { meta: { digest, drawnIds: style.drawnIds } };
          const shots: RenderShot[] = shotViews.map((view) => ({
            view,
            ...(viewMode !== undefined ? { viewMode } : {}),
            ...(section !== undefined ? { section } : {}),
            ...(planInfo ? { projection: 'orthographic' as const } : {}),
          }));
          return {
            request: { shots, ...(style.style ? { style: style.style } : {}), dims },
            meta: { digest, drawnIds: style.drawnIds },
          };
        });
        if (result.pngs === undefined) {
          return jsonResult(
            {
              error: 'NOTHING_TO_DRAW',
              message: 'the selection leaves no element with drawable geometry',
              ...result.meta.digest,
            },
            true
          );
        }
        // Records can't see a mesh that fails only when the worker builds the picture; count
        // against what was actually drawn.
        const notDrawn = [...result.meta.drawnIds].filter((id) => !result.drawable?.has(id));
        return imageResult(
          {
            ...result.meta.digest,
            drawn: result.meta.drawnIds.size - notDrawn.length,
            ...(notDrawn.length > 0 ? { notDrawn: notDrawn.slice(0, MAX_NOT_DRAWN) } : {}),
          },
          result.pngs
        );
      },
    },
    {
      name: 'export_ifc',
      title: 'Export IFC',
      description:
        "Write a families session's current build to an .ifc file through brepjs-bim's validated export (referential integrity, schema, and a write-read-write round trip). Returns the validation report with each issue mapped to a key path, the elements exported as IfcBuildingElementProxy because no IFC type matched, and the GlobalId of every exported key path (the first 500 here; after an export, get_elements reports each element's GlobalId and accepts GlobalIds as ids). GlobalIds are scoped by the project id, which defaults to the nearest package.json name, so keep it the same across exports. If outPath exists you are asked before it is replaced; clients that cannot ask need overwrite: true. IFC sessions cannot be exported.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          outPath: {
            type: 'string',
            description:
              'Where to write the file, ending in .ifc; relative paths resolve against the server cwd.',
          },
          project: {
            type: 'object',
            description: 'IfcProject name, id and description. projectId defaults to the name.',
            properties: {
              name: { type: 'string' },
              projectId: { type: 'string' },
              description: { type: 'string' },
            },
          },
          proxies: {
            type: 'boolean',
            description:
              'Export elements without an IFC route as IfcBuildingElementProxy (default true). false makes them fail the export.',
          },
          overwrite: { type: 'boolean', description: 'Replace an existing file without asking.' },
          timeoutMs: {
            type: 'number',
            description: `Export budget in ms (default ${EXPORT_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
          },
        },
        required: ['sessionId', 'outPath'],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const expectBuild = optionalString(a, 'expectBuild');
        const outArg = requireString(a, 'outPath');
        if (extname(outArg).toLowerCase() !== '.ifc')
          throw new ArgError('"outPath" must end in .ifc');
        const out = resolve(sessions.cwd, outArg);
        const s = sessions.get(sessionId);
        const project = parseProject(a['project'], defaultProject(s.path));
        const proxies = optionalBoolean(a, 'proxies') ?? true;
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? EXPORT_TIMEOUT_MS;
        let approved = optionalBoolean(a, 'overwrite') === true;
        const askToReplace = async (): Promise<CallToolResult | undefined> => {
          const answer = await host.confirm(
            `${out} already exists. Replace it with an IFC export of ${basename(s.path)}?`
          );
          if (answer === 'unsupported') {
            return errorResult(
              'FILE_EXISTS',
              `${out} already exists; pass overwrite: true to replace it`,
              {
                path: out,
              }
            );
          }
          if (answer === 'no') {
            return jsonResult(
              { ok: false, written: false, path: out, reason: 'overwrite declined' },
              true
            );
          }
          approved = true;
          return undefined;
        };
        // Ask before exporting, so a declined overwrite costs no export.
        if (!approved && (await fileExists(out))) {
          const stop = await askToReplace();
          if (stop) return stop;
        }
        const { outcome, buildHash } = await sessions.exportIfc(
          sessionId,
          { project, proxies, applicationVersion: host.version },
          { timeoutMs, expectBuild }
        );
        if (!outcome.ok) {
          return jsonResult(
            { ok: false, sessionId, written: false, ...diagnostics(outcome.diagnostics) },
            true
          );
        }
        await mkdir(dirname(out), { recursive: true });
        // Unapproved writes are exclusive: a file that appeared while the export ran (another
        // export to the same path, say) is asked about, not replaced.
        try {
          await writeFile(out, outcome.bytes, { flag: approved ? 'w' : 'wx' });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          const stop = await askToReplace();
          if (stop) return stop;
          await writeFile(out, outcome.bytes);
        }
        sessions.recordExport(sessionId, project.projectId ?? project.name, outcome.globalIds);
        const errors = outcome.issues.filter((i) => i.severity === 'error').length;
        const warnings = outcome.issues.filter((i) => i.severity === 'warning').length;
        const ids = Object.entries(outcome.globalIds);
        return jsonResult(
          {
            ok: errors === 0,
            sessionId,
            buildHash,
            written: true,
            path: out,
            bytes: outcome.bytes.byteLength,
            project,
            ...(outcome.proxied.length > 0 ? { proxied: outcome.proxied } : {}),
            validation: { errors, warnings, ...cap(outcome.issues, MAX_EXPORT_ISSUES, 'issues') },
            globalIds: Object.fromEntries(ids.slice(0, MAX_GLOBAL_IDS)),
            ...(ids.length > MAX_GLOBAL_IDS
              ? {
                  globalIdsTotal: ids.length,
                  globalIdsNote:
                    'get_elements returns every exported GlobalId and accepts GlobalIds as ids',
                }
              : {}),
          },
          errors > 0
        );
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
        'Full data for elements by id (key path or GlobalId; for a families session, a GlobalId from the last export_ifc works too): identity (name, type, archetype, category, storey, parent, and the GlobalId an export assigned), props, psets, quantities, material, classification, relationships (Contains, Voids, Fills), children, and geometry (hasGeometry, geometryHash, bounds in mm, volume in mm³). Pass fields to return only some groups; identity is always included.',
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
          const rec = lookup(s, id);
          if (rec) elements.push(elementView(s, rec, fields));
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
    const rec = lookup(s, id);
    if (rec === undefined) return undefined;
    const body = {
      sessionId: s.id,
      buildHash: s.build.buildHash,
      element: elementView(s, rec, new Set(FIELD_GROUPS)),
    };
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(body) }] };
  }
  return undefined;
}
