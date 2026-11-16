import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { toolDir } from '../verify/brepjsRuntime.js';
import { runPart } from '../verify/runPart.js';
import { reportOk } from '../verify/report.js';
import { disposeShape } from '../disposeShape.js';
import { stem } from '../cli/exportPart.js';
import { collectPartFiles, PublishError } from './partFiles.js';

/** What the page reads at `part.json` to find and describe the part. */
export interface PartManifest {
  readonly name: string;
  readonly title: string;
  /** URL of the part's entry module, relative to the page. */
  readonly entry: string;
  /** The part's source files, for the Source tab. */
  readonly sources: readonly { readonly path: string; readonly text: string }[];
  readonly generator: { readonly name: 'brepjs-cad'; readonly version: string };
}

export interface PublishOptions {
  title?: string;
  /** Write into a directory that holds files from something other than an earlier publish. */
  force?: boolean;
}

export interface PublishResult {
  ok: boolean;
  outDir: string;
  written: string[];
  errors: { message: string; code?: string | undefined }[];
}

const MANIFEST = 'part.json';
const PART_DIR = 'part';

function runtimeDir(): string {
  return join(toolDir(), 'viewer', 'dist', 'publish');
}

function wasmDir(): string {
  return join(toolDir(), 'viewer', 'dist', 'wasm');
}

function toolVersion(): string {
  const pkg = JSON.parse(readFileSync(join(toolDir(), 'package.json'), 'utf8')) as {
    version?: string;
  };
  return pkg.version ?? '0.0.0';
}

// An existing directory is safe to write into when it is empty or holds an earlier publish.
function occupiedBy(outDir: string): string | undefined {
  if (!existsSync(outDir)) return undefined;
  const entries = readdirSync(outDir);
  if (entries.length === 0 || entries.includes(MANIFEST)) return undefined;
  return entries[0];
}

function fail(outDir: string, message: string, code?: string): PublishResult {
  return { ok: false, outDir, written: [], errors: [{ message, code }] };
}

/**
 * Turn a part into a static page: the page runtime, the kernel, one brepjs bundle, and the part
 * as browser modules. The part must verify at its defaults first.
 */
export async function publishPart(
  modulePath: string,
  outDirPath: string,
  opts: PublishOptions = {}
): Promise<PublishResult> {
  const outDir = resolve(outDirPath);
  const entry = resolve(modulePath);
  const runtime = runtimeDir();
  if (!existsSync(join(runtime, 'index.html'))) {
    return fail(outDir, `the page runtime is missing at ${runtime}`, 'PUBLISH_RUNTIME_MISSING');
  }
  const blocker = opts.force ? undefined : occupiedBy(outDir);
  if (blocker !== undefined) {
    return fail(
      outDir,
      `${outDir} is not empty (it holds "${blocker}") and is not an earlier publish. Use --force to write into it.`,
      'PUBLISH_OUT_NOT_EMPTY'
    );
  }

  const { report, shape } = await runPart(entry);
  disposeShape(shape);
  if (!reportOk(report) || shape === null) {
    const errors = report.errorInfos.map(({ message, code }) => ({ message, code }));
    const failed = report.checks.filter((c) => !c.passed).map((c) => ({ message: c.name }));
    return { ok: false, outDir, written: [], errors: [...errors, ...failed] };
  }

  let part: Awaited<ReturnType<typeof collectPartFiles>>;
  try {
    part = await collectPartFiles(entry, '../brepjs.js');
  } catch (e) {
    if (e instanceof PublishError) return fail(outDir, e.message, e.code);
    throw e;
  }

  const written: string[] = [];
  mkdirSync(outDir, { recursive: true });
  cpSync(runtime, outDir, { recursive: true });
  cpSync(wasmDir(), join(outDir, 'wasm'), { recursive: true });
  for (const file of part.files) {
    const target = join(outDir, PART_DIR, file.outPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.js);
    written.push(target);
  }
  const name = stem(entry);
  const manifest: PartManifest = {
    name,
    title: opts.title ?? name,
    entry: `${PART_DIR}/${part.entry}`,
    sources: part.files.map(({ path, text }) => ({ path, text })),
    generator: { name: 'brepjs-cad', version: toolVersion() },
  };
  const manifestPath = join(outDir, MANIFEST);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  written.push(manifestPath, join(outDir, 'index.html'));
  return { ok: true, outDir, written, errors: [] };
}
