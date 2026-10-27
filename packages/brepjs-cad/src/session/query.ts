import { canonicalJson, setProperty, type Bounds, type ElementRecord } from './records.js';

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

export const PREDICATE_OPS = [
  'exists',
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'in',
] as const;
export type PredicateOp = (typeof PREDICATE_OPS)[number];

export interface Predicate {
  readonly path: string;
  readonly op: PredicateOp;
  readonly value?: unknown;
}

export interface Where {
  readonly category?: readonly string[] | undefined;
  readonly family?: readonly string[] | undefined;
  readonly storey?: string | undefined;
  readonly name?: string | undefined;
  readonly id?: string | undefined;
  readonly props?: readonly Predicate[] | undefined;
  readonly psets?: readonly Predicate[] | undefined;
  readonly bounds?:
    | {
        readonly min?: readonly [number, number, number] | undefined;
        readonly max?: readonly [number, number, number] | undefined;
        readonly mode: 'intersects' | 'within';
      }
    | undefined;
  readonly hasGeometry?: boolean | undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringList(v: unknown, key: string): readonly string[] | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string') return [v];
  if (Array.isArray(v) && v.every((s) => typeof s === 'string')) return v;
  throw new QueryError(`where.${key} must be a string or an array of strings`);
}

function optString(v: unknown, key: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string') return v;
  throw new QueryError(`where.${key} must be a string`);
}

function vec3(v: unknown, key: string): readonly [number, number, number] | undefined {
  if (v === undefined) return undefined;
  if (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    return [v[0] as number, v[1] as number, v[2] as number];
  }
  throw new QueryError(`where.bounds.${key} must be [x, y, z]`);
}

function predicates(v: unknown, key: string): readonly Predicate[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) throw new QueryError(`where.${key} must be an array of predicates`);
  return v.map((p, i) => {
    if (!isRecord(p) || typeof p['path'] !== 'string' || p['path'] === '') {
      throw new QueryError(`where.${key}[${i}].path must be a non-empty string`);
    }
    const rawOp = p['op'] ?? (p['value'] === undefined ? 'exists' : 'eq');
    if (typeof rawOp !== 'string' || !PREDICATE_OPS.includes(rawOp as PredicateOp)) {
      throw new QueryError(`where.${key}[${i}].op must be one of ${PREDICATE_OPS.join(', ')}`);
    }
    const op = rawOp as PredicateOp;
    if (op !== 'exists' && p['value'] === undefined) {
      throw new QueryError(`where.${key}[${i}] needs a value for op '${op}'`);
    }
    if (op === 'in' && !Array.isArray(p['value'])) {
      throw new QueryError(`where.${key}[${i}].value must be an array for op 'in'`);
    }
    return { path: p['path'], op, ...('value' in p ? { value: p['value'] } : {}) };
  });
}

/** Validate an untyped `where` argument. */
export function parseWhere(raw: unknown): Where {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw new QueryError('where must be an object');
  const known = new Set([
    'category',
    'family',
    'storey',
    'name',
    'id',
    'props',
    'psets',
    'bounds',
    'hasGeometry',
  ]);
  for (const k of Object.keys(raw)) {
    if (!known.has(k))
      throw new QueryError(`unknown where.${k} (expected one of ${[...known].join(', ')})`);
  }
  let bounds: Where['bounds'];
  if (raw['bounds'] !== undefined) {
    const b = raw['bounds'];
    if (!isRecord(b)) throw new QueryError('where.bounds must be an object');
    const mode = b['mode'] ?? 'intersects';
    if (mode !== 'intersects' && mode !== 'within') {
      throw new QueryError("where.bounds.mode must be 'intersects' or 'within'");
    }
    bounds = { min: vec3(b['min'], 'min'), max: vec3(b['max'], 'max'), mode };
  }
  const hasGeometry = raw['hasGeometry'];
  if (hasGeometry !== undefined && typeof hasGeometry !== 'boolean') {
    throw new QueryError('where.hasGeometry must be a boolean');
  }
  return {
    category: stringList(raw['category'], 'category'),
    family: stringList(raw['family'], 'family'),
    storey: optString(raw['storey'], 'storey'),
    name: optString(raw['name'], 'name'),
    id: optString(raw['id'], 'id'),
    props: predicates(raw['props'], 'props'),
    psets: predicates(raw['psets'], 'psets'),
    bounds,
    hasGeometry,
  };
}

const MAX_GLOB_LENGTH = 512;

type GlobToken =
  { readonly kind: 'char'; readonly c: string } | { readonly kind: '?' | '*' | '**' };

/**
 * Glob test where `*` and `?` stay inside one key-path segment and `**` crosses segments. It
 * tracks the set of reachable text positions token by token, so the work is bounded by pattern
 * length times text length: no backtracking, whatever the pattern.
 */
