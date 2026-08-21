#!/usr/bin/env node
/**
 * brepjs CLI — copy-in distribution for brepjs-families (the shadcn model).
 *
 *   brepjs add <family...>   copy family source (and its family deps) into
 *                            your project as owned code
 *   brepjs diff <family>     compare a copied family against the registry
 *
 * Options:
 *   --registry <url|path>  registry root (default: the brepjs GitHub registry)
 *   --dir <path>           target directory (default: src/families)
 *   --force                overwrite locally modified files
 *   --install              run `npm install` for missing npm deps
 *
 * The registry is data (manifest.json + source files), so any static host or
 * directory works — point --registry at a firm-internal copy to self-host.
 */

import { mkdir, open, readFile, writeFile, access, lstat, realpath, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve as resolvePath, sep } from 'node:path';
import process from 'node:process';

// The default registry pins to the release tag of the INSTALLED
// brepjs-families, so copied sources match the package the project compiles
// against instead of tracking main (which can drift ahead). Without a local
// install, fall back to main.
const REGISTRY_PATH = 'packages/brepjs-families/registry';

async function defaultRegistry() {
  try {
    const pkg = JSON.parse(
      await readFile(
        join(process.cwd(), 'node_modules', 'brepjs-families', 'package.json'),
        'utf8'
      )
    );
    if (typeof pkg.version === 'string' && /^\d+\.\d+\.\d+$/.test(pkg.version)) {
      return `https://raw.githubusercontent.com/andymai/brepjs/brepjs-families-v${pkg.version}/${REGISTRY_PATH}`;
    }
  } catch {
    // No local brepjs-families: track main.
  }
  return `https://raw.githubusercontent.com/andymai/brepjs/main/${REGISTRY_PATH}`;
}

function parseArgs(argv) {
  const args = { _: [], registry: null, dir: 'src/families', force: false, install: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--registry') args.registry = argv[++i];
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--install') args.install = true;
    else args._.push(a);
  }
  return args;
}

function isUrl(s) {
  return s.startsWith('http://') || s.startsWith('https://');
}

async function fetchText(registry, rel) {
  if (isUrl(registry)) {
    const url = `${registry.replace(/\/$/, '')}/${rel}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed (${res.status}): ${url}`);
    return res.text();
  }
  return readFile(join(registry, rel), 'utf8');
}

// The manifest is the trust boundary: registry file entries become local
// write paths and npmDeps become `npm install` arguments, so both are held
// to strict allowlists before anything else touches them.
const FILE_ENTRY = /^families\/[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)*$/;
const NPM_NAME = /^(@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;

function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1) {
    throw new Error(`unsupported registry schemaVersion: ${manifest.schemaVersion}`);
  }
  for (const fam of manifest.families) {
    for (const file of fam.files) {
      if (!FILE_ENTRY.test(file) || file.includes('..')) {
        throw new Error(`registry file entry outside families/: ${file}`);
      }
    }
    for (const dep of fam.npmDeps) {
      if (!NPM_NAME.test(dep)) {
        throw new Error(`invalid npm dependency name in registry: ${dep}`);
      }
    }
  }
  return manifest;
}

async function loadManifest(registry) {
  if (registry.startsWith('http://')) {
    throw new Error('plaintext http registries are not supported — use https or a local path');
  }
  return validateManifest(JSON.parse(await fetchText(registry, 'manifest.json')));
}

function familyByName(manifest, name) {
  const fam = manifest.families.find((f) => f.name === name);
  if (!fam) {
    const known = manifest.families.map((f) => f.name).join(', ');
    throw new Error(`unknown family '${name}' (registry has: ${known})`);
  }
  return fam;
}

