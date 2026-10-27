/**
 * BCF issues: raise one on session elements, with the viewpoint and snapshot render_view would
 * draw, and read a .bcf back onto a session's elements. Issues name elements by IFC GlobalId, so a
 * families session needs an export_ifc first.
 */

import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import type { BcfComponentLike, BcfTopicLike, BcfViewpointLike, BimNs } from '../session/bim.js';
import { importBim } from '../session/bim.js';
import {
  BcfError,
  bcfCamera,
  issueTopic,
  openContainer,
  packIssue,
  snapshotOf,
  type OpenedContainer,
} from '../session/bcf.js';
import type { ElementRecord } from '../session/records.js';
import type { RenderView } from '../session/render.js';
import { HIGHLIGHT_COLOR, planStyle, selectIds } from '../session/style.js';
import { SessionError, type Session, type SessionManager } from '../session/sessions.js';
import { askToReplace, fileExists, writeOutput, type Confirm } from './output.js';
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
import {
  EXPECT_BUILD,
  MAX_TIMEOUT_MS,
  RENDER_TIMEOUT_MS,
  RENDER_VIEWS,
  SESSION_ID,
  imageResult,
  lookup,
  oneOf,
} from './sessionTools.js';

const MAX_ELEMENTS = 500;
const TOPIC_PAGE = 20;
const MAX_TOPIC_PAGE = 100;
const MAX_COMPONENTS = 100;
const MAX_SNAPSHOTS = 4;
const FOCUS = ['highlight', 'isolate'] as const;
const BCF_EXTENSIONS = new Set(['.bcf', '.bcfzip']);

/** Appends to one file run one at a time, so two issues raised together both land. */
const fileQueues = new Map<string, Promise<unknown>>();
function serialize<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const run = (fileQueues.get(path) ?? Promise.resolve()).then(fn, fn);
  const settled = run.catch(() => undefined);
  fileQueues.set(path, settled);
  void settled.then(() => {
    if (fileQueues.get(path) === settled) fileQueues.delete(path);
  });
  return run;
}

async function bimFor(anchor: string): Promise<BimNs> {
  const bim = await importBim(anchor);
  if (bim === undefined) {
    throw new SessionError(
      'BIM_UNAVAILABLE',
      "BCF issues need 'brepjs-bim' installed in this project"
    );
  }
  return bim;
}

function bcfPath(cwd: string, raw: string, key: string): string {
  if (!BCF_EXTENSIONS.has(extname(raw).toLowerCase()))
    throw new ArgError(`"${key}" must end in .bcf or .bcfzip`);
  return resolve(cwd, raw);
}

function dateArg(a: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const raw = optionalString(a, key);
  if (raw === undefined) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new ArgError(`"${key}" must be an ISO 8601 date`);
  return date.toISOString();
}

/** The GlobalId of each selected element, or the ids that have none. */
function components(
  s: Session,
  ids: ReadonlySet<string>
): { components: BcfComponentLike[]; missing: string[] } {
  const out: BcfComponentLike[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const rec = s.build.index.get(id);
    const guid = rec?.guid ?? s.exported?.byKeyPath.get(id);
    if (guid === undefined) {
      missing.push(id);
      continue;
    }
    out.push({
      ifcGuid: guid,
      originatingSystem: 'brepjs-cad',
      ...(s.kind === 'families' ? { authoringToolId: id } : {}),
    });
  }
  return { components: out, missing };
}

/** The BCF project a new file records: the IfcProject an IFC file holds, or the export's. */
function projectOf(s: Session): { projectId: string; name: string } {
  const name = basename(s.path, extname(s.path));
  if (s.kind === 'families') return { projectId: s.exported?.projectId ?? name, name };
  const root = s.build.summary.root;
  const guid = root === undefined ? undefined : s.build.index.get(root)?.guid;
  return { projectId: guid ?? name, name };
}

/** A component as read_issues reports it: its GlobalId, and the session element it names. */
function resolved(
  s: Session | undefined,
  list: readonly BcfComponentLike[] | undefined,
  cap: number
): Record<string, unknown> {
  const all = list ?? [];
  const shown = all.slice(0, cap).map((c) => {
    const rec: ElementRecord | undefined =
      s !== undefined && c.ifcGuid !== undefined ? lookup(s, c.ifcGuid) : undefined;
    return {
      ...(c.ifcGuid !== undefined ? { globalId: c.ifcGuid } : {}),
      ...(rec ? { id: rec.id } : {}),
    };
  });
  return {
    components: shown,
    ...(all.length > cap ? { componentsTotal: all.length } : {}),
  };
}

