#!/usr/bin/env node
/**
 * brepjs-verify MCP server (stdio).
 *
 * Exposes the verify substrate to MCP-capable agents. The first tool, `run_program`, executes an
 * agent-authored brepjs program in the sandbox and returns the verification report — the closed
 * "build → verify" step the agent loop is built on. Uses the SDK's low-level `Server` with plain
 * JSON-Schema tool definitions (no direct zod dependency in this package).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { RUN_PROGRAM_INPUT_SCHEMA, runProgramTool } from './tools.js';

const server = new Server(
  { name: 'brepjs-verify', version: '0.7.1' },
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === 'run_program') {
    // Arguments arrive untyped over the protocol — validate before handing them to the tool.
    const a = req.params.arguments ?? {};
    const code = typeof a['code'] === 'string' ? a['code'] : '';
    const timeoutMs = typeof a['timeoutMs'] === 'number' ? a['timeoutMs'] : undefined;
    return runProgramTool({ code, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });
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
