import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodePreviewPayload, type PreviewModelPayload } from 'brepjs-viewer';
import { evaluatePreview, type PreviewBuild } from './evaluate.js';
import { startPreviewServer, type PreviewServer } from './server.js';
import {
  createSerialRunner,
  debounce,
  DEFAULT_DEBOUNCE_MS,
  isWatchRelevant,
  watchRootFor,
  watchTree,
} from '../cli/watch.js';
import { loadBrep } from '../verify/brepjsRuntime.js';
import { openBrowser, shouldAutoOpen } from '../cli/openBrowser.js';

export interface PreviewOptions {
  watch?: boolean;
  writeOnly?: boolean;
  glb?: string;
  json?: string;
  port?: number;
  open?: boolean;
}

interface PreviewSummary {
  ok: boolean;
  elements: number;
  failed: readonly string[];
  measurements: PreviewBuild['payload']['measurements'];
  viewer?: string;
}

function summarize(build: PreviewBuild, viewerUrl?: string): PreviewSummary {
  return {
    ok: build.ok,
    elements: build.payload.elements.length,
    failed: build.payload.failed,
    measurements: build.payload.measurements,
    ...(viewerUrl ? { viewer: viewerUrl } : {}),
  };
}

const EMPTY_PAYLOAD: PreviewModelPayload = {
  data: {
    position: new Float32Array(0),
    normal: new Float32Array(0),
    index: new Uint32Array(0),
    edges: new Float32Array(0),
  },
  elements: [],
  failed: [],
  tree: null,
  measurements: { elementCount: 0, failedCount: 0, triangleCount: 0 },
};

async function writeArtifacts(
  build: PreviewBuild,
  opts: PreviewOptions,
  viewerUrl?: string
): Promise<void> {
  if (opts.glb) {
    const brep = await loadBrep();
    mkdirSync(dirname(opts.glb), { recursive: true });
    writeFileSync(opts.glb, Buffer.from(brep.exportGlb(build.merged)));
  }
  if (opts.json && opts.json !== '-') {
    mkdirSync(dirname(opts.json), { recursive: true });
    writeFileSync(opts.json, JSON.stringify(summarize(build, viewerUrl), null, 2));
  }
}

export async function runPreview(entryPath: string, opts: PreviewOptions): Promise<void> {
  let initial: PreviewBuild | undefined;
  try {
    initial = await evaluatePreview(entryPath);
  } catch (e) {
    // Watch mode tolerates a broken initial state — fixing it live is the point.
    // Everything else fails fast so scripts see the error.
    if (!opts.watch) throw e;
    process.stderr.write(`preview build failed: ${(e as Error).message}\n`);
  }

  let server: PreviewServer | undefined;
  if (!opts.writeOnly) {
    server = await startPreviewServer(encodePreviewPayload(initial?.payload ?? EMPTY_PAYLOAD), {
      ...(opts.port !== undefined ? { port: opts.port } : {}),
    });
    process.stderr.write(`viewer: ${server.url}\n`);
    if (opts.open !== false && shouldAutoOpen()) openBrowser(server.url);
  }
  if (initial) {
    await writeArtifacts(initial, opts, server?.url);
    process.stdout.write(JSON.stringify(summarize(initial, server?.url), null, 2) + '\n');
  }
  if (opts.writeOnly && !opts.watch) {
    if (!initial?.ok) process.exitCode = 1;
    return;
  }

  if (opts.watch) {
    const runner = createSerialRunner(async (fresh) => {
      try {
        const build = await evaluatePreview(entryPath, { fresh });
        server?.update(encodePreviewPayload(build.payload));
        await writeArtifacts(build, opts, server?.url);
        const failedNote =
          build.payload.failed.length > 0 ? `, ${build.payload.failed.length} failed` : '';
        process.stderr.write(`preview: ${build.payload.elements.length} elements${failedNote}\n`);
      } catch (e) {
        // Keep serving the last good payload; the next save gets another chance.
        process.stderr.write(`preview rebuild failed: ${(e as Error).message}\n`);
      }
    });
    const { trigger } = debounce(runner.trigger, DEFAULT_DEBOUNCE_MS);
    const stopWatching = watchTree(watchRootFor(entryPath), (filename) => {
      if (isWatchRelevant(filename)) trigger();
    });
    process.stderr.write(`watching ${entryPath} (Ctrl-C to stop)\n`);
    const stop = (): void => {
      stopWatching();
      void server?.close().finally(() => process.exit(0));
      if (!server) process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  }
  // Without --watch the server (if any) still runs until Ctrl-C, matching --serve.
}
