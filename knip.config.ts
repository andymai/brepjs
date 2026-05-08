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
      ignoreDependencies: ['occt-wasm'],
    },
    'packages/brepjs-opencascade': {
      ignore: ['**'],
    },
    'apps/playground': {
      ignore: ['**'],
    },
    'apps/docs': {
      ignore: ['**'],
    },
  },
};

export default config;
