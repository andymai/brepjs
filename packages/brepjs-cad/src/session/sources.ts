import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import type { SessionKind } from './records.js';

export interface SourceSet {
  /** Absolute paths that fed the build: the entry plus its relative-import closure. */
  readonly files: readonly string[];
  readonly hash: string;
}

const SCRIPT_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
// House style writes `.js` specifiers over TS sources, as the resolve hook allows.
const TS_FOR_JS: Readonly<Record<string, readonly string[]>> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};
const MAX_FILES = 2000;

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function resolveRelative(spec: string, fromFile: string): Promise<string | undefined> {
  const base = resolve(dirname(fromFile), spec);
  if (await isFile(base)) return base;
  const ext = extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  for (const e of TS_FOR_JS[ext] ?? []) if (await isFile(stem + e)) return stem + e;
  if (!SCRIPT_EXT.has(ext)) {
    for (const e of SCRIPT_EXT) if (await isFile(base + e)) return base + e;
    for (const e of ['index.ts', 'index.tsx', 'index.js']) {
      if (await isFile(join(base, e))) return join(base, e);
    }
  }
  return undefined;
}

const sha256 = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

/**
 * The files a build read, for staleness checks: an IFC file alone, or a program's entry plus every
 * file it reaches through relative imports. Bare specifiers (node_modules) are not followed.
 */
export async function sourceSetOf(entry: string, kind: SessionKind): Promise<SourceSet> {
  const ts = kind === 'families' ? (await import('typescript')).default : undefined;
  const seen = new Set<string>();
  const queue = [entry];
  const digest: string[] = [];
  while (queue.length > 0 && seen.size < MAX_FILES) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch {
      digest.push(`${relative(dirname(entry), file)}\0missing`);
      continue;
    }
    digest.push(`${relative(dirname(entry), file)}\0${sha256(bytes)}`);
    if (ts === undefined || !SCRIPT_EXT.has(extname(file))) continue;
    const { importedFiles } = ts.preProcessFile(bytes.toString('utf8'), true, true);
    for (const { fileName } of importedFiles) {
      if (!fileName.startsWith('./') && !fileName.startsWith('../')) continue;
      const dep = await resolveRelative(fileName, file);
      if (dep !== undefined && !seen.has(dep)) queue.push(dep);
    }
  }
  digest.sort();
  return { files: [...seen], hash: sha256(digest.join('\n')).slice(0, 16) };
}
