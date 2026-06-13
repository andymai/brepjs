#!/usr/bin/env node
/**
 * brepjs-verify MCP server (stdio).
 *
 * Exposes the verify substrate to MCP-capable agents. The first tool, `run_program`, executes an
 * agent-authored brepjs program in the sandbox and returns the verification report — the closed
 * "build → verify" step the agent loop is built on. Uses the SDK's low-level `Server` with plain
 * JSON-Schema tool definitions (no direct zod dependency in this package).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  EXPORT_PART_INPUT_SCHEMA,
  RUN_PROGRAM_INPUT_SCHEMA,
  exportPartTool,
  runProgramTool,
  type ExportPartToolArgs,
} from './tools.js';

// Read the version from package.json at runtime so it tracks the package (this module sits two
// levels below the package root in both src/ and dist/). NB: don't use
// `new URL('../../package.json', import.meta.url)` — vite inlines that as a data: URL that
// readFileSync can't read; resolve via fileURLToPath + join instead.
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

const server = new Server(
  { name: 'brepjs-verify', version: pkg.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'run_program',
      description:
        'Execute an agent-authored brepjs program in an isolated sandbox and return the verification report (validity, measurements, topology). Use this to build a part and check it in one step.',
      inputSchema: RUN_PROGRAM_INPUT_SCHEMA,
    },
    {
      name: 'export_part',
      description:
        'Build a brepjs part in the sandbox and export it to a directory (STEP/GLB/STL). Use this to hand off the final artifact once a part verifies.',
      inputSchema: EXPORT_PART_INPUT_SCHEMA,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'run_program') {
    // Arguments arrive untyped over the protocol — validate before handing them to the tool.
    const a = req.params.arguments ?? {};
    const code = typeof a['code'] === 'string' ? a['code'] : '';
    const timeoutMs =
      typeof a['timeoutMs'] === 'number' && a['timeoutMs'] > 0 ? a['timeoutMs'] : undefined;
    return runProgramTool({ code, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });
  }
  if (req.params.name === 'export_part') {
    const a = req.params.arguments ?? {};
    const code = typeof a['code'] === 'string' ? a['code'] : '';
    const outDir = typeof a['outDir'] === 'string' ? a['outDir'] : '';
    const timeoutMs =
      typeof a['timeoutMs'] === 'number' && a['timeoutMs'] > 0 ? a['timeoutMs'] : undefined;
    const f =
      typeof a['formats'] === 'object' && a['formats'] !== null
        ? (a['formats'] as Record<string, unknown>)
        : undefined;
    // Collapse an empty / all-false formats object to undefined so exportProgram's "all" default
    // applies, rather than spawning with no flags (which the CLI rejects).
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
  }
  throw new Error(`Unknown tool: ${req.params.name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error('brepjs-verify MCP server failed to start:', err);
  process.exit(1);
});
