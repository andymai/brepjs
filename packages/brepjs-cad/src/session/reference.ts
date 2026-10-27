import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { toolDir } from '../verify/brepjsRuntime.js';

/** One bundled reference file, addressed by a stable name such as `families/openings.md`. */
export interface ReferenceDoc {
  readonly name: string;
  readonly path: string;
}

export interface ReferenceSection {
  readonly doc: string;
  /** The heading trail, outermost first: `Import / Export > STEP Files`. */
  readonly heading: string;
  readonly text: string;
}

export interface ReferenceHit {
  readonly doc: string;
  readonly heading: string;
  readonly excerpt: string;
  /** How many of the query's terms the section contains. */
  readonly matched: number;
}

const EXCERPT_CHARS = 1200;

/**
 * The reference the package ships in `reference/` (the brepjs API reference, the families docs,
 * and the families-to-IFC guide). An unbuilt checkout has no `reference/` yet, so each file falls
 * back to its source in the repo.
 */
export function referenceDocs(dir: string = toolDir()): ReferenceDoc[] {
  const bundled = resolve(dir, 'reference');
  const repo = resolve(dir, '..', '..');
  const docs = new Map<string, string>();
  const add = (name: string, ...candidates: string[]) => {
    const found = candidates.find((p) => existsSync(p));
    if (found !== undefined && !docs.has(name)) docs.set(name, found);
  };
  for (const name of ['llms.txt', 'llms-full.txt'])
    add(name, join(bundled, name), join(repo, name));
  add(
    'families-bim.md',
    join(bundled, 'families-bim.md'),
    join(dir, 'skills', 'implement', 'references', 'families-bim.md')
  );
  for (const famDir of [join(bundled, 'families'), join(repo, 'apps', 'docs', 'families')]) {
    if (!existsSync(famDir)) continue;
    for (const f of readdirSync(famDir)
      .filter((n) => n.endsWith('.md'))
      .sort()) {
      add(`families/${basename(f)}`, join(famDir, f));
    }
  }
  return [...docs].map(([name, path]) => ({ name, path }));
}

/** Split markdown into sections at headings, ignoring `#` lines inside code fences. */
export function sectionsOf(doc: string, text: string): ReferenceSection[] {
  const out: ReferenceSection[] = [];
  const trail: string[] = [];
  let body: string[] = [];
  let fenced = false;
  const flush = () => {
    const t = body.join('\n').trim();
    if (t !== '' || trail.length > 0) out.push({ doc, heading: trail.join(' > '), text: t });
    body = [];
  };
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const m = fenced ? null : /^(#{1,4})\s+(.*\S)\s*$/.exec(line);
    if (m) {
      flush();
      const level = (m[1] as string).length;
      trail.length = Math.min(trail.length, level - 1);
      trail[level - 1] = m[2] as string;
      trail.length = level;
      continue;
    }
    body.push(line);
  }
  flush();
  return out.filter((s) => s.text !== '');
}

function count(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length))
    n++;
  return n;
}

function excerpt(text: string, terms: readonly string[]): string {
  if (text.length <= EXCERPT_CHARS) return text;
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
  const start = Number.isFinite(first) ? Math.max(0, first - EXCERPT_CHARS / 4) : 0;
  const end = Math.min(text.length, start + EXCERPT_CHARS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9_$.-]+/)
        .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
        .filter((t) => t.length >= 2)
    ),
  ];
}

/** Sections ranked by how many query terms they contain, then by how often, headings counting more. */
export function searchSections(
  sections: readonly ReferenceSection[],
  query: string,
  limit: number
): ReferenceHit[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const scored: { hit: ReferenceHit; score: number }[] = [];
  for (const s of sections) {
    const heading = s.heading.toLowerCase();
    const text = s.text.toLowerCase();
    let matched = 0;
    let score = 0;
    for (const t of terms) {
      const inHeading = count(heading, t);
      const inText = count(text, t);
      if (inHeading + inText === 0) continue;
      matched++;
      score += inHeading * 10 + Math.min(inText, 20);
    }
    if (matched === 0) continue;
    scored.push({
      hit: { doc: s.doc, heading: s.heading, excerpt: excerpt(s.text, terms), matched },
      score: matched * 1000 + score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.hit);
}

/**
 * The bundled reference, read and split on first use. `llms.txt` is a condensed `llms-full.txt`,
 * so search reads the full one and skips the short one to avoid returning each section twice.
 */
export class ReferenceIndex {
  readonly docs: readonly ReferenceDoc[];
  #sections: ReferenceSection[] | undefined;

  constructor(docs: readonly ReferenceDoc[] = referenceDocs()) {
    this.docs = docs;
  }

  read(name: string): string | undefined {
    const doc = this.docs.find((d) => d.name === name);
    return doc ? readFileSync(doc.path, 'utf8') : undefined;
  }

  search(query: string, limit: number): ReferenceHit[] {
    this.#sections ??= this.docs
      .filter((d) => d.name !== 'llms.txt' || !this.docs.some((o) => o.name === 'llms-full.txt'))
      .flatMap((d) => sectionsOf(d.name, readFileSync(d.path, 'utf8')));
    return searchSections(this.#sections, query, limit);
  }
}
