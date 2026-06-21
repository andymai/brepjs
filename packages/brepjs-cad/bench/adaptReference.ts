import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Adapt a playground example's `code` into a `brep`-renderable `.brep.ts` for the blind design judge
// (bench/blind-judge.md). The reference is the known-good playground part; this turns it into a part
// the CLI can run + snapshot so the judge can compare it against the clean-room author's render.
//
// Two divergences between the playground runtime and the `brep` CLI are reconciled here:
//   1. Multi-body examples return a shape ARRAY (`return [a, b, c]` / `export default [x, y]`). The
//      playground renderer accepts an array; the CLI's runChecks calls isSolid() on the default
//      export, and a bare array has no kernel handle → "expected an OcctWasmHandle … got undefined".
//      Wrap an array return in `compound(...)` so the CLI sees one shape. (A single-shape default
//      passes straight through.)
//   2. The example imports from `brepjs/quick`, which auto-inits the kernel via a top-level await.
//      KEEP that import — rewriting it to `brepjs` drops the import-time init that examples with
//      module-level geometry rely on (the same "got undefined" surfaces a different way).
//
// Render the result WITHOUT `--check`: playground `code` is type-checked against the looser Monaco
// ambient surface, so strict-CLI type gaps (e.g. `sketchOnPlane('XY')`) are expected and irrelevant
// to the image the judge needs.
//
// `brepjs/playground` (`color`, `present`) is a playground-only runtime the CLI can't resolve. Those
// helpers are cosmetic — `color(shape, hex)` tags a GLB material, `present(shape, artifacts)` attaches
// downloads — neither changes geometry, and CLI snapshots are grey anyway. Shim each to identity on
// the shape so the part runs.

const QUICK = 'brepjs/quick';

/** Replace `import { a, b } from 'brepjs/playground'` with no-op shims returning the shape (1st arg). */
function shimPlaygroundImports(code: string): string {
  return code.replace(
    /import\s*\{([^}]*)\}\s*from\s*['"]brepjs\/playground['"];?/g,
    (_full, names: string) => {
      const locals = names
        .split(',')
        .map((n) =>
          n
            .trim()
            .split(/\s+as\s+/)
            .pop()
            ?.trim()
        )
        .filter((n): n is string => Boolean(n));
      return locals.map((n) => `const ${n} = (shape) => shape;`).join('\n');
    }
  );
}

/** Pure transform: playground example `code` → CLI-renderable reference part source. */
export function adaptReferenceCode(rawCode: string): string {
  const code = shimPlaygroundImports(rawCode);
  // Keep whatever brepjs entry the example already uses; default to the kernel-auto-init `quick`.
  const usesPlain = /from ['"]brepjs['"]/.test(code) && !/from ['"]brepjs\/quick['"]/.test(code);
  const src = usesPlain ? 'brepjs' : QUICK;

  // The default export is a single expression — a call (`fn()`), a variable, or an array literal,
  // possibly spanning lines. Anchor `$` to end-of-string (no `m` flag) so the non-greedy capture runs
  // to the expression's terminating `;` (the last one before trailing whitespace), not the first `;`
  // that merely happens to end an inner line of a multi-line default. `export default` is always the
  // module's final statement in the corpus, so the trailing `;\s*$` is unambiguous.
  const m = code.match(/export default\s+([\s\S]+?);\s*$/);
  if (!m || m.index === undefined || m[1] === undefined) {
    throw new Error('adaptReference: no `export default <expr>;` found');
  }
  const expr = m[1].trim();

  // `await` makes the wrapper tolerate both sync and async (loadFont/importSTEP) defaults.
  const wrapper =
    `export default async () => {\n` +
    `  const __ref = await (${expr});\n` +
    `  return Array.isArray(__ref) ? __refCompound(__ref) : __ref;\n` +
    `};`;
  const body = code.slice(0, m.index) + wrapper + code.slice(m.index + m[0].length);
  return `import { compound as __refCompound } from '${src}';\n${body}`;
}

interface Example {
  id: string;
  label: string;
  description: string;
  code: string;
}
interface Category {
  id: string;
  label: string;
  examples: readonly Example[];
}

const SCOPE = new Set(['basics', 'mechanical']); // plain brepjs; bim/sheet-metal need other skills

/**
 * Load the plain-brepjs playground examples. A runtime (variable-path) import so the bench tsconfig
 * takes no compile-time dependency on the playground app (same approach as bench/syncDataset.ts).
 */
async function loadReferenceCorpus(): Promise<Example[]> {
  const registry = '../../../apps/playground/src/lib/examples/index.ts';
  const mod = (await import(registry)) as { CATEGORIES: readonly Category[] };
  return mod.CATEGORIES.filter((c) => SCOPE.has(c.id)).flatMap((c) => c.examples);
}

// CLI: write adapted reference parts for the blind judge to render.
//   tsx bench/adaptReference.ts <outDir> [id...]   (no ids → the whole basics+mechanical corpus)
async function main(): Promise<void> {
  const [outDir, ...ids] = process.argv.slice(2);
  if (!outDir) {
    process.stderr.write('usage: tsx bench/adaptReference.ts <outDir> [id...]\n');
    process.exitCode = 1;
    return;
  }
  mkdirSync(outDir, { recursive: true });
  const wanted = new Set(ids);
  const examples = (await loadReferenceCorpus()).filter((e) => !ids.length || wanted.has(e.id));
  for (const e of examples) {
    const out = join(outDir, `${e.id}.ref.brep.ts`);
    try {
      writeFileSync(out, adaptReferenceCode(e.code));
      process.stdout.write(`${e.id} -> ${out}\n`);
    } catch (err) {
      process.stderr.write(`${e.id}: SKIP (${(err as Error).message})\n`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
