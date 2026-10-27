import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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
// The families docs and the skill's families-to-IFC guide ride along, so brep-mcp's
// search_reference covers the BIM layer its session tools work on (the API reference doesn't).
const familiesDocs = resolve(repoRoot, 'apps', 'docs', 'families');
const familiesOut = resolve(outDir, 'families');
let families = 0;
if (existsSync(familiesDocs)) {
  mkdirSync(familiesOut, { recursive: true });
  for (const name of readdirSync(familiesDocs).filter((n) => n.endsWith('.md'))) {
    copyFileSync(resolve(familiesDocs, name), resolve(familiesOut, name));
    families += 1;
  }
} else {
  console.warn(`copyReference: ${familiesDocs} not found; skipping the families docs`);
}
// The starter registry, so brep-mcp can list what `npx brepjs add` offers without the network.
const registrySrc = resolve(repoRoot, 'packages', 'brepjs-families', 'registry');
if (existsSync(resolve(registrySrc, 'manifest.json'))) {
  const registryOut = resolve(outDir, 'registry');
  mkdirSync(resolve(registryOut, 'families'), { recursive: true });
  copyFileSync(resolve(registrySrc, 'manifest.json'), resolve(registryOut, 'manifest.json'));
  for (const name of readdirSync(resolve(registrySrc, 'families')).filter((n) => n.endsWith('.ts'))) {
    copyFileSync(resolve(registrySrc, 'families', name), resolve(registryOut, 'families', name));
  }
} else {
  console.warn(`copyReference: ${registrySrc} has no manifest.json; skipping the starter registry`);
}
const bimGuide = resolve(pkgDir, 'skills', 'implement', 'references', 'families-bim.md');
if (existsSync(bimGuide)) {
  copyFileSync(bimGuide, resolve(outDir, 'families-bim.md'));
  families += 1;
}
console.warn(
  `copyReference: bundled ${copied} API reference file(s) and ${families} families doc(s) into reference/`
);
