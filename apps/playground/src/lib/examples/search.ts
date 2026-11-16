/**
 * Search over the example library.
 *
 * Each example is searchable by its label, its category, its description, and
 * the functions it imports. The import list comes from the code itself, so the
 * API terms stay true without a hand-kept tag list.
 */
import type { Example } from './types';

export interface SearchCategory {
  id: string;
  label: string;
  examples: readonly Example[];
}

export interface SearchEntry {
  example: Example;
  categoryId: string;
  categoryLabel: string;
  /** Function names the example imports, lowercased for the match. */
  api: readonly string[];
  /** The same names as written in the code, for display. */
  apiNames: readonly string[];
  label: string;
  description: string;
}

export interface SearchHit {
  entry: SearchEntry;
  score: number;
  /** Imported functions that a query word matched, as written in the code. */
  matchedApi: readonly string[];
}

const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;

/** Function names an example imports. Types and aliases are left out. */
export function importedApi(code: string): string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(IMPORT_RE)) {
    for (const raw of (match[1] ?? '').split(',')) {
      const name =
        raw
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim() ?? '';
      // Runtime functions start in lower case. Type imports do not.
      if (/^[a-z][A-Za-z0-9]*$/.test(name)) names.add(name);
    }
  }
  return [...names];
}

export function buildSearchIndex(categories: readonly SearchCategory[]): SearchEntry[] {
  return categories.flatMap((category) =>
    category.examples.map((example) => {
      const apiNames = importedApi(example.code);
      return {
        example,
        categoryId: category.id,
        categoryLabel: category.label,
        api: apiNames.map((n) => n.toLowerCase()),
        apiNames,
        label: example.label.toLowerCase(),
        description: example.description.toLowerCase(),
      };
    })
  );
}

// Lower is better. A label hit always ranks above an API hit, and an API hit
// above a description hit, because long descriptions mention many things.
const LABEL_WORD = 0;
const LABEL = 10;
const API_EXACT = 20;
const CATEGORY = 30;
const API_PART = 40;
const DESCRIPTION = 50;

function scoreToken(
  entry: SearchEntry,
  token: string
): { score: number; api?: string | undefined } | null {
  const at = entry.label.indexOf(token);
  if (at !== -1) {
    const startsWord = at === 0 || /[^a-z0-9]/.test(entry.label[at - 1] ?? '');
    return { score: startsWord ? LABEL_WORD : LABEL };
  }
  const exact = entry.api.indexOf(token);
  if (exact !== -1) return { score: API_EXACT, api: entry.apiNames[exact] };
  if (entry.categoryLabel.toLowerCase().includes(token)) return { score: CATEGORY };
  const part = entry.api.findIndex((name) => name.includes(token));
  if (part !== -1) return { score: API_PART, api: entry.apiNames[part] };
  if (entry.description.includes(token)) return { score: DESCRIPTION };
  return null;
}

/**
 * Entries that match every word of the query, best first. An empty query
 * returns every entry in library order.
 */
export function searchExamples(index: readonly SearchEntry[], query: string): SearchHit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return index.map((entry) => ({ entry, score: 0, matchedApi: [] }));
  }
  const hits: (SearchHit & { order: number })[] = [];
  index.forEach((entry, order) => {
    let score = 0;
    const matchedApi: string[] = [];
    for (const token of tokens) {
      const result = scoreToken(entry, token);
      if (!result) return;
      score += result.score;
      if (result.api && !matchedApi.includes(result.api)) matchedApi.push(result.api);
    }
    hits.push({ entry, score, matchedApi, order });
  });
  return hits
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map(({ entry, score, matchedApi }) => ({ entry, score, matchedApi }));
}
