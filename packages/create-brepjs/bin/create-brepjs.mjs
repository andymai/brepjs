#!/usr/bin/env node
/**
 * create-brepjs — scaffold a brepjs + brepjs-families project.
 *
 *   npm create brepjs@latest my-project
 *
 * Copies the template (package.json, tsconfig, a working src/main.ts) into
 * the target directory and prints the copy-in next steps (`npx brepjs add`).
 */

import { cp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), '../templates');

async function main() {
  const name = process.argv[2] ?? 'brepjs-app';
  if (!/^[a-z0-9@][a-z0-9-_./]*$/i.test(name)) {
    console.error(`create-brepjs: invalid project name '${name}'`);
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
  pkg.name = name.split('/').pop();
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  console.warn(`Scaffolded ${target}`);
  console.warn('');
  console.warn('Next steps:');
  console.warn(`  cd ${name}`);
  console.warn('  npm install');
  console.warn('  npx brepjs add room storey slab   # copy in starter families');
  console.warn('  npx tsx src/main.ts');
}

main().catch((err) => {
  console.error(`create-brepjs: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
