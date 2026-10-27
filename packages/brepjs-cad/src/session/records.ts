/**
 * Plain-data element records: what a session worker hands the MCP server after a build. Everything
 * here crosses the IPC boundary and lands in tool results, so it holds no kernel handles.
 */

export type SessionKind = 'families' | 'ifc';

export interface Bounds {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

export interface StoreyRef {
  readonly id: string;
  readonly name?: string | undefined;
}

export interface RelationshipRecord {
  readonly kind: string;
  readonly target: string;
}

export type ScalarRecord = Readonly<Record<string, unknown>>;

export interface ElementRecord {
  /** Key path for families elements, GlobalId for IFC elements. */
  readonly id: string;
  readonly keyPath?: string | undefined;
  readonly guid?: string | undefined;
  readonly expressId?: number | undefined;
  /** Families: false when the key path came from the index fallback. */
  readonly keyed?: boolean | undefined;
  /** Families type (family name or intrinsic), or the IFC category. */
  readonly type: string;
  readonly archetype?: string | undefined;
  /** What `where.category` matches: the archetype (or type) for families, the IFC category. */
  readonly category: string;
  readonly predefinedType?: string | undefined;
  readonly name?: string | undefined;
  readonly parent?: string | undefined;
  readonly children: readonly string[];
  readonly storey?: StoreyRef | undefined;
  readonly props?: ScalarRecord | undefined;
  readonly psets?: Readonly<Record<string, ScalarRecord>> | undefined;
  readonly quantities?: Readonly<Record<string, ScalarRecord>> | undefined;
  readonly material?: unknown;
  readonly classification?: unknown;
  readonly relationships: readonly RelationshipRecord[];
  readonly hasGeometry: boolean;
  /** Whether the render payload carries a mesh for it: false for containers and for geometry
   *  that failed to mesh or import. */
  readonly renderable: boolean;
  /** Families: the CSG IR structural hash, so geometry change is a string compare. */
  readonly geometryHash?: string | undefined;
  readonly bounds?: Bounds | undefined;
  readonly volume?: number | undefined;
  /** IFC: how faithfully the body was reconstructed. */
  readonly fidelity?: string | undefined;
  /** IFC: whether every Body item reconstructed (COMPLETE, PARTIAL, NONE). */
  readonly completeness?: string | undefined;
  readonly geometryError?: string | undefined;
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface BuildDiagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly id?: string | undefined;
}

export interface BuildSummary {
  readonly kind: SessionKind;
  readonly units: 'mm';
  readonly root?: string | undefined;
  readonly elements: readonly ElementRecord[];
  readonly diagnostics: readonly BuildDiagnostic[];
  readonly schema?: string | undefined;
  readonly applicationName?: string | undefined;
}

export type BuildOutcome =
  | { readonly ok: true; readonly summary: BuildSummary }
  | { readonly ok: false; readonly diagnostics: readonly BuildDiagnostic[] };

// A recursion backstop: the stack-of-ancestors check below is what stops cycles.
const MAX_DEPTH = 64;

function isPlainRecord(v: object): v is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function elementRef(v: Record<string, unknown>): Record<string, unknown> | undefined {
  const t = v['type'];
  const looksLikeElement =
    (typeof t === 'string' || typeof t === 'function') &&
    typeof v['props'] === 'object' &&
    Array.isArray(v['children']);
  if (!looksLikeElement) return undefined;
  const familyName =
    typeof t === 'function' ? (t as { familyName?: unknown }).familyName : undefined;
  const name = typeof t === 'function' ? (typeof familyName === 'string' ? familyName : t.name) : t;
  return { element: name, ...(typeof v['key'] === 'string' ? { key: v['key'] } : {}) };
}

/**
 * Project an authored prop value onto JSON, losslessly for data, since records feed the build hash
 * and the diff. Nested elements become `{ element, key }` refs, so an edit to a child shows up on
 * the child's record rather than on every ancestor holding it. CSG IR nodes become `{ ir: kind }`;
 * functions are dropped.
 */
export function jsonSafe(value: unknown): unknown {
  return project(value, []);
}

function project(value: unknown, ancestors: object[]): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return undefined;
  if (ancestors.includes(value)) return '[circular]';
  if (ancestors.length >= MAX_DEPTH) return '[depth limit]';
  const inner = [...ancestors, value];
  const each = (v: unknown) => project(v, inner) ?? null;
  if (ArrayBuffer.isView(value)) {
    return value instanceof DataView
      ? { dataView: value.byteLength }
      : Array.from(value as unknown as ArrayLike<number | bigint>, each);
  }
  if (Array.isArray(value)) return value.map(each);
  if (value instanceof Map)
    return { map: [...value.entries()].map(([k, v]) => [each(k), each(v)]) };
  if (value instanceof Set) return { set: [...value].map(each) };
  if (value instanceof Date) return value.toISOString();
  const rec = value as Record<string, unknown>;
  const ref = elementRef(rec);
  if (ref) return ref;
  if ('structuralHash' in rec && typeof rec['kind'] === 'string') return { ir: rec['kind'] };
  const out: Record<string, unknown> = isPlainRecord(value)
    ? {}
    : { object: value.constructor.name };
  for (const [k, v] of Object.entries(rec)) {
    const safe = project(v, inner);
    if (safe !== undefined) out[k] = safe;
  }
  return out;
}

/** JSON with sorted object keys, so two equal values always serialize the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k];
    return sorted;
  });
}

export function boundsOfPositions(p: ArrayLike<number>): Bounds | undefined {
  if (p.length < 3) return undefined;
  let xMin = Infinity;
  let yMin = Infinity;
  let zMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  let zMax = -Infinity;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const x = p[i] ?? 0;
    const y = p[i + 1] ?? 0;
    const z = p[i + 2] ?? 0;
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  return { xMin, xMax, yMin, yMax, zMin, zMax };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { message?: unknown }).message === 'string'
  ) {
    return (e as { message: string }).message;
  }
  return String(e);
}
