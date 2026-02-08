/**
 * Generates docs/function-lookup.md from barrel file exports.
 *
 * Reads each sub-path barrel file (src/core.ts, src/topology.ts, etc.),
 * extracts exported symbol names, and produces an alphabetical lookup table
 * plus per-module grouped sections.
 *
 * Usage: npx tsx scripts/generate-function-lookup.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

interface ExportEntry {
  name: string;
  subpath: string;
  kind: 'function' | 'type' | 'class' | 'constant' | 'value';
}

const SUBPATHS: Record<string, string> = {
  'src/core.ts': 'brepjs/core',
  'src/topology.ts': 'brepjs/topology',
  'src/operations.ts': 'brepjs/operations',
  'src/2d.ts': 'brepjs/2d',
  'src/sketching.ts': 'brepjs/sketching',
  'src/query.ts': 'brepjs/query',
  'src/measurement.ts': 'brepjs/measurement',
  'src/io.ts': 'brepjs/io',
  'src/worker.ts': 'brepjs/worker',
};

/** Classify an export name into a kind based on naming conventions. */
function classifyExport(name: string, isType: boolean): ExportEntry['kind'] {
  if (isType) return 'type';
  // Classes: PascalCase starting with uppercase, not all-caps
  if (/^[A-Z][a-z]/.test(name) && !/^[A-Z_]+$/.test(name)) return 'class';
  // Constants: ALL_CAPS or known constants
  if (/^[A-Z][A-Z0-9_]+$/.test(name) || name === 'OK') return 'constant';
  return 'function';
}

/** Resolve a relative import specifier to a .ts file path. */
function resolveImport(fromFile: string, specifier: string): string {
  const dir = fromFile.replace(/\/[^/]+$/, '');
  const resolved = specifier.replace(/\.js$/, '.ts');
  return join(dir, resolved);
}

function extractExportsFromContent(content: string, filePath: string, subpath: string, seen: Set<string>): ExportEntry[] {
  const entries: ExportEntry[] = [];

  // Handle: export * from './module'  — follow into that file
  const starExportRe = /export\s+\*\s+from\s+['"]([^'"]+)['"]/g;
  let starMatch;
  while ((starMatch = starExportRe.exec(content)) !== null) {
    const targetPath = resolveImport(filePath, starMatch[1]);
    try {
      const targetContent = readFileSync(join(ROOT, targetPath), 'utf-8');
      entries.push(...extractExportsFromContent(targetContent, targetPath, subpath, seen));
    } catch {
      // File not found — skip silently
    }
  }

  // Match: export { name1, name2 } from '...'
  // and:   export { name as alias } from '...'
  // and:   export { type Name } from '...'
  const reExportBlock = /export\s*\{([^}]+)\}/g;
  let match;
  while ((match = reExportBlock.exec(content)) !== null) {
    const block = match[1];
    // Split by commas, handling multiline
    const items = block.split(',').map((s) => s.trim()).filter(Boolean);
    for (const item of items) {
      // "type Name" or "type Name as Alias"
      const typeMatch = item.match(/^type\s+(\w+)(?:\s+as\s+(\w+))?$/);
      if (typeMatch) {
        const name = typeMatch[2] ?? typeMatch[1];
        if (name && !seen.has(name)) {
          seen.add(name);
          entries.push({ name, subpath, kind: 'type' });
        }
        continue;
      }
      // "name" or "name as alias"
      const valueMatch = item.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
      if (valueMatch) {
        const name = valueMatch[2] ?? valueMatch[1];
        if (name && !seen.has(name)) {
          seen.add(name);
          entries.push({ name, subpath, kind: classifyExport(name, false) });
        }
      }
    }
  }

  // Match: export { default as Name } from '...'
  const defaultAsRe = /export\s*\{\s*default\s+as\s+(\w+)\s*\}/g;
  while ((match = defaultAsRe.exec(content)) !== null) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      entries.push({ name, subpath, kind: classifyExport(name, false) });
    }
  }

  // Match: export class/function/const
  const directExportRe = /export\s+(class|function|const|let)\s+(\w+)/g;
  while ((match = directExportRe.exec(content)) !== null) {
    const name = match[2];
    if (name && !seen.has(name)) {
      seen.add(name);
      const kind = match[1] === 'class' ? 'class' : match[1] === 'const' || match[1] === 'let' ? 'constant' : 'function';
      entries.push({ name, subpath, kind });
    }
  }

  // Match: export type { ... } (standalone type export blocks already handled above)
  // Match: export type Name = ...
  const typeAliasRe = /export\s+type\s+(\w+)\s*=/g;
  while ((match = typeAliasRe.exec(content)) !== null) {
    const name = match[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      entries.push({ name, subpath, kind: 'type' });
    }
  }

  return entries;
}

