/**
 * Table-driven tool registry: each tool is a name, a description, a JSON Schema, MCP annotations,
 * and a handler. Plain JSON Schema keeps the package free of a direct zod dependency, so arguments
 * are validated by the small readers below.
 */

import type { CallToolResult, Tool, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';

export type ToolArgs = Readonly<Record<string, unknown>>;

export interface ToolDef {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Tool['inputSchema'];
  readonly annotations: ToolAnnotations;
  /** Tool metadata, such as the MCP Apps `ui` link to a viewer resource. */
  readonly _meta?: Record<string, unknown> | undefined;
  readonly handler: (args: ToolArgs) => CallToolResult | Promise<CallToolResult>;
}

/** A tool only an MCP App calls: its `ui.visibility` leaves out the model. */
export function isAppOnly(t: ToolDef): boolean {
  const ui = t._meta?.['ui'] as { visibility?: readonly string[] } | undefined;
  return ui?.visibility !== undefined && !ui.visibility.includes('model');
}

/** A bad argument: reported to the agent as a tool error, not a protocol error. */
export class ArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArgError';
  }
}

export function requireString(a: ToolArgs, key: string): string {
  const v = a[key];
  if (typeof v !== 'string' || v.trim() === '')
    throw new ArgError(`"${key}" must be a non-empty string`);
  return v;
}

export function optionalString(a: ToolArgs, key: string): string | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new ArgError(`"${key}" must be a string`);
  return v;
}

export function optionalBoolean(a: ToolArgs, key: string): boolean | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new ArgError(`"${key}" must be a boolean`);
  return v;
}

/** A positive finite number, clamped to `max`. */
export function optionalPositive(a: ToolArgs, key: string, max: number): number | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new ArgError(`"${key}" must be a positive number`);
  }
  return Math.min(v, max);
}

export function optionalCount(a: ToolArgs, key: string): number | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new ArgError(`"${key}" must be a non-negative integer`);
  }
  return v;
}

export function stringArray(a: ToolArgs, key: string, max: number): string[] | undefined {
  const v = a[key];
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) {
    throw new ArgError(`"${key}" must be an array of strings`);
  }
  if (v.length > max) throw new ArgError(`"${key}" takes at most ${max} entries`);
  return v;
}

export function jsonResult(payload: unknown, isError = false): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function errorResult(
  code: string,
  message: string,
  detail: Readonly<Record<string, unknown>> = {}
): CallToolResult {
  return jsonResult({ error: code, message, ...detail }, true);
}

export function listTools(tools: readonly ToolDef[]): Tool[] {
  return tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { title: t.title, ...t.annotations },
    ...(t._meta ? { _meta: t._meta } : {}),
  }));
}
