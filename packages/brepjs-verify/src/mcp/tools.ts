/**
 * MCP tool handlers — pure functions mapping tool arguments to MCP results. Kept separate from the
 * server wiring (`server.ts`) so the agent-facing behaviour is unit-testable without a transport.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runProgram } from '../sandbox/runProgram.js';
import { appendRunRecord, buildRunRecord } from '../sandbox/runRecord.js';

export interface RunProgramToolArgs {
  /** A brepjs `.brep.ts` module source with a default-exported part function. */
  code: string;
  /** Optional wall-clock budget in ms (default 30000). */
  timeoutMs?: number;
}

/** JSON Schema for `run_program` input (the low-level Server API takes plain JSON Schema). */
export const RUN_PROGRAM_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    code: {
      type: 'string',
      description: 'A brepjs .brep.ts module with a default-exported part function.',
    },
    timeoutMs: {
      type: 'number',
      description: 'Optional wall-clock budget in milliseconds (default 30000).',
    },
  },
  required: ['code'],
};

/**
 * Execute an agent-authored brepjs program in the sandbox and return its verification report.
 * `isError` is set when the part failed checks, timed out, or crashed — so the agent can branch.
 */
export async function runProgramTool(args: RunProgramToolArgs): Promise<CallToolResult> {
  if (!args.code || !args.code.trim()) {
    return {
      content: [{ type: 'text', text: 'run_program requires a non-empty "code" string.' }],
      isError: true,
    };
  }

  const result = await runProgram(
    args.code,
    args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}
  );

  // Optional provenance: when BREPJS_RUN_RECORD_PATH is set, append one JSONL record per run.
  // Best-effort — a recording failure must never affect the tool result the agent sees.
  const recordPath = process.env['BREPJS_RUN_RECORD_PATH'];
  if (recordPath) {
    // Fire-and-forget: provenance is a side channel and must never block (or fail) the agent
    // response on disk I/O. A misconfigured path is surfaced on stderr (separate from the stdio
    // JSON-RPC channel) without touching the tool result.
    void appendRunRecord(recordPath, buildRunRecord(args.code, result)).catch((err: unknown) => {
      console.warn(`run-record append failed (BREPJS_RUN_RECORD_PATH=${recordPath}):`, err);
    });
  }

  if (result.outcome === 'completed') {
    const payload = { outcome: 'completed', ok: result.report.ok, report: result.report };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      isError: !result.report.ok,
    };
  }

  // timeout / crashed — surface the typed outcome so the agent can react (simplify, retry, escalate).
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: true,
  };
}