/** Requested families plus their familyDeps, dependencies first. */
function resolveClosure(manifest, names) {
  const ordered = [];
  const seen = new Set();
  const visit = (name, trail) => {
    if (seen.has(name)) return;
    if (trail.includes(name)) {
      throw new Error(`familyDeps cycle: ${[...trail, name].join(' -> ')}`);
    }
    const fam = familyByName(manifest, name);
    for (const dep of fam.familyDeps) visit(dep, [...trail, name]);
    seen.add(name);
    ordered.push(fam);
  };
  for (const name of names) visit(name, []);
  return ordered;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Refuse writes through symlinks: the (created) parent must really live
 *  under the target root, and the file is opened with O_NOFOLLOW so a
 *  symlinked target is rejected atomically at open time (no check-then-write
 *  race on the final component). A symlinked target root itself is respected
 *  as the user's own layout choice. */
async function guardedWrite(targetRoot, target, content) {
  await mkdir(join(target, '..'), { recursive: true });
  const rootReal = await realpath(targetRoot);
  const parentReal = await realpath(join(target, '..'));
  if (parentReal !== rootReal && !parentReal.startsWith(rootReal + sep)) {
    throw new Error(`refusing to write outside the target directory: ${target}`);
  }
  const stat = await lstat(target).catch(() => null);
  if (stat?.isSymbolicLink()) {
    throw new Error(`refusing to write through a symlink: ${target}`);
  }
  // Write a sibling temp file, then rename over the target: rename is atomic
  // and never follows symlinks, so a failed write leaves the target intact
  // (no O_TRUNC damage to report) and a racing symlink is replaced, never
  // followed.
  const tmp = `${target}.brepjs-tmp-${process.pid}`;
  const handle = await open(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL);
  try {
    await handle.writeFile(content);
    await handle.close();
    await rename(tmp, target);
  } catch (err) {
    await handle.close().catch(() => {});
    await rm(tmp, { force: true });
    throw err;
  }
}

async function add(args) {
  const manifest = await loadManifest(args.registry);
  const families = resolveClosure(manifest, args._);
  const targetRoot = resolvePath(args.dir);

  // Plan first, write after: a conflict anywhere in the closure aborts the
  // whole command before any file is touched, so a failed add never leaves a
  // partially installed family set.
  const planned = [];
  for (const fam of families) {
    for (const file of fam.files) {
      const content = await fetchText(args.registry, file);
      const target = resolvePath(targetRoot, file.replace(/^families\//, ''));
      if (!target.startsWith(targetRoot + sep)) {
        throw new Error(`registry file entry escapes the target directory: ${file}`);
      }
      planned.push({ target, content });
    }
  }

  const writes = [];
  const skipped = [];
  for (const p of planned) {
    if (await exists(p.target)) {
      const current = await readFile(p.target, 'utf8');
      if (current === p.content) {
        skipped.push(p.target);
        continue;
      }
      if (!args.force) {
        console.error(`refusing to overwrite modified file (use --force): ${p.target}`);
        process.exitCode = 1;
        return;
      }
    }
    writes.push(p);
  }

  // Copies are idempotent (re-running converges on the same closure), so a
  // mid-apply failure surfaces as an explicit partial-state report rather
  // than staging/rollback machinery.
  const written = [];
  for (const w of writes) {
    try {
      await guardedWrite(targetRoot, w.target, w.content);
    } catch (err) {
      for (const t of written) console.warn(`wrote ${t}`);
      console.error(
        `partial write: ${written.length} of ${writes.length} files written before the failure — fix the cause and re-run to complete the closure`
      );
      throw err;
    }
    written.push(w.target);
  }

  for (const t of written) console.warn(`wrote ${t}`);
  for (const t of skipped) console.warn(`up to date ${t}`);

  const needed = [...new Set(families.flatMap((f) => f.npmDeps))];
  const missing = [];
  const pkgPath = resolvePath('package.json');
  if (await exists(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    const have = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    for (const dep of needed) if (!(dep in have)) missing.push(dep);
  } else {
    missing.push(...needed);
  }
  if (missing.length > 0) {
    if (args.install) {
      console.warn(`installing: ${missing.join(' ')}`);
      // Copy-in means choosing to trust the registry's code, but install-time
      // lifecycle scripts are a surprise nobody opted into: suppress them.
      const r = spawnSync('npm', ['install', '--ignore-scripts', ...missing], {
        stdio: 'inherit',
      });
      if (r.status !== 0) process.exitCode = r.status ?? 1;
    } else {
      console.warn(`missing npm deps — run: npm install ${missing.join(' ')}`);
    }
  }
}

function markerOf(content) {
  const first = content.split('\n', 1)[0] ?? '';
  const m = /^\/\/ brepjs-family: ([a-z0-9-]+)@(\d+)$/.exec(first);
  return m ? { name: m[1], version: Number(m[2]) } : null;
}

async function diff(args) {
  const [name] = args._;
  const manifest = await loadManifest(args.registry);
  const fam = familyByName(manifest, name);
  let dirty = false;
  for (const file of fam.files) {
    const registryContent = await fetchText(args.registry, file);
    const target = join(resolvePath(args.dir), file.replace(/^families\//, ''));
    const stat = await lstat(target).catch(() => null);
    if (stat === null) {
      console.error(`not copied in: ${target}`);
      dirty = true;
      continue;
    }
    // Never read or diff through a symlink: in CI, a committed link could
    // leak whatever readable file it points at into the job output.
    if (stat.isSymbolicLink()) {
      console.error(`${target}: is a symlink — refusing to diff through it`);
      dirty = true;
      continue;
    }
    // Same for symlinked parent directories: the fully resolved path must
    // stay inside the project, or a committed dir link exfiltrates files
    // beyond the checkout.
    const projectRoot = await realpath(process.cwd());
    const real = await realpath(target);
    if (real !== projectRoot && !real.startsWith(projectRoot + sep)) {
      console.error(`${target}: resolves outside the project — refusing to diff`);
      dirty = true;
      continue;
    }
    const local = await readFile(target, 'utf8');
    const localMarker = markerOf(local);
    if (localMarker && localMarker.version !== fam.version) {
      console.warn(`${target}: local ${name}@${localMarker.version}, registry ${name}@${fam.version}`);
    }
    if (local === registryContent) {
      console.warn(`${target}: up to date`);
      continue;
    }
    dirty = true;
    const r = spawnSync('git', ['diff', '--no-index', '--', target, '/dev/stdin'], {
      input: registryContent,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (r.error) console.error(`${target}: differs from registry (git unavailable for a diff)`);
  }
  if (dirty) process.exitCode = 1;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  args.registry = args.registry ?? (await defaultRegistry());
  if (cmd === 'add' && args._.length > 0) return add(args);
  if (cmd === 'diff' && args._.length === 1) return diff(args);
  console.error(
    'usage: brepjs add <family...> [--registry <url|path>] [--dir <path>] [--force] [--install]\n' +
      '       brepjs diff <family> [--registry <url|path>] [--dir <path>]'
  );
  process.exitCode = 2;
}

main().catch((err) => {
  console.error(`brepjs: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
