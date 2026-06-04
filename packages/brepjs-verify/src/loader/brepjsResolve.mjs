import { pathToFileURL } from 'node:url';

// Prefer-local resolution hook for the bundled `brepjs-verify` CLI.
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

let toolBaseUrl;

export async function initialize(data) {
  // `data.toolDir` is the brepjs-verify package root; resolve bundled deps relative to a
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

export async function resolve(specifier, context, nextResolve) {
  if (!isManagedSpecifier(specifier)) {
    return nextResolve(specifier, context);
  }
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
