/**
 * The live viewer: show_model opens brepjs-viewer inline as an MCP App where the client supports
 * them (SEP-1865), and links a local preview page where it doesn't. The agent selects and frames
 * elements in it; the user's clicks come back as key paths or GlobalIds.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { startPreviewServer } from '../preview/server.js';
import { COLOR_BY, planStyle, selectIds, type ColorBy } from '../session/style.js';
import { viewerScene, type Session, type SessionManager } from '../session/sessions.js';
import {
  ArgError,
  jsonResult,
  optionalCount,
  optionalString,
  requireString,
  stringArray,
  type ToolDef,
} from './registry.js';
import { EXPECT_BUILD, SESSION_ID, oneOf } from './sessionTools.js';

export const VIEWER_URI = 'ui://brep-mcp/viewer';
export const APP_MIME = 'text/html;profile=mcp-app';
export const UI_EXTENSION = 'io.modelcontextprotocol/ui';
const PAYLOAD_TIMEOUT_MS = 120_000;
const MAX_IDS = 500;

const moduleDir = dirname(fileURLToPath(import.meta.url));
// src/mcp in development, dist/mcp once built: the app sits at the package root either way.
const VIEWER_APP = resolve(moduleDir, '../../viewer/dist/app/viewer-app.html');

export const VIEWER_RESOURCE: Resource = {
  uri: VIEWER_URI,
  name: 'brep-mcp viewer',
  description:
    'The interactive 3D viewer show_model opens: orbit the model, click an element to select it, and see what the agent selects.',
  mimeType: APP_MIME,
};

export function readViewerResource(uri: string): ReadResourceResult | undefined {
  if (uri !== VIEWER_URI) return undefined;
  if (!existsSync(VIEWER_APP)) {
    throw new Error('the viewer app is not built (npm run build in packages/brepjs-cad)');
  }
  return { contents: [{ uri, mimeType: APP_MIME, text: readFileSync(VIEWER_APP, 'utf8') }] };
}

const APP_ONLY = { ui: { resourceUri: VIEWER_URI, visibility: ['app'] } };

function ids(s: Session, a: Readonly<Record<string, unknown>>): string[] {
  const patterns = stringArray(a, 'ids', MAX_IDS);
  if (patterns === undefined || patterns.length === 0) throw new ArgError('"ids" is required');
  const picked = selectIds(s.build.summary.elements, patterns);
  if (picked.unmatched.length > 0) {
    throw new ArgError(`no element matches ${picked.unmatched.join(', ')}`);
  }
  return [...picked.ids];
}

/** Send the viewer state to the browser page, when show_model linked one. */
function pushScene(s: Session): void {
  s.viewer.fallback?.setScene(viewerScene(s.viewer));
}

function viewerView(s: Session): Record<string, unknown> {
  const v = s.viewer;
  return {
    sessionId: s.id,
    buildHash: s.build.buildHash,
    viewerOpen: v.seenAt !== undefined && Date.now() - v.seenAt.getTime() < 10_000,
    ...(v.fallback ? { url: v.fallback.url } : {}),
  };
}

