#!/usr/bin/env node
/**
 * create-brepjs — scaffold a brepjs + brepjs-families project.
 *
 *   npm create brepjs@latest my-project
 *
 * Copies the template (package.json, tsconfig, a working src/main.tsx) into
 * the target directory and prints the copy-in next steps (`npx brepjs add`).
 */

import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '../templates');

async function main() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (Number.isFinite(nodeMajor) && nodeMajor < 24) {
    console.warn(
      `create-brepjs: Node ${process.versions.node} detected — the generated project needs Node >=24`
    );
  }
  const name = process.argv[2] ?? 'brepjs-app';
  // A relative path is allowed; its basename becomes the package name. No
  // traversal, no absolute paths, no scopes (a scope is not a directory).
  const segments = name.split('/');
  const base = segments[segments.length - 1] ?? '';
  const valid =
    !name.startsWith('/') &&
    !name.endsWith('/') &&
    segments.every((s) => /^[a-z0-9][a-z0-9-_.]*$/.test(s) && s !== '.' && s !== '..');
  if (!valid) {
    console.error(
      `create-brepjs: invalid project name '${name}' (relative path ending in a lowercase package name; no '..', no scopes)`
    );
    process.exitCode = 1;
    return;
  }
  const target = resolve(name);
  const existing = await readdir(target).catch(() => null);
  if (existing !== null && existing.length > 0) {
    console.error(`create-brepjs: target directory is not empty: ${target}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(target, { recursive: true });
  await cp(TEMPLATES, target, { recursive: true });
  // npm mangles nested package.json files in published packages; the template
  // ships under a neutral name and is renamed on scaffold.
  await rename(join(target, 'package.json.tpl'), join(target, 'package.json'));
  // npm drops .gitignore from published tarballs; ship under a neutral name.
  await rename(join(target, 'gitignore'), join(target, '.gitignore'));
  const pkgPath = join(target, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  pkg.name = base;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const readmePath = join(target, 'README.md');
  const readme = await readFile(readmePath, 'utf8');
  await writeFile(readmePath, readme.replace('# brepjs-app', `# ${base}`));

  console.warn(`Scaffolded ${target}`);
  console.warn('');
  console.warn('Next steps:');
  console.warn(`  cd ${name}`);
  console.warn('  npm install');
  console.warn('  npm run preview                   # live viewer (add -- --watch)');
  console.warn('  npx brepjs add room storey slab   # copy in starter families');
}

main().catch((err) => {
  console.error(`create-brepjs: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
