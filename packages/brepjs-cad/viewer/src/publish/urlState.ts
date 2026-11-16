import type { ParamDefs, ParamInput, ParamValue } from './protocol.js';

/** The declared parameters that the query string sets. Values stay strings: the part converts them. */
export function readInput(search: string, defs: ParamDefs): Record<string, string> {
  const query = new URLSearchParams(search);
  const input: Record<string, string> = {};
  for (const name of Object.keys(defs)) {
    const value = query.get(name);
    if (value !== null) input[name] = value;
  }
  return input;
}

/**
 * The query string for `values`: one key for each parameter that differs from its default, with
 * the keys that are not parameters left as they are.
 */
export function writeSearch(search: string, defs: ParamDefs, values: ParamInput): string {
  const query = new URLSearchParams(search);
  for (const [name, def] of Object.entries(defs)) {
    const value: ParamValue | undefined = values[name];
    if (value === undefined || value === def.default) query.delete(name);
    else query.set(name, String(value));
  }
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}

export function defaultsOf(defs: ParamDefs): Record<string, ParamValue> {
  return Object.fromEntries(Object.entries(defs).map(([name, def]) => [name, def.default]));
}