export function viewerTools(sessions: SessionManager, uiHost: () => boolean): ToolDef[] {
  return [
    {
      name: 'show_model',
      title: 'Show model',
      description:
        "Open a session's current build in an interactive 3D viewer the user can orbit and click. Clients that support MCP Apps show it inline; others get a local URL to open in a browser. highlight and isolate take ids or globs (a container stands for what's under it), colorBy colors by category, storey or family. Clicking an element in the inline viewer selects it, and get_viewer_selection returns what the user picked; select_elements and show_elements change what either viewer shows, and a rebuild updates both. The browser page follows the agent but can't report clicks back.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          expectBuild: EXPECT_BUILD,
          highlight: { type: 'array', items: { type: 'string' } },
          isolate: { type: 'array', items: { type: 'string' } },
          colorBy: { type: 'string', enum: [...COLOR_BY] },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEWER_URI } },
      handler: async (a) => {
        const sessionId = requireString(a, 'sessionId');
        const highlight = stringArray(a, 'highlight', MAX_IDS);
        const isolate = stringArray(a, 'isolate', MAX_IDS);
        const colorBy = oneOf<ColorBy>(a, 'colorBy', COLOR_BY);
        const { session, buildHash, bytes } = await sessions.payload(sessionId, {
          timeoutMs: PAYLOAD_TIMEOUT_MS,
          expectBuild: optionalString(a, 'expectBuild'),
        });
        const plan = planStyle(session.build.summary.elements, { highlight, isolate, colorBy });
        const v = session.viewer;
        v.style = plan.style;
        v.frame = undefined;
        v.rev++;
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        if (!uiHost()) {
          if (v.fallback) v.fallback.update(buffer as ArrayBuffer);
          else v.fallback = await startPreviewServer(buffer as ArrayBuffer);
        }
        pushScene(session);
        const digest = {
          ...viewerView(session),
          buildHash,
          drawn: plan.drawn,
          ...(plan.legend.length > 0 ? { legend: plan.legend } : {}),
          ...(plan.unmatched.length > 0 ? { unmatched: plan.unmatched } : {}),
        };
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                uiHost() ? digest : { ...digest, note: 'open url in a browser to see the model' }
              ),
            },
          ],
          structuredContent: { sessionId: session.id, buildHash },
        };
      },
    },
    {
      name: 'select_elements',
      title: 'Select elements',
      description:
        'Select elements in the open viewer (shown in yellow), replacing its selection. Takes ids or globs; a container stands for what is under it. The viewer picks the change up within a couple of seconds.',
      inputSchema: {
        type: 'object',
        properties: { sessionId: SESSION_ID, ids: { type: 'array', items: { type: 'string' } } },
        required: ['sessionId', 'ids'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const s = sessions.get(requireString(a, 'sessionId'));
        const picked = ids(s, a);
        s.viewer.selection = picked;
        s.viewer.selectedAt = new Date();
        s.viewer.rev++;
        pushScene(s);
        return jsonResult({ ...viewerView(s), selected: picked.length });
      },
    },
    {
      name: 'show_elements',
      title: 'Show elements',
      description:
        "Frame the open viewer's camera on elements and select them. Takes ids or globs; a container stands for what is under it.",
      inputSchema: {
        type: 'object',
        properties: { sessionId: SESSION_ID, ids: { type: 'array', items: { type: 'string' } } },
        required: ['sessionId', 'ids'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const s = sessions.get(requireString(a, 'sessionId'));
        const picked = ids(s, a);
        s.viewer.selection = picked;
        s.viewer.selectedAt = new Date();
        s.viewer.frame = picked;
        s.viewer.frameSeq++;
        s.viewer.rev++;
        pushScene(s);
        return jsonResult({ ...viewerView(s), shown: picked.length });
      },
    },
    {
      name: 'get_viewer_selection',
      title: 'Get viewer selection',
      description:
        "What is selected in the session's viewer: the elements the user last clicked, or the agent last selected, by id (key path or GlobalId), with when it changed.",
      inputSchema: {
        type: 'object',
        properties: { sessionId: SESSION_ID },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const s = sessions.get(requireString(a, 'sessionId'));
        return jsonResult({
          ...viewerView(s),
          selection: s.viewer.selection,
          ...(s.viewer.selectedAt ? { selectedAt: s.viewer.selectedAt.toISOString() } : {}),
        });
      },
    },
    {
      name: 'viewer_payload',
      title: 'Viewer payload',
      description:
        "The viewer app's model: the session's current build as an encoded mesh payload.",
      inputSchema: {
        type: 'object',
        properties: { sessionId: SESSION_ID },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: APP_ONLY,
      handler: async (a) => {
        const { buildHash, bytes } = await sessions.payload(requireString(a, 'sessionId'), {
          timeoutMs: PAYLOAD_TIMEOUT_MS,
        });
        return {
          content: [{ type: 'text', text: Buffer.from(bytes).toString('base64') }],
          structuredContent: { buildHash, bytes: bytes.byteLength },
        };
      },
    },
    {
      name: 'viewer_sync',
      title: 'Viewer sync',
      description:
        "The viewer app's check-in: reports the user's selection when it changes, and returns the agent's latest selection, framing and style when rev is behind.",
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: SESSION_ID,
          rev: { type: 'number' },
          selection: { type: 'array', items: { type: 'string' } },
        },
        required: ['sessionId'],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: APP_ONLY,
      handler: (a) => {
        const s = sessions.get(requireString(a, 'sessionId'));
        const v = s.viewer;
        v.seenAt = new Date();
        const selection = stringArray(a, 'selection', MAX_IDS);
        if (selection !== undefined) {
          const known = selection.filter((id) => s.build.index.has(id));
          v.selection = known;
          v.selectedAt = new Date();
          v.rev++;
          pushScene(s);
        }
        const rev = optionalCount(a, 'rev');
        const behind = rev === undefined || rev !== v.rev;
        return {
          content: [{ type: 'text', text: JSON.stringify({ rev: v.rev }) }],
          structuredContent: {
            rev: v.rev,
            buildHash: s.build.buildHash,
            ...(behind
              ? {
                  selection: v.selection,
                  frameSeq: v.frameSeq,
                  ...(v.frame ? { frame: v.frame } : {}),
                  ...(v.style ? { style: v.style } : {}),
                }
              : {}),
          },
        };
      },
    },
  ];
}