export function globMatcher(glob: string, ignoreCase = false): (text: string) => boolean {
  if (glob.length > MAX_GLOB_LENGTH) {
    throw new QueryError(`globs are limited to ${MAX_GLOB_LENGTH} characters`);
  }
  // Lowercasing can change length (İ becomes two characters), so the pattern is folded whole, like
  // the text. Final sigma is the one context-dependent lowercase mapping; folding ς to σ makes the
  // result depend on the character alone, so ΟΣ* and ΟΣΑ fold to the same prefix.
  const fold = (x: string) => (ignoreCase ? x.toLowerCase().replaceAll('ς', 'σ') : x);
  const source = fold(glob);
  const tokens: GlobToken[] = [];
  for (let i = 0; i < source.length; i++) {
    const c = source[i] as string;
    if (c === '*' && source[i + 1] === '*') {
      tokens.push({ kind: '**' });
      i++;
    } else if (c === '*' || c === '?') tokens.push({ kind: c });
    else tokens.push({ kind: 'char', c });
  }
  return (raw) => {
    const text = fold(raw);
    const n = text.length;
    let cur: boolean[] = Array.from({ length: n + 1 }, (_, i) => i === 0);
    for (const t of tokens) {
      const next: boolean[] = new Array<boolean>(n + 1).fill(false);
      if (t.kind === 'char' || t.kind === '?') {
        for (let i = 0; i < n; i++) {
          if (!cur[i]) continue;
          const ch = text[i];
          if (t.kind === 'char' ? ch === t.c : ch !== '/') next[i + 1] = true;
        }
      } else {
        let open = false;
        for (let i = 0; i <= n; i++) {
          if (cur[i]) open = true;
          next[i] = open;
          if (t.kind === '*' && text[i] === '/') open = false;
        }
      }
      cur = next;
    }
    return cur[n] === true;
  };
}

