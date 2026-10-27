import { readFileSync } from 'node:fs';
import type { ReadResourceResult, Resource } from '@modelcontextprotocol/sdk/types.js';
import { queryTerms, type ReferenceIndex } from '../session/reference.js';
import { ArgError, jsonResult, optionalCount, requireString, type ToolDef } from './registry.js';

const DEFAULT_HITS = 5;
const MAX_HITS = 10;
const REFERENCE_URI = 'brep://reference/';
const REGISTRY_URI = 'brep://families/registry';

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
  const docs: Resource[] = index.docs.map((d) => ({
    uri: uriOf(d.name),
    name: `reference-${d.name}`,
    title: `brepjs reference: ${d.name}`,
    mimeType: mimeOf(d.name),
  }));
  if (index.registry.length === 0) return docs;
  return [
    ...docs,
    {
      uri: REGISTRY_URI,
      name: 'families-registry',
      title: 'brepjs-families starter registry',
      description:
        'The families `npx brepjs add <name>` copies into a project: name, version, description and dependencies. Each family source is at brep://families/registry/{name}.',
      mimeType: 'application/json',
    },
    ...index.registry.map((f) => ({
      uri: `${REGISTRY_URI}/${f.name}`,
      name: `families-registry-${f.name}`,
      title: `Starter family: ${f.name}`,
      ...(f.description !== undefined ? { description: f.description } : {}),
      mimeType: 'text/x-typescript',
    })),
  ];
}

function readRegistryResource(index: ReferenceIndex, uri: string): ReadResourceResult | undefined {
  if (uri === REGISTRY_URI) {
    const families = index.registry.map(({ path: _path, ...f }) => ({
      ...f,
      add: `npx brepjs add ${f.name}`,
      source: `${REGISTRY_URI}/${f.name}`,
    }));
    return {
      contents: [{ uri, mimeType: 'application/json', text: JSON.stringify({ families }) }],
    };
  }
  if (!uri.startsWith(`${REGISTRY_URI}/`)) return undefined;
  const family = index.registry.find((f) => f.name === uri.slice(REGISTRY_URI.length + 1));
  if (family === undefined) return undefined;
  return {
    contents: [{ uri, mimeType: 'text/x-typescript', text: readFileSync(family.path, 'utf8') }],
  };
}

/** Read a brep://reference or brep://families/registry resource, or undefined when the URI is neither. */
export function readReferenceResource(
  index: ReferenceIndex,
  uri: string
): ReadResourceResult | undefined {
  if (uri.startsWith(REGISTRY_URI)) return readRegistryResource(index, uri);
  if (!uri.startsWith(REFERENCE_URI)) return undefined;
  const name = decodeURIComponent(uri.slice(REFERENCE_URI.length));
  const text = index.read(name);
  return text === undefined ? undefined : { contents: [{ uri, mimeType: mimeOf(name), text }] };
}
