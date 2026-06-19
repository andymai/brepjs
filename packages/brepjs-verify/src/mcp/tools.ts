/**
 * MCP tool handlers — pure functions mapping tool arguments to MCP results. Kept separate from the
 * server wiring (`server.ts`) so the agent-facing behaviour is unit-testable without a transport.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { runProgram, exportProgram, type ExportFormats } from '../sandbox/runProgram.js';
import { appendRunRecord, buildRunRecord } from '../sandbox/runRecord.js';
import { traceRun } from './telemetry.js';

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

  // Optional Langfuse trace of this run — best-effort, no-op without LANGFUSE_* keys (see
  // mcp/telemetry.ts). Fire-and-forget like the run-record above, so telemetry never blocks or
  // affects the agent's tool result. traceRun swallows its own errors and never throws.
  void traceRun(args.code, result);

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

export interface ExportPartToolArgs {
  /** A brepjs `.brep.ts` module source with a default-exported part function. */
  code: string;
  /** Directory to write artifacts into (the caller owns it; artifacts persist there). */
  outDir: string;
  /** Which formats to write (default: all of STEP/GLB/STL). */
  formats?: ExportFormats;
  timeoutMs?: number;
}

/** JSON Schema for `export_part` input. */
export const EXPORT_PART_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    code: {
      type: 'string',
      description: 'A brepjs .brep.ts module with a default-exported part function.',
    },
    outDir: { type: 'string', description: 'Directory to write artifacts into.' },
    formats: {
      type: 'object',
      description: 'Which artifacts to write; omit for all.',
      properties: {
        step: { type: 'boolean' },
        glb: { type: 'boolean' },
        stl: { type: 'boolean' },
      },
    },
    timeoutMs: { type: 'number', description: 'Optional wall-clock budget in ms (default 30000).' },
  },
  required: ['code', 'outDir'],
};

/**
 * Build a part in the sandbox and export it to `outDir` (STEP/GLB/STL). Returns the written paths;
 * `isError` is set when the export produced no valid solid, timed out, or crashed. The artifacts
 * persist in `outDir` for the agent to hand off.
 */
export async function exportPartTool(args: ExportPartToolArgs): Promise<CallToolResult> {
  if (!args.code || !args.code.trim()) {
    return {
      content: [{ type: 'text', text: 'export_part requires a non-empty "code" string.' }],
      isError: true,
    };
  }
  if (!args.outDir || !args.outDir.trim()) {
    return {
      content: [{ type: 'text', text: 'export_part requires an "outDir" string.' }],
      isError: true,
    };
  }

  const result = await exportProgram(
    args.code,
    args.outDir,
    args.formats,
    args.timeoutMs !== undefined ? { timeoutMs: args.timeoutMs } : {}
  );

  if (result.outcome === 'completed') {
    const payload = { outcome: 'completed', ok: result.ok, written: result.written, errors: result.errors };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      isError: !result.ok,
    };
  }

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: true,
  };
}
