import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { QueryError } from '../session/query.js';
import { errorMessage } from '../session/records.js';
import { SessionError, SessionManager, type SessionManagerOptions } from '../session/sessions.js';
import { ArgError, errorResult, listTools, type ToolArgs, type ToolDef } from './registry.js';
import {
  listSessionResources,
  readSessionResource,
  SESSION_RESOURCE_TEMPLATES,
  sessionTools,
} from './sessionTools.js';
import {
  EXPORT_PART_INPUT_SCHEMA,
  RUN_PROGRAM_INPUT_SCHEMA,
  exportPartTool,
  runProgramTool,
  type ExportPartToolArgs,
} from './tools.js';

function positiveTimeout(a: ToolArgs): number | undefined {
  const t = a['timeoutMs'];
  return typeof t === 'number' && t > 0 ? t : undefined;
}

function partTools(): ToolDef[] {
  return [
    {
      name: 'run_program',
      title: 'Run program',
      description:
        'Execute an agent-authored brepjs program in an isolated sandbox and return the verification report (validity, measurements, topology). Use this to build a part and check it in one step.',
      inputSchema: RUN_PROGRAM_INPUT_SCHEMA,
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const code = typeof a['code'] === 'string' ? a['code'] : '';
        const timeoutMs = positiveTimeout(a);
        return runProgramTool({ code, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });
      },
    },
    {
      name: 'export_part',
      title: 'Export part',
      description:
        'Build a brepjs part in the sandbox and export it to a directory (STEP/GLB/STL). Use this to hand off the final artifact once a part verifies.',
      inputSchema: EXPORT_PART_INPUT_SCHEMA,
      // Writes into outDir and replaces same-named artifacts there.
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      handler: (a) => {
        const code = typeof a['code'] === 'string' ? a['code'] : '';
        const outDir = typeof a['outDir'] === 'string' ? a['outDir'] : '';
        const timeoutMs = positiveTimeout(a);
        const f =
          typeof a['formats'] === 'object' && a['formats'] !== null
            ? (a['formats'] as Record<string, unknown>)
            : undefined;
        // Collapse an empty / all-false formats object to undefined so exportProgram's "all"
        // default applies, rather than spawning with no flags (which the CLI rejects).
        const formats =
          f && (f['step'] === true || f['glb'] === true || f['stl'] === true)
            ? {
                ...(f['step'] === true ? { step: true } : {}),
                ...(f['glb'] === true ? { glb: true } : {}),
                ...(f['stl'] === true ? { stl: true } : {}),
              }
            : undefined;
        const toolArgs: ExportPartToolArgs = {
          code,
          outDir,
          ...(formats !== undefined ? { formats } : {}),
          ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        };
        return exportPartTool(toolArgs);
      },
    },
  ];
}

async function callTool(tool: ToolDef, args: ToolArgs): Promise<CallToolResult> {
  try {
    return await tool.handler(args);
  } catch (e) {
    if (e instanceof SessionError) return errorResult(e.code, e.message, e.detail);
    if (e instanceof ArgError || e instanceof QueryError)
      return errorResult('INVALID_ARGUMENT', e.message);
    return errorResult('INTERNAL_ERROR', errorMessage(e));
  }
}

export interface BrepMcpServer {
  readonly server: Server;
  readonly sessions: SessionManager;
  readonly tools: readonly ToolDef[];
}

export function createBrepMcpServer(
  version: string,
  sessionOptions: Omit<SessionManagerOptions, 'onChange'> = {}
): BrepMcpServer {
  const server = new Server(
    { name: 'brepjs-cad', version },
    { capabilities: { tools: {}, resources: { listChanged: true } } }
  );
  const sessions = new SessionManager({
    ...sessionOptions,
    onChange: () => {
      // Not connected yet, or the client went away: nothing to notify.
      server.sendResourceListChanged().catch(() => {});
    },
  });
  const tools = [...partTools(), ...sessionTools(sessions)];
  const byName = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: listTools(tools) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (tool === undefined)
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${req.params.name}`);
    return callTool(tool, req.params.arguments ?? {});
  });

  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: listSessionResources(sessions),
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({
    resourceTemplates: SESSION_RESOURCE_TEMPLATES,
  }));
  server.setRequestHandler(ReadResourceRequestSchema, (req) => {
    let result;
    try {
      result = readSessionResource(sessions, req.params.uri);
    } catch (e) {
      throw new McpError(ErrorCode.InvalidParams, errorMessage(e));
    }
    if (result === undefined)
      throw new McpError(ErrorCode.InvalidParams, `Unknown resource: ${req.params.uri}`);
    return result;
  });

  return { server, sessions, tools };
}
