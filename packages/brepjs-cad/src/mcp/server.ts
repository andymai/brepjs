#!/usr/bin/env node
/**
 * brepjs-cad MCP server (stdio).
 *
 * Exposes the verify substrate to MCP-capable agents: `run_program` and `export_part` build and
 * check single parts, and the session tools open a BIM model (a brepjs-families program or an IFC
 * file) to query, rebuild after edits, and diff. Tools, resources and their wiring live in
 * `createServer.ts`; this entry only connects stdio.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBrepMcpServer } from './createServer.js';
import { installSandboxShutdownHandlers } from '../sandbox/runProgram.js';

// Reap any in-flight sandbox process groups (part runs and session workers) if this server is
// stopped, so a runaway build can't outlive the server and burn a core indefinitely.
installSandboxShutdownHandlers();

// Read the version from package.json at runtime so it tracks the package (this module sits two
// levels below the package root in both src/ and dist/). NB: don't use
// `new URL('../../package.json', import.meta.url)` — vite inlines that as a data: URL that
// readFileSync can't read; resolve via fileURLToPath + join instead.
const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };

const { server, sessions } = createBrepMcpServer(pkg.version);

async function main(): Promise<void> {
  // The client closing stdin is the end of the session: stop every model worker with it.
  process.stdin.once('end', () => {
    sessions.closeAll();
    void server.close();
  });
  await server.connect(new StdioServerTransport());
}

main().catch((err: unknown) => {
  console.error('brepjs-cad MCP server failed to start:', err);
  process.exit(1);
});