function extractExports(filePath: string, subpath: string): ExportEntry[] {
  const content = readFileSync(join(ROOT, filePath), 'utf-8');
  const seen = new Set<string>();
  return extractExportsFromContent(content, filePath, subpath, seen);
}

// Collect all exports
const allEntries: ExportEntry[] = [];
for (const [file, subpath] of Object.entries(SUBPATHS)) {
  allEntries.push(...extractExports(file, subpath));
}

// Sort alphabetically (case-insensitive)
allEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

// Group by subpath
const byModule = new Map<string, ExportEntry[]>();
for (const entry of allEntries) {
  let group = byModule.get(entry.subpath);
  if (!group) {
    group = [];
    byModule.set(entry.subpath, group);
  }
  group.push(entry);
}

// Generate markdown
const lines: string[] = [];

lines.push('# Function Lookup Table');
lines.push('');
lines.push(`> **${allEntries.length} symbols** across ${Object.keys(SUBPATHS).length} sub-paths. Auto-generated by \`npm run docs:generate-lookup\`.`);
lines.push('');
lines.push('Use this table to find which sub-path exports a given symbol. Import from the sub-path for focused autocomplete:');
lines.push('');
lines.push('```typescript');
lines.push("// Instead of: import { fillet } from 'brepjs';");
lines.push("import { fillet } from 'brepjs/topology';");
lines.push('```');
lines.push('');

// Alphabetical table
lines.push('## Alphabetical Index');
lines.push('');
lines.push('| Symbol | Sub-path | Kind |');
lines.push('|--------|----------|------|');
for (const entry of allEntries) {
  lines.push(`| \`${entry.name}\` | \`${entry.subpath}\` | ${entry.kind} |`);
}
lines.push('');

// Per-module sections
const subpathOrder = Object.values(SUBPATHS);
for (const subpath of subpathOrder) {
  const group = byModule.get(subpath);
  if (!group || group.length === 0) continue;

  lines.push(`## \`${subpath}\``);
  lines.push('');

  const functions = group.filter((e) => e.kind === 'function');
  const types = group.filter((e) => e.kind === 'type');
  const classes = group.filter((e) => e.kind === 'class');
  const constants = group.filter((e) => e.kind === 'constant');

  if (functions.length > 0) {
    lines.push(`**Functions** (${functions.length}): ${functions.map((e) => `\`${e.name}\``).join(', ')}`);
    lines.push('');
  }
  if (classes.length > 0) {
    lines.push(`**Classes** (${classes.length}): ${classes.map((e) => `\`${e.name}\``).join(', ')}`);
    lines.push('');
  }
  if (types.length > 0) {
    lines.push(`**Types** (${types.length}): ${types.map((e) => `\`${e.name}\``).join(', ')}`);
    lines.push('');
  }
  if (constants.length > 0) {
    lines.push(`**Constants** (${constants.length}): ${constants.map((e) => `\`${e.name}\``).join(', ')}`);
    lines.push('');
  }
}

const output = lines.join('\n');
const outPath = join(ROOT, 'docs', 'function-lookup.md');
writeFileSync(outPath, output);
console.log(`Generated ${outPath} (${allEntries.length} symbols)`);
