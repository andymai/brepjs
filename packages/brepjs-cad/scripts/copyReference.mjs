import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Bundle the repo's llms.txt / llms-full.txt API reference into the published package, so a
// CLI-only user (`npm i -D brepjs-cad`, no plugin) and the skill's reference-index backstop
// have the full brepjs API surface on disk. Generated at build/prepack time (gitignored) — the
// source of truth stays the single repo-root pair, so the bundled copy can never drift.
const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(pkgDir, '..', '..');
const outDir = resolve(pkgDir, 'reference');

mkdirSync(outDir, { recursive: true });
let copied = 0;
for (const name of ['llms.txt', 'llms-full.txt']) {
  const src = resolve(repoRoot, name);
  if (existsSync(src)) {
    copyFileSync(src, resolve(outDir, name));
    copied += 1;
  } else {
    console.warn(`copyReference: ${name} not found at ${repoRoot}; skipping`);
  }
}
if (copied === 0) {
  // The package ships these as its bundled API reference; producing none means the published
  // tarball would silently omit `reference/`. Fail rather than ship an incomplete package.
  console.error(`copyReference: no reference files found at ${repoRoot} — cannot bundle.`);
  process.exit(1);
}
console.warn(`copyReference: bundled ${copied} API reference file(s) into reference/`);
