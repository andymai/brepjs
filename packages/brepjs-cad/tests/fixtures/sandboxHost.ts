/**
 * Test host for the sandbox shutdown reaper (Mode B: host-death).
 *
 * Starts a long-budget runaway sandbox run — so the per-run timeout will NOT fire during the test —
 * and installs the same shutdown handlers the MCP server uses. The runaway records its leaf pid (the
 * `node` process actually executing the part) to the file given as argv[2] before spinning. A test
 * SIGTERMs this process and asserts the leaf is reaped rather than orphaned.
 */
import { fileURLToPath } from 'node:url';
import { installSandboxShutdownHandlers, runProgram } from '../../src/sandbox/runProgram.js';

const pidFile = process.argv[2];
if (!pidFile) process.exit(2);

installSandboxShutdownHandlers();

const tsEntry = fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));
const runaway = [
  `import { writeFileSync } from 'node:fs';`,
  `export default () => {`,
  `  writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`,
  `  // eslint-disable-next-line`,
  `  while (true) {}`,
  `};`,
  ``,
].join('\n');

// Fire-and-forget with a long budget: we are exercising shutdown reaping, not the per-run timeout.
void runProgram(runaway, { timeoutMs: 120000, cliEntry: tsEntry });

// Keep the host alive until the test terminates it.
setInterval(() => undefined, 1 << 30);
