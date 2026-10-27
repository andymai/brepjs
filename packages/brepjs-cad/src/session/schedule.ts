import { canonicalJson, type ElementRecord, type ScalarRecord } from './records.js';
import type { QuantitiesById } from './quantities.js';

/** Fields every record answers, before its props, psets and quantities. */
export const BUILTIN_FIELDS = [
  'id',
  'name',
  'category',
  'family',
  'storey',
  'predefinedType',
  'volume',
] as const;

export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleError';
  }
}

function dig(root: unknown, path: readonly string[]): unknown {
  let cur = root;
  for (const seg of path) {
    if (Array.isArray(cur) && /^\d+$/.test(seg)) cur = cur[Number(seg)];
    else if (typeof cur === 'object' && cur !== null) cur = (cur as Record<string, unknown>)[seg];
    else return undefined;
  }
  return cur;
}

/** A set path is `SetName.Property`; set names may not contain dots, property names may. */
function inSets(sets: Readonly<Record<string, ScalarRecord>> | undefined, rest: string): unknown {
  const dot = rest.indexOf('.');
  if (dot < 0 || sets === undefined) return undefined;
  return sets[rest.slice(0, dot)]?.[rest.slice(dot + 1)];
}

/** One field of one element: a built-in, `props.<path>`, `psets.<Set>.<Prop>` or `quantities.<Set>.<Prop>`. */
export function fieldValue(
  rec: ElementRecord,
  field: string,
  quantities?: QuantitiesById
): unknown {
  switch (field) {
    case 'id':
      return rec.id;
    case 'name':
      return rec.name;
    case 'category':
      return rec.category;
    case 'family':
      return rec.type;
    case 'storey':
      return rec.storey ? (rec.storey.name ?? rec.storey.id) : undefined;
    case 'predefinedType':
      return rec.predefinedType;
    case 'volume':
      return rec.volume;
  }
  if (field.startsWith('props.')) return dig(rec.props, field.slice(6).split('.'));
  if (field.startsWith('psets.')) return inSets(rec.psets, field.slice(6));
  if (field.startsWith('quantities.'))
    return inSets(quantities?.[rec.id] ?? rec.quantities, field.slice(11));
  throw new ScheduleError(
    `unknown field '${field}': use ${BUILTIN_FIELDS.join(', ')}, or props.<path>, psets.<Set>.<Prop>, quantities.<Set>.<Prop>`
  );
}

export function usesQuantities(fields: readonly string[]): boolean {
  return fields.some((f) => f.startsWith('quantities.'));
}

export interface FieldInfo {
  readonly field: string;
  readonly type: 'number' | 'string' | 'boolean' | 'mixed';
  /** How many of the records have a value for it. */
  readonly count: number;
}

function typeOf(values: readonly unknown[]): FieldInfo['type'] {
  const kinds = new Set(values.map((v) => typeof v));
  if (kinds.size !== 1) return 'mixed';
  const [only] = kinds;
  return only === 'number' || only === 'string' || only === 'boolean' ? only : 'mixed';
}

function scalarLeaves(value: unknown, prefix: string, out: Map<string, unknown[]>): void {
  if (value === undefined || value === null) return;
  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      scalarLeaves(v, `${prefix}.${k}`, out);
    }
    return;
  }
  if (Array.isArray(value) || typeof value === 'object') return;
  out.set(prefix, [...(out.get(prefix) ?? []), value]);
}

/** Every field the records carry a value for, most widely held first. */
export function schedulableFields(
  records: readonly ElementRecord[],
  quantities?: QuantitiesById
): FieldInfo[] {
  const values = new Map<string, unknown[]>();
  for (const rec of records) {
    for (const f of BUILTIN_FIELDS) {
      const v = fieldValue(rec, f);
      if (v !== undefined) values.set(f, [...(values.get(f) ?? []), v]);
    }
    scalarLeaves(rec.props, 'props', values);
    for (const [set, props] of Object.entries(rec.psets ?? {}))
      scalarLeaves(props, `psets.${set}`, values);
    for (const [set, props] of Object.entries(quantities?.[rec.id] ?? rec.quantities ?? {})) {
      scalarLeaves(props, `quantities.${set}`, values);
    }
  }
  return [...values]
    .map(([field, vs]) => ({ field, type: typeOf(vs), count: vs.length }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
}

export interface ScheduleSpec {
  readonly fields: readonly string[];
  readonly groupBy?: readonly string[] | undefined;
  readonly sortBy?:
    readonly { readonly field: string; readonly descending?: boolean | undefined }[] | undefined;
}

export interface ScheduleResult {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
  /** Sums of the numeric columns over every matched element. */
  readonly totals: Readonly<Record<string, number>>;
}

/** A value as text: objects (arrays included) as JSON, primitives as themselves. */
function text(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' ? `${v}` : '';
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return 1;
  if (b === undefined || b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return text(a).localeCompare(text(b), undefined, { numeric: true });
}

/**
 * One row per element, or with `groupBy` one row per group: its key, a count, and the sum of each
 * other numeric field. Missing values are blank and sort last.
 */
export function runSchedule(
  records: readonly ElementRecord[],
  spec: ScheduleSpec,
  quantities?: QuantitiesById
): ScheduleResult {
  if (spec.fields.length === 0) throw new ScheduleError('"fields" must list at least one field');
  const value = (rec: ElementRecord, f: string) => fieldValue(rec, f, quantities);
  const totals: Record<string, number> = {};
  for (const f of spec.fields) {
    const nums = records.map((r) => value(r, f)).filter((v): v is number => typeof v === 'number');
    if (nums.length > 0) totals[f] = nums.reduce((s, n) => s + n, 0);
  }
  let columns: string[];
  let rows: unknown[][];
  const groupBy = spec.groupBy ?? [];
  if (groupBy.length > 0) {
    const summed = spec.fields.filter((f) => !groupBy.includes(f) && f in totals);
    const groups = new Map<string, { key: unknown[]; members: ElementRecord[] }>();
    for (const rec of records) {
      const key = groupBy.map((f) => value(rec, f) ?? null);
      const k = canonicalJson(key);
      const g = groups.get(k) ?? { key, members: [] };
      g.members.push(rec);
      groups.set(k, g);
    }
    columns = [...groupBy, 'count', ...summed.map((f) => `sum(${f})`)];
    rows = [...groups.values()].map((g) => [
      ...g.key,
      g.members.length,
      ...summed.map((f) =>
        g.members.reduce((s, r) => {
          const v = value(r, f);
          return typeof v === 'number' ? s + v : s;
        }, 0)
      ),
    ]);
  } else {
    columns = [...spec.fields];
    rows = records.map((r) => spec.fields.map((f) => value(r, f) ?? null));
  }
  for (const s of [...(spec.sortBy ?? [])].reverse()) {
    const i = columns.indexOf(s.field);
    if (i < 0)
      throw new ScheduleError(`sortBy field '${s.field}' is not a column (${columns.join(', ')})`);
    rows.sort((a, b) => (s.descending ? -1 : 1) * compare(a[i], b[i]));
  }
  return { columns, rows, totals };
}

function csvCell(v: unknown): string {
  if (v === undefined || v === null) return '';
  const s = text(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [columns, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}
