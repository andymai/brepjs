import {
  canonicalJson,
  type Bounds,
  type ElementRecord,
  type RelationshipRecord,
} from './records.js';

export interface ValueChange {
  readonly before: unknown;
  readonly after: unknown;
}

export interface ElementChange {
  readonly id: string;
  /** Identity-side fields: name, type, category, parent, storey, material, classification. */
  readonly fields?: Readonly<Record<string, ValueChange>> | undefined;
  readonly props?: Readonly<Record<string, ValueChange>> | undefined;
  /** Keyed `PsetName.Property`. */
  readonly psets?: Readonly<Record<string, ValueChange>> | undefined;
  readonly quantities?: Readonly<Record<string, ValueChange>> | undefined;
  readonly relationships?:
    | {
        readonly added: readonly RelationshipRecord[];
        readonly removed: readonly RelationshipRecord[];
      }
    | undefined;
  readonly geometryChanged?: boolean | undefined;
  readonly geometryError?: ValueChange | undefined;
  readonly volumeDelta?: number | undefined;
  readonly boundsDelta?: Partial<Record<keyof Bounds, number>> | undefined;
}

export interface BuildDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly ElementChange[];
  readonly unchanged: number;
}

const FIELD_KEYS = [
  'name',
  'type',
  'category',
  'predefinedType',
  'parent',
  'storey',
  'material',
  'classification',
] as const;
const BOUNDS_KEYS = ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'] as const;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

function same(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

function recordDelta(
  before: Readonly<Record<string, unknown>> | undefined,
  after: Readonly<Record<string, unknown>> | undefined
): Record<string, ValueChange> | undefined {
  const out: Record<string, ValueChange> = {};
  for (const k of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const b = before?.[k];
    const a = after?.[k];
    if (!same(b, a)) out[k] = { before: b, after: a };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function setDelta(
  before: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined,
  after: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined
): Record<string, ValueChange> | undefined {
  const out: Record<string, ValueChange> = {};
  for (const set of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    for (const [prop, change] of Object.entries(recordDelta(before?.[set], after?.[set]) ?? {})) {
      out[`${set}.${prop}`] = change;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function geometryChanged(b: ElementRecord, a: ElementRecord): boolean {
  if (b.hasGeometry !== a.hasGeometry) return true;
  if (b.geometryHash !== undefined && a.geometryHash !== undefined)
    return b.geometryHash !== a.geometryHash;
  if ((b.volume === undefined) !== (a.volume === undefined)) return true;
  if (b.volume !== undefined && a.volume !== undefined && !near(b.volume, a.volume)) return true;
  if ((b.bounds === undefined) !== (a.bounds === undefined)) return true;
  if (b.bounds && a.bounds)
    return BOUNDS_KEYS.some((k) => !near(b.bounds?.[k] ?? 0, a.bounds?.[k] ?? 0));
  return false;
}

function relationshipDelta(
  b: readonly RelationshipRecord[],
  a: readonly RelationshipRecord[]
): ElementChange['relationships'] {
  const key = (r: RelationshipRecord) => `${r.kind}\0${r.target}`;
  const bk = new Set(b.map(key));
  const ak = new Set(a.map(key));
  const added = a.filter((r) => !bk.has(key(r)));
  const removed = b.filter((r) => !ak.has(key(r)));
  return added.length > 0 || removed.length > 0 ? { added, removed } : undefined;
}

function compare(b: ElementRecord, a: ElementRecord): ElementChange | undefined {
  const fields: Record<string, ValueChange> = {};
  for (const k of FIELD_KEYS) if (!same(b[k], a[k])) fields[k] = { before: b[k], after: a[k] };
  const props = recordDelta(b.props, a.props);
  const psets = setDelta(b.psets, a.psets);
  const quantities = setDelta(b.quantities, a.quantities);
  const relationships = relationshipDelta(b.relationships, a.relationships);
  const geo = geometryChanged(b, a);
  const errorChanged = b.geometryError !== a.geometryError;
  if (
    !geo &&
    !errorChanged &&
    !props &&
    !psets &&
    !quantities &&
    !relationships &&
    Object.keys(fields).length === 0
  ) {
    return undefined;
  }
  const boundsDelta: Partial<Record<keyof Bounds, number>> = {};
  if (geo && b.bounds && a.bounds) {
    for (const k of BOUNDS_KEYS)
      if (!near(b.bounds[k], a.bounds[k])) boundsDelta[k] = a.bounds[k] - b.bounds[k];
  }
  return {
    id: a.id,
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(props ? { props } : {}),
    ...(psets ? { psets } : {}),
    ...(quantities ? { quantities } : {}),
    ...(relationships ? { relationships } : {}),
    ...(geo ? { geometryChanged: true } : {}),
    ...(errorChanged ? { geometryError: { before: b.geometryError, after: a.geometryError } } : {}),
    ...(geo && b.volume !== undefined && a.volume !== undefined
      ? { volumeDelta: a.volume - b.volume }
      : {}),
    ...(Object.keys(boundsDelta).length > 0 ? { boundsDelta } : {}),
  };
}

/** Diff two builds by element id. Children lists are not compared: structure shows up as adds and removes. */
export function diffBuilds(
  before: readonly ElementRecord[],
  after: readonly ElementRecord[]
): BuildDiff {
  const prior = new Map(before.map((r) => [r.id, r]));
  const next = new Set(after.map((r) => r.id));
  const added: string[] = [];
  const changed: ElementChange[] = [];
  let unchanged = 0;
  for (const a of after) {
    const b = prior.get(a.id);
    if (b === undefined) {
      added.push(a.id);
      continue;
    }
    const c = compare(b, a);
    if (c) changed.push(c);
    else unchanged++;
  }
  const removed = before.filter((r) => !next.has(r.id)).map((r) => r.id);
  return { added, removed, changed, unchanged };
}

/** Elements whose geometry fails in `next` but did not fail (or did not exist) in `previous`. */
export function newGeometryFailures(
  previous: readonly ElementRecord[],
  next: readonly ElementRecord[]
): ElementRecord[] {
  const failedBefore = new Set(
    previous.filter((r) => r.geometryError !== undefined).map((r) => r.id)
  );
  return next.filter((r) => r.geometryError !== undefined && !failedBefore.has(r.id));
}
