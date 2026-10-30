/**
 * Merge single-solid brepkit IGES documents into one.
 *
 * brepkit-wasm's `exportIges` takes one solid, but an IGES file holds one
 * document. brepkit's writer emits only standalone entities that point at no
 * other entity, so the merge appends each later document's directory and
 * parameter entries, renumbering only the fixed-column fields that number or
 * link them, and keeps the first document's start and global sections.
 *
 * @module
 */

/** Plane, line, B-spline curve and B-spline surface: the entities brepkit writes. */
const POINTER_FREE = new Set([108, 110, 126, 128]);
const PLANE = 108;
/** A plane's sixth parameter points at its bounding curve; brepkit writes none. */
const PLANE_BOUND = 5;

interface IgesSections {
  readonly start: readonly string[];
  readonly global: readonly string[];
  readonly directory: readonly string[];
  readonly parameter: readonly string[];
}

/** Each line by the section letter in column 73. */
function sections(doc: string): IgesSections {
  const bySection = new Map<string, string[]>();
  for (const line of doc.split('\n')) {
    if (line.length < 73) continue;
    const letter = line.charAt(72);
    const lines = bySection.get(letter) ?? [];
    lines.push(line.slice(0, 80));
    bySection.set(letter, lines);
  }
  return {
    start: bySection.get('S') ?? [],
    global: bySection.get('G') ?? [],
    directory: bySection.get('D') ?? [],
    parameter: bySection.get('P') ?? [],
  };
}

/** The `index`th 8-column field of a directory line. */
function field(line: string, index: number): number {
  return Number(line.slice(index * 8, index * 8 + 8).trim() || '0');
}

function withField(line: string, index: number, value: number): string {
  return line.slice(0, index * 8) + String(value).padStart(8) + line.slice(index * 8 + 8);
}

/** `line` with its section letter and sequence number in columns 73-80. */
function withSequence(line: string, letter: string, sequence: number): string {
  return line.slice(0, 72).padEnd(72) + letter + String(sequence).padStart(7);
}

/** Throw unless the entity a directory entry describes points at nothing. */
function assertPointerFree(line1: string, line2: string, parameter: readonly string[]): void {
  const type = field(line1, 0);
  // Structure, line font, level, view, transformation and label display (line
  // 1), and color (line 2) can each hold a pointer.
  const linked = [2, 3, 4, 5, 6, 7].some((i) => field(line1, i) !== 0) || field(line2, 2) !== 0;
  let bounded = false;
  if (type === PLANE) {
    const first = field(line1, 1) - 1;
    const text = parameter
      .slice(first, first + field(line2, 3))
      .map((l) => l.slice(0, 64))
      .join('');
    bounded = (text.split(/[,;]/)[PLANE_BOUND]?.trim() ?? '0') !== '0';
  }
  if (!POINTER_FREE.has(type) || linked || bounded) {
    throw new Error(`brepkit: cannot merge IGES documents holding a linked entity (type ${type})`);
  }
}

/** One IGES document holding the entities of every brepkit IGES document in `docs`. */
export function mergeIgesDocuments(docs: readonly string[]): string {
  const [first, ...rest] = docs;
  if (first === undefined) return '';
  if (rest.length === 0) return first;
  const base = sections(first);
  const directory: string[] = [];
  const parameter: string[] = [];
  for (const doc of docs) {
    const { directory: d, parameter: p } = sections(doc);
    const dOffset = directory.length;
    const pOffset = parameter.length;
    for (let i = 0; i + 1 < d.length; i += 2) {
      const line1 = d[i] ?? '';
      const line2 = d[i + 1] ?? '';
      assertPointerFree(line1, line2, p);
      const renumbered = withField(line1, 1, field(line1, 1) + pOffset);
      directory.push(withSequence(renumbered, 'D', dOffset + i + 1));
      directory.push(withSequence(line2, 'D', dOffset + i + 2));
    }
    p.forEach((line, j) => {
      const owner = Number(line.slice(64, 72).trim()) + dOffset;
      parameter.push(
        withSequence(line.slice(0, 64) + String(owner).padStart(8), 'P', pOffset + j + 1)
      );
    });
  }
  const count = (letter: string, n: number): string => letter + String(n).padStart(7);
  const terminate =
    count('S', base.start.length) +
    count('G', base.global.length) +
    count('D', directory.length) +
    count('P', parameter.length);
  return [
    ...base.start,
    ...base.global,
    ...directory,
    ...parameter,
    withSequence(terminate, 'T', 1),
    '',
  ].join('\n');
}
