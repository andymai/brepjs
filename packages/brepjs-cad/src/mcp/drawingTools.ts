/**
 * Drawings and handover data: storey plans and sections as SVG, DXF or PNG, the spaces of a
 * building with their measured floor outlines, and COBie sheets for a families model.
 */

import { mkdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { COBIE_FORMATS, type CobieFormat } from '../session/cobie.js';
import type { DrawingSpec } from '../session/drawing.js';
import type { DrawingArgs } from '../session/protocol.js';
import type { ElementRecord } from '../session/records.js';
import { selectIds, storeyPlan } from '../session/style.js';
import type { Session, SessionManager } from '../session/sessions.js';
import { askToReplace, fileExists, writeOutput, type Confirm } from './output.js';
import {
  ArgError,
  jsonResult,
  optionalBoolean,
  optionalPositive,
  optionalString,
  requireString,
  stringArray,
  type ToolDef,
} from './registry.js';
import {
  EXPECT_BUILD,
  MAX_TIMEOUT_MS,
  SESSION_ID,
  defaultProject,
  imageResult,
  parseProject,
} from './sessionTools.js';

const DRAWING_TIMEOUT_MS = 300_000;
const SPACES_TIMEOUT_MS = 120_000;
const COBIE_TIMEOUT_MS = 300_000;
const FORMATS = ['svg', 'dxf', 'png'] as const;
type DrawingFormat = (typeof FORMATS)[number];
const MAX_SKIPPED = 20;
// Openings are the voids cut from their hosts, and spaces are rooms' air (get_spaces measures
// them); neither is drawn as a physical edge.
const UNDRAWN = new Set(['opening', 'space']);

function drawable(r: ElementRecord): boolean {
  return r.hasGeometry && !UNDRAWN.has(r.category.toLowerCase());
}
const MAX_ELEMENTS = 5000;
const QUANTITY_TIMEOUT_MS = 120_000;

function numberArg(a: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ArgError(`"${key}" must be a number`);
  return v;
}

/** The output file's format: the extension of outPath, which must agree with format if both. */
function drawingFormat(
  a: Readonly<Record<string, unknown>>,
  cwd: string
): { out?: string; format: DrawingFormat } {
  const raw = optionalString(a, 'outPath');
  const given = optionalString(a, 'format');
  if (given !== undefined && !(FORMATS as readonly string[]).includes(given)) {
    throw new ArgError(`"format" must be one of ${FORMATS.join(', ')}`);
  }
  if (raw === undefined) return { format: (given as DrawingFormat | undefined) ?? 'svg' };
  const ext = extname(raw).slice(1).toLowerCase();
  if (!(FORMATS as readonly string[]).includes(ext)) {
    throw new ArgError(`"outPath" must end in .${FORMATS.join(', .')}`);
  }
  if (given !== undefined && given !== ext) {
    throw new ArgError(`"format" is ${given} but outPath ends in .${ext}`);
  }
  return { out: resolve(cwd, raw), format: ext as DrawingFormat };
}

const DRAWING_OUTPUT = {
  outPath: {
    type: 'string',
    description:
      'Where to save the drawing: .svg, .dxf (model millimetres, one layer per cut category plus BEYOND) or .png. Relative to the server cwd.',
  },
  format: { type: 'string', enum: [...FORMATS], description: 'Must match outPath if both.' },
  overwrite: { type: 'boolean', description: 'Replace an existing outPath without asking.' },
  timeoutMs: {
    type: 'number',
    description: `Budget in ms (default ${DRAWING_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
  },
} as const;

/** The digest every drawing shares, the file it was saved to, and its preview. */
async function finishDrawing(
  confirm: Confirm,
  a: Readonly<Record<string, unknown>>,
  out: string | undefined,
  format: DrawingFormat,
  result: Awaited<ReturnType<SessionManager['drawing']>>,
  digest: Record<string, unknown>
) {
  const outcome = result.outcome;
  if (outcome === undefined) {
    return jsonResult(
      { error: 'NOTHING_TO_DRAW', message: 'no element with geometry to draw', ...digest },
      true
    );
  }
  const summary = {
    ...digest,
    cut: outcome.cut.length,
    beyond: outcome.beyond.length,
    layers: outcome.layers,
    ...(outcome.bounds
      ? {
          extentMm: {
            width: Math.round(outcome.bounds.maxX - outcome.bounds.minX),
            height: Math.round(outcome.bounds.maxY - outcome.bounds.minY),
          },
        }
      : {}),
    ...(outcome.skipped.length > 0 ? { skipped: outcome.skipped.slice(0, MAX_SKIPPED) } : {}),
    ...(outcome.pngError !== undefined ? { previewSkipped: outcome.pngError } : {}),
  };
  let saved: Record<string, unknown> = {};
  if (out !== undefined) {
    const data = format === 'svg' ? outcome.svg : format === 'dxf' ? outcome.dxf : outcome.png;
    if (data === undefined) {
      throw new Error(`no ${format} to save${outcome.pngError ? `: ${outcome.pngError}` : ''}`);
    }
    const stop = await writeOutput(
      confirm,
      out,
      data,
      optionalBoolean(a, 'overwrite') === true,
      `a ${format.toUpperCase()} drawing`
    );
    if (stop) return stop;
    saved = { path: out, format };
  }
  const full = { ...summary, ...saved };
  return outcome.png ? imageResult(full, [outcome.png]) : jsonResult(full);
}

function storeysOf(records: readonly ElementRecord[]): string {
  const storeys = records.filter((r) => r.category.toLowerCase() === 'storey');
  return storeys.map((r) => r.name ?? r.id).join(', ') || 'none';
}

function isSpace(r: ElementRecord): boolean {
  return r.category.toLowerCase() === 'space';
}

/** The base quantities an IFC file (or a families export) records for a space, when it has them. */
function spaceQuantities(
  quantities: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined
): Record<string, unknown> | undefined {
  if (quantities === undefined) return undefined;
  const set = Object.entries(quantities).find(([name]) => /SpaceBaseQuantities/i.test(name));
  return set ? { [set[0]]: set[1] } : undefined;
}

export function drawingTools(sessions: SessionManager, confirm: Confirm): ToolDef[] {
  return [
    {
      name: 'plan_view',
      title: 'Plan view',
      description:
        "Draw one storey's plan: every element of the storey that the horizontal cut plane crosses (1200 mm above the storey's floor, or cutHeight) is drawn heavy on a CUT-<category> layer, and what lies below the cut thin on BEYOND, by hidden-line projection, so nearer elements hide farther ones. Openings and spaces are not drawn. Coordinates are model millimetres, x east and y north. Returns a PNG preview after a text digest of the elements cut and drawn, and saves the drawing as SVG, DXF or PNG when outPath is given. A DXF opens 1:1 in CAD tools.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          storey: { type: 'string', description: 'Storey id or name.' },
          cutHeight: { type: 'number', description: 'Cut height above the floor, mm.' },
          depth: {
            type: 'number',
            description:
              'How far below the cut to draw, mm (default: all of the storey; 0 draws only the cut).',
          },
          ...DRAWING_OUTPUT,
        },
        required: ['sessionId', 'storey'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const storey = requireString(a, 'storey');
        const cutHeight = numberArg(a, 'cutHeight');
        const depth = numberArg(a, 'depth');
        if (depth !== undefined && depth < 0) throw new ArgError('"depth" must not be negative');
        const { out, format } = drawingFormat(a, sessions.cwd);
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? DRAWING_TIMEOUT_MS;
        const result = await sessions.drawing(
          sessionId,
          { timeoutMs, expectBuild: optionalString(a, 'expectBuild') },
          (s) => {
            const records = s.build.summary.elements;
            const plan = storeyPlan(records, storey, cutHeight);
            if (plan === undefined) {
              throw new ArgError(`no storey '${storey}' (storeys: ${storeysOf(records)})`);
            }
            const spec: DrawingSpec = {
              axis: 'z',
              at: plan.section.at,
              side: 1,
              ...(depth !== undefined ? { depth } : {}),
            };
            const byId = s.build.index;
            const ids = [...plan.members].filter((id) => {
              const r = byId.get(id);
              return r !== undefined && drawable(r);
            });
            const meta = {
              sessionId: s.id,
              buildHash: s.build.buildHash,
              storey: plan.storey.id,
              cutAt: plan.section.at,
              elements: ids.length,
            };
            if (ids.length === 0) return { meta };
            const args: DrawingArgs = {
              spec,
              ids,
              title: `${plan.storey.name ?? plan.storey.id}: plan at ${plan.section.at} mm`,
              dxf: format === 'dxf',
              png: true,
            };
            return { args, meta };
          }
        );
        return finishDrawing(confirm, a, out, format, result, result.meta);
      },
    },
    {
      name: 'section_view',
      title: 'Section view',
      description:
        'Draw a vertical section: a plane square to the x or y axis at "at" mm cuts the elements (drawn heavy, by category) and what lies beyond it, in the direction you look, is projected thin with hidden lines removed (openings and spaces are not drawn). look picks the direction: "+" looks toward +axis (a y section looking north), "-" the other way. Elements take ids or globs to limit the drawing (default: every element). Returns a PNG preview after a text digest, and saves SVG, DXF or PNG when outPath is given. Coordinates are model millimetres, with z up.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          axis: { type: 'string', enum: ['x', 'y'] },
          at: { type: 'number', description: 'Where the plane cuts the axis, mm.' },
          look: { type: 'string', enum: ['+', '-'], description: 'Default "+".' },
          depth: {
            type: 'number',
            description:
              'How far beyond the cut to draw, mm (default: everything; 0 only the cut).',
          },
          elements: {
            type: 'array',
            items: { type: 'string' },
            description: `Up to ${MAX_ELEMENTS} ids or globs.`,
          },
          ...DRAWING_OUTPUT,
        },
        required: ['sessionId', 'axis', 'at'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const axis = requireString(a, 'axis');
        if (axis !== 'x' && axis !== 'y') throw new ArgError('"axis" must be x or y');
        const at = numberArg(a, 'at');
        if (at === undefined) throw new ArgError('"at" is required');
        const look = optionalString(a, 'look') ?? '+';
        if (look !== '+' && look !== '-') throw new ArgError('"look" must be + or -');
        const depth = numberArg(a, 'depth');
        if (depth !== undefined && depth < 0) throw new ArgError('"depth" must not be negative');
        const elements = stringArray(a, 'elements', MAX_ELEMENTS);
        const { out, format } = drawingFormat(a, sessions.cwd);
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? DRAWING_TIMEOUT_MS;
        // Looking toward +axis puts the viewer on the minus side.
        const side = look === '+' ? -1 : 1;
        const result = await sessions.drawing(
          sessionId,
          { timeoutMs, expectBuild: optionalString(a, 'expectBuild') },
          (s) => {
            const records = s.build.summary.elements;
            let ids: string[];
            if (elements === undefined) {
              ids = records.filter(drawable).map((r) => r.id);
            } else {
              const picked = selectIds(records, elements);
              if (picked.unmatched.length > 0) {
                throw new ArgError(`no element matches ${picked.unmatched.join(', ')}`);
              }
              ids = [...picked.ids].filter((id) => {
                const r = s.build.index.get(id);
                return r !== undefined && drawable(r);
              });
            }
            const meta = {
              sessionId: s.id,
              buildHash: s.build.buildHash,
              axis,
              at,
              look,
              elements: ids.length,
            };
            if (ids.length === 0) return { meta };
            const args: DrawingArgs = {
              spec: { axis, at, side, ...(depth !== undefined ? { depth } : {}) },
              ids,
              title: `section ${axis} = ${at} mm, looking ${look}${axis}`,
              dxf: format === 'dxf',
              png: true,
            };
            return { args, meta };
          }
        );
        return finishDrawing(confirm, a, out, format, result, result.meta);
      },
    },
    {
      name: 'get_spaces',
      title: 'Get spaces',
      description:
        "List a session's spaces (IfcSpace, or a families Space) with name, storey, floor area, perimeter and volume measured from each space's solid (its outline cut 10 mm above its floor), the outline itself as plan points in mm, and the base quantities the IFC data records for it, so measured and recorded areas can be compared. Families quantities come from an in-memory IFC export, as export_ifc writes them. Areas in m², volumes in m³.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          storey: { type: 'string', description: 'Only the spaces of this storey (id or name).' },
          outlines: {
            type: 'boolean',
            description: 'Include each outline as points (default true).',
          },
          timeoutMs: {
            type: 'number',
            description: `Budget in ms (default ${SPACES_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
          },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const storey = optionalString(a, 'storey');
        const outlines = optionalBoolean(a, 'outlines') ?? true;
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? SPACES_TIMEOUT_MS;
        const expectBuild = optionalString(a, 'expectBuild');
        const measured = await sessions.spaces(sessionId, { timeoutMs, expectBuild }, (s) => {
          const records = s.build.summary.elements;
          let spaces = records.filter(isSpace);
          if (storey !== undefined) {
            const plan = storeyPlan(records, storey);
            if (plan === undefined) {
              throw new ArgError(`no storey '${storey}' (storeys: ${storeysOf(records)})`);
            }
            spaces = spaces.filter((r) => r.storey?.id === plan.storey.id);
          }
          return { ids: spaces.filter((r) => r.hasGeometry).map((r) => r.id), meta: spaces };
        });
        const quantities = await recordedQuantities(sessions, measured.session, timeoutMs);
        const geometryOf = new Map(measured.geometry.map((g) => [g.id, g]));
        const spaces = measured.meta.map((r) => {
          const g = geometryOf.get(r.id);
          const recorded = spaceQuantities(quantities.byId?.[r.id] ?? r.quantities);
          return {
            id: r.id,
            ...(r.name !== undefined ? { name: r.name } : {}),
            ...(typeof r.props?.['longName'] === 'string' ? { longName: r.props['longName'] } : {}),
            ...(r.storey ? { storey: r.storey.name ?? r.storey.id } : {}),
            ...(g?.area !== undefined ? { area: round(g.area, 3) } : {}),
            ...(g?.perimeter !== undefined ? { perimeter: round(g.perimeter, 3) } : {}),
            ...(g?.volume !== undefined ? { volume: round(g.volume, 3) } : {}),
            ...(g?.floor !== undefined ? { floorMm: round(g.floor, 1) } : {}),
            ...(g?.height !== undefined ? { heightMm: round(g.height, 1) } : {}),
            ...(recorded ? { recorded } : {}),
            ...(outlines && g?.loops ? { outline: g.loops } : {}),
            ...(g?.error !== undefined
              ? { error: g.error }
              : !r.hasGeometry
                ? { error: 'no geometry' }
                : {}),
          };
        });
        return jsonResult({
          sessionId: measured.session.id,
          buildHash: measured.buildHash,
          count: spaces.length,
          totalArea: round(
            spaces.reduce((sum, sp) => sum + ('area' in sp ? sp.area : 0), 0),
            3
          ),
          ...(quantities.skipped ? { quantitiesSkipped: quantities.skipped } : {}),
          spaces,
        });
      },
    },
    {
      name: 'export_cobie',
      title: 'Export COBie',
      description:
        "Write a families session's COBie 2.4 handover data, derived by brepjs-bim from the same BIM projection export_ifc writes: one CSV per sheet (Contact, Facility, Floor, Space, Zone, Type, Component, System, Attribute) in outDir, or one cobie.json. Returns the rows per sheet. Use the same project as export_ifc so names and GlobalIds match. If any file exists you are asked once before they are replaced; clients that cannot ask need overwrite: true. IFC sessions cannot be exported.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          outDir: {
            type: 'string',
            description: 'Directory for the files; relative to the server cwd.',
          },
          format: { type: 'string', enum: [...COBIE_FORMATS], description: 'Default csv.' },
          project: {
            type: 'object',
            description: 'IfcProject name and id, as for export_ifc.',
            properties: { name: { type: 'string' }, projectId: { type: 'string' } },
          },
          contact: {
            type: 'object',
            description: 'The Contact sheet row (email is its key).',
            properties: {
              email: { type: 'string' },
              givenName: { type: 'string' },
              familyName: { type: 'string' },
              company: { type: 'string' },
              phone: { type: 'string' },
            },
          },
          overwrite: { type: 'boolean', description: 'Replace existing files without asking.' },
          timeoutMs: {
            type: 'number',
            description: `Budget in ms (default ${COBIE_TIMEOUT_MS}, max ${MAX_TIMEOUT_MS}).`,
          },
        },
        required: ['sessionId', 'outDir'],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const outDir = resolve(sessions.cwd, requireString(a, 'outDir'));
        const format = (optionalString(a, 'format') ?? 'csv') as CobieFormat;
        if (!(COBIE_FORMATS as readonly string[]).includes(format)) {
          throw new ArgError(`"format" must be one of ${COBIE_FORMATS.join(', ')}`);
        }
        const s = sessions.get(sessionId);
        const project = parseProject(a['project'], defaultProject(s.path));
        const contact = contactArg(a['contact']);
        const timeoutMs = optionalPositive(a, 'timeoutMs', MAX_TIMEOUT_MS) ?? COBIE_TIMEOUT_MS;
        const { outcome, buildHash } = await sessions.cobie(
          sessionId,
          { format, project, ...(contact ? { contact } : {}) },
          { timeoutMs, expectBuild: optionalString(a, 'expectBuild') }
        );
        if (!outcome.ok) return jsonResult({ ok: false, sessionId, error: outcome.error }, true);
        const names = Object.keys(outcome.files);
        let approved = optionalBoolean(a, 'overwrite') === true;
        if (!approved) {
          const existing: string[] = [];
          for (const name of names) if (await fileExists(join(outDir, name))) existing.push(name);
          if (existing.length > 0) {
            const stop = await askToReplace(
              confirm,
              join(outDir, existing.length === 1 ? (existing[0] ?? '') : `{${existing.join(',')}}`),
              `the COBie export of ${basename(s.path)}`
            );
            if (stop) return stop;
            approved = true;
          }
        }
        await mkdir(outDir, { recursive: true });
        for (const [name, text] of Object.entries(outcome.files)) {
          const stop = await writeOutput(
            confirm,
            join(outDir, name),
            text,
            approved,
            'a COBie sheet'
          );
          if (stop) return stop;
        }
        return jsonResult({
          ok: true,
          sessionId,
          buildHash,
          outDir,
          files: names,
          rows: outcome.rows,
          project,
        });
      },
    },
  ];
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function contactArg(raw: unknown): Record<string, string> | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ArgError('"contact" must be an object');
  }
  const out: Record<string, string> = {};
  for (const key of ['email', 'givenName', 'familyName', 'company', 'phone']) {
    const v = (raw as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (typeof v !== 'string') throw new ArgError(`"contact.${key}" must be a string`);
    out[key] = v;
  }
  return out;
}

/** Families quantities derive from an in-memory export; skip them, with the reason, if that fails. */
async function recordedQuantities(
  sessions: SessionManager,
  s: Session,
  timeoutMs: number
): Promise<{
  byId?: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, unknown>>>>>>;
  skipped?: string;
}> {
  if (s.kind === 'ifc') return {};
  try {
    const { byId } = await sessions.quantities(s.id, {
      timeoutMs: Math.min(timeoutMs, QUANTITY_TIMEOUT_MS),
      expectBuild: s.build.buildHash,
    });
    return { byId };
  } catch (e) {
    return { skipped: e instanceof Error ? e.message : String(e) };
  }
}
