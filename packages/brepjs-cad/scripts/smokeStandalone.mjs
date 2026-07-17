#!/usr/bin/env node
// Clean-room standalone-install regression guard.
//
// In-repo, the CLI runs through tsx/vitest with the whole monorepo on disk, so it can't
// catch what a real installed user hits: a dangling runtime dep the install failed to
// resolve, the bin symlink not wiring up, the .ts part failing to load outside the repo,
// or the resolve hook not landing the CLI's brepjs and the part's `import 'brepjs'` on one
// kernel realm. This packs the tarball, installs it into a throwaway project that adds NO
// brepjs of its own, authors a .brep.ts that `import`s 'brepjs', runs the installed
// `brep` bin, and asserts ok:true + volume>0 — the full standalone chain end to end.
//
// Runs the install+verify under BOTH default npm and `--legacy-peer-deps`. The two diverge
// only for `peerDependencies`: default npm auto-installs peers, `--legacy-peer-deps` does
// NOT. Declaring brepjs as a regular `dependency` (currently `"brepjs": "*"`) keeps it in
// the install tree either way; a regression to `peerDependencies` would leave brepjs
// dangling under `--legacy-peer-deps` and break the CLI — which the default-only path is
// blind to (that gap is exactly what shipped #1852's rejected peer-dep variant undetected
// in local default-install testing).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workRoot = mkdtempSync(join(tmpdir(), 'brepjs-cad-standalone-'));
const cleanup = () => rmSync(workRoot, { recursive: true, force: true });

function run(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

// Install the tarball into a fresh consumer project that adds NO brepjs of its own, author a
// part that imports bare 'brepjs', run the installed `brep` bin, and assert a valid solid.
// `extraInstallArgs` lets the caller vary the install mode (e.g. --legacy-peer-deps). This is
// exactly a real `npm i brepjs-cad && brep verify part.brep.ts` with zero setup: it proves the
// install resolves every runtime dep (nothing dangling), the resolve hook lands the CLI's
// brepjs and the part's `import 'brepjs'` on one kernel realm, the .ts part loads via native
// ESM type-stripping, the kernel runs, and measure produces a valid solid — none of which is
// reachable from the in-repo tsx/vitest path.
function installAndVerify(label, extraInstallArgs) {
  const proj = join(workRoot, `consumer-${label}`);
  run('mkdir', ['-p', proj], workRoot);
  // "type":"module" so the .ts part loads via Node's native ESM type-stripping (engines >=24),
  // matching a real ESM author project.
  writeFileSync(
    join(proj, 'package.json'),
    JSON.stringify({ name: `consumer-${label}`, version: '0.0.0', private: true, type: 'module' }, null, 2)
  );

  process.stderr.write(`installing tarball into clean project (${label})...\n`);
  // No optional deps (puppeteer/Chrome) — proves the default verify path needs none, and that
  // the snapshot path degrades gracefully (lazy) rather than crashing when puppeteer is absent.
  run('npm', ['install', '--no-save', '--omit=optional', ...extraInstallArgs, tarball], proj);

  const part = join(proj, 'box.brep.ts');
  writeFileSync(part, "import { box } from 'brepjs';\nexport default () => box(10, 10, 10);\n");
  const bin = join(proj, 'node_modules', '.bin', 'brep');

  process.stderr.write(`running installed brep (${label})...\n`);
  const outFile = join(proj, 'report.json');
  run(bin, ['verify', part, '--json', outFile], proj);
  const report = JSON.parse(readFileSync(outFile, 'utf8'));
  if (report.ok !== true) throw new Error(`[${label}] expected ok:true, got ok:${report.ok}`);
  const volume = report.measurements && report.measurements.volume;
  if (!(volume > 0)) throw new Error(`[${label}] expected volume>0, got ${volume}`);
  process.stderr.write(`[${label}] ok:true, volume:${volume}\n`);
}

let tarball;
try {
  // Build, then pack. Build first (its vite logs go to stdout) so `npm pack` can run with
  // --ignore-scripts — that skips the prepack rebuild and keeps the pack's stdout a clean JSON
  // document. --pack-destination keeps the tarball out of the repo.
  process.stderr.write('building brepjs-cad...\n');
  run('npm', ['run', 'build'], pkgRoot);
  process.stderr.write('packing brepjs-cad...\n');
  const packJson = run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', workRoot], pkgRoot);
  tarball = join(workRoot, JSON.parse(packJson)[0].filename);
  if (!existsSync(tarball)) throw new Error(`pack produced no tarball at ${tarball}`);

  installAndVerify('default', []);
  installAndVerify('legacy-peer-deps', ['--legacy-peer-deps']);

  process.stderr.write('standalone smoke OK\n');
} catch (err) {
  cleanup();
  process.stderr.write(`standalone smoke FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
cleanup();