function lookupPath(root: unknown, path: readonly string[]): unknown {
  let cur = root;
  for (const seg of path) {
    if (Array.isArray(cur) && /^\d+$/.test(seg)) cur = cur[Number(seg)];
    else if (isRecord(cur)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}

function psetValue(rec: ElementRecord, path: string): unknown {
  return (
    rec.psets?.[path] ??
    rec.quantities?.[path] ??
    setProperty(rec.psets, path) ??
    setProperty(rec.quantities, path)
  );
}

function test(actual: unknown, p: Predicate): boolean {
  switch (p.op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'eq':
      return canonicalJson(actual) === canonicalJson(p.value);
    case 'ne':
      return canonicalJson(actual) !== canonicalJson(p.value);
    case 'gt':
      return typeof actual === 'number' && typeof p.value === 'number' && actual > p.value;
    case 'gte':
      return typeof actual === 'number' && typeof p.value === 'number' && actual >= p.value;
    case 'lt':
      return typeof actual === 'number' && typeof p.value === 'number' && actual < p.value;
    case 'lte':
      return typeof actual === 'number' && typeof p.value === 'number' && actual <= p.value;
    case 'contains':
      if (typeof actual === 'string' && typeof p.value === 'string') {
        return actual.toLowerCase().includes(p.value.toLowerCase());
      }
      return (
        Array.isArray(actual) && actual.some((a) => canonicalJson(a) === canonicalJson(p.value))
      );
    case 'in':
      return (
        Array.isArray(p.value) && p.value.some((v) => canonicalJson(v) === canonicalJson(actual))
      );
  }
}

function boundsMatch(b: Bounds | undefined, q: NonNullable<Where['bounds']>): boolean {
  if (b === undefined) return false;
  const lo = q.min ?? [-Infinity, -Infinity, -Infinity];
  const hi = q.max ?? [Infinity, Infinity, Infinity];
  if (q.mode === 'within') {
    return (
      b.xMin >= lo[0] &&
      b.yMin >= lo[1] &&
      b.zMin >= lo[2] &&
      b.xMax <= hi[0] &&
      b.yMax <= hi[1] &&
      b.zMax <= hi[2]
    );
  }
  return (
    b.xMax >= lo[0] &&
    b.yMax >= lo[1] &&
    b.zMax >= lo[2] &&
    b.xMin <= hi[0] &&
    b.yMin <= hi[1] &&
    b.zMin <= hi[2]
  );
}

/** Compile a `where` into a record predicate. */
export function matcher(where: Where): (rec: ElementRecord) => boolean {
  const lower = (xs: readonly string[] | undefined) =>
    xs ? new Set(xs.map((x) => x.toLowerCase())) : undefined;
  const categories = lower(where.category);
  const families = lower(where.family);
  const idGlob = where.id !== undefined ? globMatcher(where.id) : undefined;
  const nameGlob = where.name !== undefined ? globMatcher(where.name, true) : undefined;
  const storeyGlob = where.storey !== undefined ? globMatcher(where.storey, true) : undefined;
  return (rec) => {
    if (categories && !categories.has(rec.category.toLowerCase())) return false;
    if (families && !families.has(rec.type.toLowerCase())) return false;
    if (idGlob && !idGlob(rec.id)) return false;
    if (nameGlob && !(rec.name !== undefined && nameGlob(rec.name))) return false;
    if (storeyGlob) {
      const s = rec.storey;
      if (!s || !(s.id === where.storey || (s.name !== undefined && storeyGlob(s.name))))
        return false;
    }
    if (where.hasGeometry !== undefined && rec.hasGeometry !== where.hasGeometry) return false;
    if (where.bounds && !boundsMatch(rec.bounds, where.bounds)) return false;
    for (const p of where.props ?? []) {
      if (!test(lookupPath(rec.props, p.path.split('.')), p)) return false;
    }
    for (const p of where.psets ?? []) {
      if (!test(psetValue(rec, p.path), p)) return false;
    }
    return true;
  };
}

export interface Breakdown {
  readonly category: Readonly<Record<string, number>>;
  readonly storey: Readonly<Record<string, number>>;
  readonly family: Readonly<Record<string, number>>;
}

const NO_STOREY = '(none)';

export function breakdown(records: readonly ElementRecord[]): Breakdown {
  const category: Record<string, number> = {};
  const storey: Record<string, number> = {};
  const family: Record<string, number> = {};
  for (const r of records) {
    category[r.category] = (category[r.category] ?? 0) + 1;
    const s = r.storey ? (r.storey.name ?? r.storey.id) : NO_STOREY;
    storey[s] = (storey[s] ?? 0) + 1;
    family[r.type] = (family[r.type] ?? 0) + 1;
  }
  return { category, storey, family };
}

export const FIELD_GROUPS = [
  'props',
  'psets',
  'quantities',
  'material',
  'classification',
  'relationships',
  'children',
  'geometry',
] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

/** Identity always; the named groups on request (all by default). */
export function project(
  rec: ElementRecord,
  fields: ReadonlySet<FieldGroup>
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: rec.id,
    ...(rec.keyPath !== undefined && rec.keyPath !== rec.id ? { keyPath: rec.keyPath } : {}),
    ...(rec.guid !== undefined && rec.guid !== rec.id ? { guid: rec.guid } : {}),
    ...(rec.expressId !== undefined ? { expressId: rec.expressId } : {}),
    ...(rec.keyed !== undefined ? { keyed: rec.keyed } : {}),
    type: rec.type,
    ...(rec.archetype !== undefined ? { archetype: rec.archetype } : {}),
    category: rec.category,
    ...(rec.predefinedType !== undefined ? { predefinedType: rec.predefinedType } : {}),
    ...(rec.name !== undefined ? { name: rec.name } : {}),
    ...(rec.parent !== undefined ? { parent: rec.parent } : {}),
    ...(rec.storey !== undefined ? { storey: rec.storey } : {}),
    ...(rec.source !== undefined ? { source: rec.source } : {}),
  };
  if (fields.has('props') && rec.props !== undefined) out['props'] = rec.props;
  if (fields.has('psets') && rec.psets !== undefined) out['psets'] = rec.psets;
  if (fields.has('quantities') && rec.quantities !== undefined) out['quantities'] = rec.quantities;
  if (fields.has('material') && rec.material !== undefined) out['material'] = rec.material;
  if (fields.has('classification') && rec.classification !== undefined) {
    out['classification'] = rec.classification;
  }
  if (fields.has('relationships')) out['relationships'] = rec.relationships;
  if (fields.has('children')) out['children'] = rec.children;
  if (fields.has('geometry')) {
    out['hasGeometry'] = rec.hasGeometry;
    if (rec.geometryHash !== undefined) out['geometryHash'] = rec.geometryHash;
    if (rec.bounds !== undefined) out['bounds'] = rec.bounds;
    if (rec.volume !== undefined) out['volume'] = rec.volume;
    if (rec.fidelity !== undefined) out['fidelity'] = rec.fidelity;
    if (rec.completeness !== undefined) out['completeness'] = rec.completeness;
    if (rec.geometryError !== undefined) out['geometryError'] = rec.geometryError;
  }
  return out;
}

export interface TreeNode {
  readonly id: string;
  readonly type: string;
  readonly category?: string | undefined;
  readonly name?: string | undefined;
  readonly children?: readonly TreeNode[] | undefined;
}

/** Nest records by parent, from the root; records with no reachable parent come back unparented. */
export function tree(
  records: readonly ElementRecord[],
  rootId: string | undefined
): { root: TreeNode | undefined; unparented: TreeNode[] } {
  const byId = new Map(records.map((r) => [r.id, r]));
  const placed = new Set<string>();
  const build = (rec: ElementRecord): TreeNode => {
    placed.add(rec.id);
    const kids = rec.children.flatMap((c) => {
      const child = byId.get(c);
      return child && !placed.has(c) ? [build(child)] : [];
    });
    return {
      id: rec.id,
      type: rec.type,
      ...(rec.category !== rec.type ? { category: rec.category } : {}),
      ...(rec.name !== undefined ? { name: rec.name } : {}),
      ...(kids.length > 0 ? { children: kids } : {}),
    };
  };
  const rootRec = rootId !== undefined ? byId.get(rootId) : undefined;
  const root = rootRec ? build(rootRec) : undefined;
  const unparented = records.filter(
    (r) => !placed.has(r.id) && (r.parent === undefined || !byId.has(r.parent))
  );
  return { root, unparented: unparented.map(build) };
}