function viewpointView(
  s: Session | undefined,
  vp: BcfViewpointLike,
  cap: number
): Record<string, unknown> {
  const c = vp.components;
  return {
    guid: vp.guid,
    ...(vp.snapshotFile !== undefined ? { snapshot: vp.snapshotFile } : {}),
    ...(vp.camera ? { camera: vp.camera } : {}),
    ...(c?.selection ? { selection: resolved(s, c.selection, cap) } : {}),
    ...(c?.coloring && c.coloring.length > 0
      ? {
          coloring: c.coloring.map((g) => ({ color: g.color, ...resolved(s, g.components, cap) })),
        }
      : {}),
    ...(c?.visibility
      ? {
          visibility: {
            defaultVisibility: c.visibility.defaultVisibility,
            exceptions: resolved(s, c.visibility.exceptions, cap),
          },
        }
      : {}),
  };
}

function topicView(s: Session | undefined, t: BcfTopicLike, cap: number): Record<string, unknown> {
  return {
    guid: t.guid,
    title: t.title,
    ...(t.topicType !== undefined ? { type: t.topicType } : {}),
    ...(t.topicStatus !== undefined ? { status: t.topicStatus } : {}),
    ...(t.priority !== undefined ? { priority: t.priority } : {}),
    ...(t.labels ? { labels: t.labels } : {}),
    ...(t.assignedTo !== undefined ? { assignedTo: t.assignedTo } : {}),
    ...(t.dueDate !== undefined ? { dueDate: t.dueDate } : {}),
    ...(t.creationDate !== undefined || t.creationAuthor !== undefined
      ? { created: { date: t.creationDate, author: t.creationAuthor } }
      : {}),
    ...(t.modifiedDate !== undefined || t.modifiedAuthor !== undefined
      ? { modified: { date: t.modifiedDate, author: t.modifiedAuthor } }
      : {}),
    ...(t.description !== undefined ? { description: t.description } : {}),
    ...(t.relatedTopics ? { relatedTopics: t.relatedTopics } : {}),
    comments: t.comments.map((c) => ({
      date: c.date,
      author: c.author,
      comment: c.comment,
      ...(c.viewpointRef !== undefined ? { viewpoint: c.viewpointRef } : {}),
    })),
    viewpoints: t.viewpoints.map((vp) => viewpointView(s, vp, cap)),
  };
}

async function readContainer(bim: BimNs, path: string): Promise<OpenedContainer> {
  try {
    return openContainer(bim, new Uint8Array(await readFile(path)));
  } catch (e) {
    if (e instanceof BcfError) throw new ArgError(`${path}: ${e.message}`);
    throw e;
  }
}

