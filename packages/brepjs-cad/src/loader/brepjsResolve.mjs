import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Prefer-local resolution hook for the bundled `brep` CLI.
//
// The tool bundles its own `brepjs` + `occt-wasm` so it runs standalone, but a part
// authored inside a real project should bind to THAT project's installed `brepjs`
// (matching the kernel/types the author develops against). So for every `brepjs` /
// `occt-wasm` specifier we FIRST try default resolution (which walks the importing
// module's node_modules and finds a local copy if present); only when that fails do we
// fall back to the tool's own bundled copy.
//
// Critical single-instance property: the bundled fallback always resolves against the
// SAME tool directory regardless of who imports, so the CLI's own `brepjs` and the
// part's `import 'brepjs'` collapse to one module URL — one initialized kernel realm.
//
// The same hook also carries a `load` hook that transpiles `.ts`/`.mts`/`.tsx` sources
// (Node's native type-stripping cannot load `.tsx` at all), and a relative-specifier
// fallback that maps `./dep.js` onto an on-disk `dep.ts`/`dep.tsx` (house style writes
// `.js` specifiers over TS sources; Node does not do this mapping). Keeping all of this
// in the ONE registered hook — instead of reaching for tsx — is what preserves the
// single-realm property above.

let toolBaseUrl;

export async function initialize(data) {
  // `data.toolDir` is the brepjs-cad package root; resolve bundled deps relative to a
  // file inside it so Node's resolver walks the tool's node_modules.
  const dir = data && typeof data.toolDir === 'string' ? data.toolDir : undefined;
  if (dir) {
    toolBaseUrl = pathToFileURL(
      dir.endsWith('/') ? dir + 'package.json' : dir + '/package.json'
    ).href;
  }
}

function isManagedSpecifier(specifier) {
  return (
    specifier === 'brepjs' ||
    specifier.startsWith('brepjs/') ||
    specifier === 'occt-wasm' ||
    specifier.startsWith('occt-wasm/')
  );
}

// Watch/preview cache-busting: the ESM module cache is keyed by full URL, so a rerun
// that re-imports the same file URL re-executes the FIRST version forever. The watch
// loop imports the entry with `?v=N`; propagating that query to every user-space file
// the entry (transitively) imports makes each rerun a fresh module graph. Bare and
// managed specifiers are never versioned, so `brepjs`/`occt-wasm` keep their stable
// URLs and the initialized kernel realm survives across reruns.
function versionParam(parentURL) {
  if (!parentURL || !parentURL.startsWith('file:')) return undefined;
  try {
    return new URL(parentURL).searchParams.get('v') ?? undefined;
  } catch {
    return undefined;
  }
}

function withInheritedVersion(resolution, version) {
  const url = resolution && resolution.url;
  if (!version || !url || !url.startsWith('file:') || url.includes('/node_modules/')) {
    return resolution;
  }
  const u = new URL(url);
  u.searchParams.set('v', version);
  return { ...resolution, url: u.href };
}

async function resolveWithTsFallback(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.endsWith('.js')) {
      const stem = specifier.slice(0, -'.js'.length);
      for (const ext of ['.ts', '.tsx']) {
        try {
          return await nextResolve(stem + ext, context);
        } catch {
          // keep trying
        }
      }
    }
    throw err;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (isManagedSpecifier(specifier)) {
    try {
      // Default resolution: finds a LOCAL brepjs/occt-wasm in the consumer's project.
      return await nextResolve(specifier, context);
    } catch (err) {
      if (!toolBaseUrl) throw err;
      // Re-run the DEFAULT resolver, but as if the import came from inside the tool's package
      // (parentURL = the tool's package.json) so it walks the tool's node_modules and honors
      // package "exports" for subpaths. `import.meta.resolve` is unavailable in the hooks
      // thread, so this nextResolve-with-rebased-parent is the resolver we have.
      try {
        return await nextResolve(specifier, { ...context, parentURL: toolBaseUrl });
      } catch {
        throw err;
      }
    }
  }
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return nextResolve(specifier, context);
  }
  const version = versionParam(context.parentURL);
  return withInheritedVersion(
    await resolveWithTsFallback(specifier, context, nextResolve),
    version
  );
}

// --- TypeScript loading ---------------------------------------------------------------

// `typescript` is already a runtime dependency (the `--check` path imports it on the main
// thread); here it loads lazily in the hooks thread only when a TS source is actually
// imported, so pure-JS projects never pay for it.
let tsPromise;

function loadTypescript() {
  tsPromise ??= import('typescript').then((mod) => mod.default ?? mod);
  return tsPromise;
}

// JSX cannot be transpiled without knowing the project's dialect (families projects set
// `jsx: react-jsx` + `jsxImportSource: brepjs-families`), so read it from the nearest
// tsconfig.json — the same file the author's editor uses. Cached per directory; config
// parsing honors `extends`.
const jsxOptionsCache = new Map();

function jsxOptionsFor(ts, filePath) {
  const dir = dirname(filePath);
  const cached = jsxOptionsCache.get(dir);
  if (cached) return cached;
  const options = {};
  const configPath = ts.findConfigFile(dir, ts.sys.fileExists);
  if (configPath) {
    const host = { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} };
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, host);
    if (parsed) {
      for (const key of ['jsx', 'jsxImportSource', 'jsxFactory', 'jsxFragmentFactory']) {
        if (parsed.options[key] !== undefined) options[key] = parsed.options[key];
      }
    }
  }
  jsxOptionsCache.set(dir, options);
  return options;
}

const TS_SOURCE_RE = /\.(?:ts|mts|tsx)$/;
const DECLARATION_RE = /\.d\.(?:ts|mts)$/;

export async function load(url, context, nextLoad) {
  if (!url.startsWith('file:')) return nextLoad(url, context);
  const parsed = new URL(url);
  if (!TS_SOURCE_RE.test(parsed.pathname) || DECLARATION_RE.test(parsed.pathname)) {
    return nextLoad(url, context);
  }
  const filePath = fileURLToPath(parsed);
  const source = readFileSync(filePath, 'utf8');
  const ts = await loadTypescript();
  const { outputText } = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      // A .tsx with no configured dialect still needs SOME emit mode; the automatic
      // runtime is TS's modern default recommendation and what the scaffold ships.
      ...(parsed.pathname.endsWith('.tsx') ? { jsx: ts.JsxEmit.ReactJSX } : {}),
      ...jsxOptionsFor(ts, filePath),
      inlineSourceMap: true,
    },
  });
  return { format: 'module', source: outputText, shortCircuit: true };
}
