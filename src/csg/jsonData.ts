// Extension data enters the structural hash, so it must have exactly one
// content address: only values JSON round-trips exactly are accepted, object
// keys are sorted, and the copy is frozen so neither the caller nor an
// extension evaluator can desync it from the pre-computed hash.
import { ok, err, type Result } from '@/core/result.js';
import { fnvMixByte, fnvMixInt32, fnvMixNumber, fnvMixText } from './hash.js';
import type { JsonValue } from './types.js';

/** Validate `value` as JSON-safe and return its canonical frozen copy, or a
 *  message naming the first offending path (rooted at `path`). */
export function canonicalJson(value: unknown, path: string): Result<JsonValue, string> {
  return copyJson(value, path, new Set());
}

function copyJson(v: unknown, path: string, ancestors: Set<object>): Result<JsonValue, string> {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return ok(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return err(`${path}: ${String(v)} is not JSON-safe`);
    return ok(v === 0 ? 0 : v);
  }
  if (typeof v !== 'object') return err(`${path}: ${typeof v} is not JSON-safe`);
  if (ancestors.has(v)) return err(`${path}: circular reference is not JSON-safe`);
  ancestors.add(v);
  const out = Array.isArray(v) ? copyArray(v, path, ancestors) : copyObject(v, path, ancestors);
  ancestors.delete(v);
  return out;
}

function copyArray(
  v: readonly unknown[],
  path: string,
  ancestors: Set<object>
): Result<JsonValue, string> {
  const out: JsonValue[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = copyJson(v[i], `${path}[${i}]`, ancestors);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(Object.freeze(out));
}

function copyObject(v: object, path: string, ancestors: Set<object>): Result<JsonValue, string> {
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) {
    const ctor: unknown = (v as { constructor?: unknown }).constructor;
    const what = typeof ctor === 'function' && ctor.name ? `${ctor.name} instance` : 'object';
    return err(`${path}: ${what} is not JSON-safe (use a plain object)`);
  }
  const record = v as Readonly<Record<string, unknown>>;
  const entries: [string, JsonValue][] = [];
  for (const key of Object.keys(record).sort()) {
    const r = copyJson(record[key], `${path}.${key}`, ancestors);
    if (!r.ok) return r;
    entries.push([key, r.value]);
  }
  // fromEntries defines own properties, so a `__proto__` key stays data.
  return ok(Object.freeze(Object.fromEntries(entries)));
}

const TAG_NULL = 0;
const TAG_FALSE = 1;
const TAG_TRUE = 2;
const TAG_NUMBER = 3;
const TAG_STRING = 4;
const TAG_ARRAY = 5;
const TAG_OBJECT = 6;

/** Type-tagged, length-prefixed Merkle mix of a JSON value; object keys are
 *  hashed in sorted order, so key order never changes the result. */
export function hashJson(h: bigint, v: JsonValue): bigint {
  if (v === null) return fnvMixByte(h, TAG_NULL);
  if (typeof v === 'boolean') return fnvMixByte(h, v ? TAG_TRUE : TAG_FALSE);
  if (typeof v === 'number') return fnvMixNumber(fnvMixByte(h, TAG_NUMBER), v);
  if (typeof v === 'string') return fnvMixText(fnvMixByte(h, TAG_STRING), v);
  if (isJsonArray(v)) {
    let r = fnvMixInt32(fnvMixByte(h, TAG_ARRAY), v.length);
    for (const item of v) r = hashJson(r, item);
    return r;
  }
  const keys = Object.keys(v).sort();
  let r = fnvMixInt32(fnvMixByte(h, TAG_OBJECT), keys.length);
  for (const key of keys) {
    r = fnvMixText(r, key);
    r = hashJson(r, v[key] ?? null);
  }
  return r;
}

// Array.isArray does not narrow a readonly array out of a union.
function isJsonArray(v: JsonValue): v is readonly JsonValue[] {
  return Array.isArray(v);
}