export function issueTools(sessions: SessionManager, confirm: Confirm): ToolDef[] {
  return [
    {
      name: 'create_issue',
      title: 'Create BCF issue',
      description: `Raise a BCF 3.0 issue on elements of a session and save it to a .bcf file that BCF tools open (BIMcollab, Solibri, Revit through a BCF add-in, and others). The issue gets one viewpoint: the elements as its selection (by IFC GlobalId), colored orange with the rest shown (focus "highlight") or alone (focus "isolate"), the camera of a render_view-style picture, and that picture as its snapshot, which is also returned. Elements take ids or globs; a container (a storey, a composed family) stands for the elements under it. A families session needs export_ifc first, since issues name the GlobalIds of the IFC file you share. If outPath is already a BCF file, the issue is added to it and its other topics are kept; overwrite: true starts a new file instead.`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          outPath: {
            type: 'string',
            description:
              'The .bcf (or .bcfzip) file to write; relative paths resolve against the server cwd.',
          },
          title: { type: 'string' },
          description: { type: 'string' },
          elements: {
            type: 'array',
            items: { type: 'string' },
            description: `Up to ${MAX_ELEMENTS} ids or globs. Omit for an issue on the model as a whole.`,
          },
          focus: { type: 'string', enum: [...FOCUS], description: 'Default highlight.' },
          view: { type: 'string', enum: [...RENDER_VIEWS], description: 'Default iso.' },
          topicType: { type: 'string', description: 'Default "Issue".' },
          status: { type: 'string', description: 'Default "Open".' },
          priority: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
          assignedTo: { type: 'string', description: 'Usually an email address.' },
          dueDate: { type: 'string', description: 'ISO 8601.' },
          author: {
            type: 'string',
            description: 'Who raised it, usually an email address (default "brep-mcp").',
          },
          comment: { type: 'string', description: 'A first comment on the viewpoint.' },
          overwrite: {
            type: 'boolean',
            description: 'Replace outPath with a new file holding only this issue.',
          },
          timeoutMs: {
            type: 'number',
            description: `Render budget in ms (default ${RENDER_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
          },
        },
        required: ['sessionId', 'outPath', 'title'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const out = bcfPath(sessions.cwd, requireString(a, 'outPath'), 'outPath');
        const title = requireString(a, 'title');
        const elements = stringArray(a, 'elements', MAX_ELEMENTS) ?? [];
        const focus = oneOf(a, 'focus', FOCUS) ?? 'highlight';
        const view = oneOf<RenderView>(a, 'view', RENDER_VIEWS) ?? 'iso';
        const labels = stringArray(a, 'labels', 50);
        const dueDate = dateArg(a, 'dueDate');
        const overwrite = optionalBoolean(a, 'overwrite') === true;
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? RENDER_TIMEOUT_MS;
        const bim = await bimFor(sessions.get(sessionId).path);

        const rendered = await sessions.render(
          sessionId,
          { timeoutMs, expectBuild: optionalString(a, 'expectBuild') },
          (s) => {
            const records = s.build.summary.elements;
            const selected = selectIds(records, elements);
            if (selected.unmatched.length > 0) {
              throw new ArgError(`no element matches ${selected.unmatched.join(', ')}`);
            }
            if (s.kind === 'families' && s.exported === undefined && selected.ids.size > 0) {
              throw new SessionError(
                'NOT_EXPORTED',
                `session ${s.id} has no GlobalIds yet: call export_ifc first, and share that file with the issue`
              );
            }
            const picked = components(s, selected.ids);
            if (picked.missing.length > 0) {
              throw new SessionError(
                'NO_GLOBAL_ID',
                `${picked.missing.length} element(s) have no GlobalId from the last export (added since?): ${picked.missing.slice(0, 20).join(', ')}. Export again first.`
              );
            }
            const style = planStyle(
              records,
              focus === 'isolate' && elements.length > 0
                ? { isolate: elements }
                : { highlight: elements.length > 0 ? elements : undefined }
            );
            const meta = {
              session: s,
              buildHash: s.build.buildHash,
              components: picked.components,
              project: projectOf(s),
            };
            if (style.drawn === 0) return { meta };
            return {
              request: {
                shots: [{ view }],
                ...(style.style ? { style: style.style } : {}),
                dims: false,
              },
              meta,
            };
          }
        );
        const png = rendered.pngs?.[0];
        const shotCamera = rendered.cameras?.[0];
        if (png === undefined || !shotCamera) {
          return errorResult(
            'NOTHING_TO_DRAW',
            'the selection leaves no element with drawable geometry, so the issue has no viewpoint'
          );
        }
        const { meta } = rendered;
        const topic = issueTopic(
          {
            title,
            topicType: optionalString(a, 'topicType') ?? 'Issue',
            topicStatus: optionalString(a, 'status') ?? 'Open',
            author: optionalString(a, 'author') ?? 'brep-mcp',
            description: optionalString(a, 'description'),
            priority: optionalString(a, 'priority'),
            labels,
            assignedTo: optionalString(a, 'assignedTo'),
            dueDate,
            comment: optionalString(a, 'comment'),
            components: meta.components,
            focus,
            color: HIGHLIGHT_COLOR.slice(1).toUpperCase(),
            camera: bcfCamera(shotCamera),
            snapshot: png,
          },
          new Date()
        );

        return serialize(out, async () => {
          let existing: OpenedContainer | undefined;
          let approved = overwrite;
          if (!overwrite && (await fileExists(out))) {
            try {
              existing = await readContainer(bim, out);
            } catch (e) {
              if (!(e instanceof ArgError)) throw e;
              const stop = await askToReplace(confirm, out, 'a new BCF file holding this issue');
              if (stop) return stop;
              approved = true;
            }
          }
          let bytes: Uint8Array;
          try {
            bytes = packIssue(bim, topic, png, meta.project, existing);
          } catch (e) {
            if (e instanceof BcfError) throw new ArgError(`${out}: ${e.message}`);
            throw e;
          }
          // Adding to a file is approved by its being a BCF file the call just read.
          const stop = await writeOutput(
            confirm,
            out,
            bytes,
            approved || existing !== undefined,
            'a new BCF file holding this issue'
          );
          if (stop) return stop;
          return imageResult(
            {
              ok: true,
              path: out,
              sessionId: meta.session.id,
              buildHash: meta.buildHash,
              topicGuid: topic.guid,
              appended: existing !== undefined,
              topics: (existing?.container.topics.length ?? 0) + 1,
              elements: meta.components.length,
              globalIds: meta.components.slice(0, MAX_COMPONENTS).map((c) => c.ifcGuid),
            },
            [png]
          );
        });
      },
    },
    {
      name: 'read_issues',
      title: 'Read BCF issues',
      description: `Read the topics of a BCF 3.0 file (.bcf or .bcfzip): title, type, status, priority, labels, assignee, dates, description, comments, and each viewpoint's camera and components (selected, colored, and visibility exceptions) by IFC GlobalId. Pass a sessionId to resolve each GlobalId to the session's element id (a families session resolves the GlobalIds of its last export_ifc). A comment's viewpoint names the viewpoint it was made on. snapshots: true also returns up to ${MAX_SNAPSHOTS} viewpoint snapshots from the page as images. Topics come ${TOPIC_PAGE} at a time; pass offset for the rest. Component lists stop at ${MAX_COMPONENTS} with componentsTotal set; pass topic (a topic guid) to read that one topic with every component.`,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The BCF file; relative to the server cwd.' },
          sessionId: { type: 'string', description: 'Session to resolve GlobalIds against.' },
          snapshots: { type: 'boolean', description: 'Return snapshots as images.' },
          topic: {
            type: 'string',
            description: 'Read only this topic (by guid), with every component listed.',
          },
          offset: { type: 'number', description: 'Page start (default 0).' },
          limit: {
            type: 'number',
            description: `Page size (default ${TOPIC_PAGE}, max ${MAX_TOPIC_PAGE}).`,
          },
        },
        required: ['path'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const path = bcfPath(sessions.cwd, requireString(a, 'path'), 'path');
        const sessionId = optionalString(a, 'sessionId');
        const session = sessionId === undefined ? undefined : sessions.get(sessionId);
        if (!(await fileExists(path))) throw new ArgError(`${path} does not exist`);
        const opened = await readContainer(await bimFor(session?.path ?? path), path);
        const only = optionalString(a, 'topic');
        const topics =
          only === undefined
            ? opened.container.topics
            : opened.container.topics.filter((t) => t.guid === only);
        if (only !== undefined && topics.length === 0) {
          throw new ArgError(`${path} has no topic ${only}`);
        }
        const cap = only === undefined ? MAX_COMPONENTS : Infinity;
        const offset = optionalCount(a, 'offset') ?? 0;
        const limit = Math.min(optionalCount(a, 'limit') ?? TOPIC_PAGE, MAX_TOPIC_PAGE);
        const page = topics.slice(offset, offset + limit);
        const pngs: Uint8Array[] = [];
        const snapshotOrder: string[] = [];
        if (optionalBoolean(a, 'snapshots') === true) {
          for (const t of page) {
            for (const vp of t.viewpoints) {
              const png = snapshotOf(opened, t, vp);
              if (png === undefined || pngs.length >= MAX_SNAPSHOTS) continue;
              pngs.push(png);
              snapshotOrder.push(`${t.guid}/${vp.guid}`);
            }
          }
        }
        let unresolved = 0;
        const views = page.map((t) => topicView(session, t, cap));
        if (session !== undefined) {
          for (const t of page) {
            for (const vp of t.viewpoints) {
              for (const c of vp.components?.selection ?? []) {
                if (c.ifcGuid !== undefined && lookup(session, c.ifcGuid) === undefined)
                  unresolved++;
              }
            }
          }
        }
        const digest = {
          path,
          project: opened.container.project,
          topicsTotal: topics.length,
          ...(offset + limit < topics.length ? { nextOffset: offset + limit } : {}),
          ...(session !== undefined
            ? {
                sessionId: session.id,
                buildHash: session.build.buildHash,
                unresolvedSelections: unresolved,
                ...(session.kind === 'families' && session.exported === undefined
                  ? { note: 'this session has no export_ifc yet, so no GlobalId resolves' }
                  : {}),
              }
            : {}),
          ...(snapshotOrder.length > 0 ? { snapshots: snapshotOrder } : {}),
          topics: views,
        };
        return pngs.length > 0 ? imageResult(digest, pngs) : jsonResult(digest);
      },
    },
  ];
}
