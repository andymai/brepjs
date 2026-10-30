/**
 * Merge single-solid brepkit STEP documents into one.
 *
 * brepkit-wasm's `exportStep` takes one solid, but a STEP file holds one
 * document. brepkit's own multi-solid writer lists every solid in a single
 * ADVANCED_BREP_SHAPE_REPRESENTATION under one product, so the merge rebuilds
 * that layout: each later document contributes only the entities its solids
 * reach, renumbered past the ids already used, and its solids join the first
 * document's representation.
 *
 * @module
 */

interface StepRecord {
  readonly id: number;
  readonly body: string;
}

interface StepDocument {
  /** Everything up to and including `DATA;`. */
  readonly head: string;
  /** The `ENDSEC;` closing the data section, and everything after it. */
  readonly tail: string;
  readonly records: readonly StepRecord[];
}

const REPRESENTATION =
  /^(ADVANCED_BREP_SHAPE_REPRESENTATION\s*\(\s*'(?:[^']|'')*'\s*,\s*\()([^)]*)\)/;

/** A string literal, kept as is, or a `#n` entity reference. */
const TOKEN = /'(?:[^']|'')*'|#(\d+)/g;

/** Rewrite every `#n` reference outside a string literal to `#map(n)`. */
function mapRefs(body: string, map: (id: number) => number): string {
  return body.replace(TOKEN, (token: string, id: string | undefined) =>
    id === undefined ? token : `#${map(Number(id))}`
  );
}

function refsOf(body: string): number[] {
  const refs: number[] = [];
  mapRefs(body, (id) => {
    refs.push(id);
    return id;
  });
  return refs;
}

/** Split the data section into records at semicolons outside string literals. */
function parseStep(doc: string): StepDocument {
  const dataStart = doc.indexOf('DATA;');
  if (dataStart < 0) throw new Error('brepkit: STEP document has no DATA section');
  const bodyStart = dataStart + 'DATA;'.length;
  const records: StepRecord[] = [];
  let inString = false;
  let start = bodyStart;
  for (let i = bodyStart; i < doc.length; i++) {
    const ch = doc.charAt(i);
    if (ch === "'") inString = !inString;
    if (inString || ch !== ';') continue;
    const statement = doc.slice(start, i).trim();
    if (statement === 'ENDSEC') {
      return { head: doc.slice(0, bodyStart), tail: doc.slice(start).trimStart(), records };
    }
    const match = /^#(\d+)\s*=\s*([\s\S]*)$/.exec(statement);
    if (!match) throw new Error(`brepkit: unreadable STEP record '${statement.slice(0, 40)}'`);
    records.push({ id: Number(match[1]), body: match[2] ?? '' });
    start = i + 1;
  }
  throw new Error('brepkit: STEP document has an unterminated DATA section');
}

function representationIndex(records: readonly StepRecord[]): number {
  const index = records.findIndex((r) => REPRESENTATION.test(r.body));
  if (index < 0) throw new Error('brepkit: STEP document has no shape representation');
  return index;
}

/** The ids of the solids a document's shape representation lists. */
function solidIds(records: readonly StepRecord[]): number[] {
  const rep = records[representationIndex(records)];
  return refsOf(REPRESENTATION.exec(rep?.body ?? '')?.[2] ?? '');
}

/** The records `roots` reach, in file order, renumbered consecutively from `firstId`. */
function takeReachable(
  records: readonly StepRecord[],
  roots: readonly number[],
  firstId: number
): { lines: string[]; renumber: Map<number, number> } {
  const byId = new Map(records.map((r) => [r.id, r.body]));
  const reached = new Set<number>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop() ?? 0;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const ref of refsOf(byId.get(id) ?? '')) pending.push(ref);
  }
  const kept = records.filter((r) => reached.has(r.id));
  const renumber = new Map(kept.map((r, i) => [r.id, firstId + i]));
  const remap = (id: number): number => renumber.get(id) ?? id;
  const lines = kept.map((r) => `#${remap(r.id)} = ${mapRefs(r.body, remap)};`);
  return { lines, renumber };
}

/** One STEP document holding the solids of every brepkit STEP document in `docs`. */
export function mergeStepDocuments(docs: readonly string[]): string {
  const [first, ...rest] = docs;
  if (first === undefined) return '';
  if (rest.length === 0) return first;
  const base = parseStep(first);
  // Large solids run to hundreds of thousands of records, so no argument spreads.
  let nextId = base.records.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const added: string[] = [];
  const solids: number[] = [];
  for (const doc of rest) {
    const { records } = parseStep(doc);
    const roots = solidIds(records);
    const { lines, renumber } = takeReachable(records, roots, nextId);
    for (const line of lines) added.push(line);
    for (const id of roots) solids.push(renumber.get(id) ?? id);
    nextId += lines.length;
  }
  const repIndex = representationIndex(base.records);
  const extraItems = solids.map((id) => `, #${id}`).join('');
  const addItems = (_match: string, open: string, items: string): string =>
    `${open}${items}${extraItems})`;
  const lines = base.records.map(
    ({ id, body }, i) =>
      `#${id} = ${i === repIndex ? body.replace(REPRESENTATION, addItems) : body};`
  );
  const merged = [...lines.slice(0, repIndex), ...added, ...lines.slice(repIndex)];
  return `${base.head}\n${merged.join('\n')}\n${base.tail}`;
}
