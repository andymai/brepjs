import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  rules: {
    // Intentional API-compat aliases (drawRectangle = drawRoundedRectangle, etc.)
    duplicates: 'off',
    // brepjs-opencascade is an intentional optional peerDependency
    optionalPeerDependencies: 'off',
  },
  workspaces: {
    '.': {
      project: ['src/**/*.ts'],
      entry: ['src/kernel/occtWasm/occtWasmAdapter.ts'],
      ignore: [],
      ignoreBinaries: ['tsx'],
      // occt-wasm is dynamically imported in tests/helpers/kernelInit.ts (outside project scope)
      // lz-string is used by scripts/render-doc-images.ts; resolves via docs-site/ workspace install
      ignoreDependencies: ['occt-wasm', 'lz-string'],
    },
    'packages/brepjs-opencascade': {
      ignore: ['**'],
    },
    site: {
      ignore: ['**'],
    },
  },
};

export default config;
