import type { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { queryTerms, type ReferenceIndex } from '../session/reference.js';
import { ArgError, jsonResult, optionalCount, requireString, type ToolDef } from './registry.js';

const DEFAULT_HITS = 5;
const MAX_HITS = 10;
const REFERENCE_URI = 'brep://reference/';

const uriOf = (name: string) => `${REFERENCE_URI}${name}`;
const mimeOf = (name: string) => (name.endsWith('.md') ? 'text/markdown' : 'text/plain');

export function referenceTools(index: ReferenceIndex): ToolDef[] {
  return [
    {
      name: 'search_reference',
      title: 'Search reference',
      description:
        'Search the reference bundled with brepjs-cad, with no session needed: the brepjs API reference (llms-full.txt), the brepjs-families docs (families, key paths, openings, props and validation, IFC export) and the families-to-IFC guide. Returns the best-matching sections with their heading and an excerpt, ranked by how many query terms they contain. Read a whole file through its brep://reference resource.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to look for, e.g. "fill role opening".' },
          limit: {
            type: 'number',
            description: `Sections to return (default ${DEFAULT_HITS}, max ${MAX_HITS}).`,
          },
        },
        required: ['query'],
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: (a) => {
        const query = requireString(a, 'query');
        if (queryTerms(query).length === 0) {
          throw new ArgError('"query" needs at least one word of two or more characters');
        }
        const limit = Math.min(optionalCount(a, 'limit') ?? DEFAULT_HITS, MAX_HITS);
        const hits = index.search(query, limit).map((h) => ({ ...h, uri: uriOf(h.doc) }));
        return jsonResult({
          query,
          hits,
          ...(hits.length === 0 ? { searched: index.docs.map((d) => d.name) } : {}),
        });
      },
    },
  ];
}

export function listReferenceResources(index: ReferenceIndex): Resource[] {
  return index.docs.map((d) => ({
    uri: uriOf(d.name),
    name: `reference-${d.name}`,
    title: `brepjs reference: ${d.name}`,
    mimeType: mimeOf(d.name),
  }));
}

/** Read a brep://reference resource, or undefined when the URI is not one. */
export function readReferenceResource(
  index: ReferenceIndex,
  uri: string
): ReadResourceResult | undefined {
  if (!uri.startsWith(REFERENCE_URI)) return undefined;
  const name = decodeURIComponent(uri.slice(REFERENCE_URI.length));
  const text = index.read(name);
  return text === undefined ? undefined : { contents: [{ uri, mimeType: mimeOf(name), text }] };
}
