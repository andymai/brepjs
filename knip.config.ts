import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  rules: {
    // Intentional API-compat aliases (drawRectangle = drawRoundedRectangle, etc.)
    duplicates: 'off',
    // brepjs-opencascade is an intentional optional peerDependency
    optionalPeerDependencies: 'off',
  },
  ignoreDependencies: [
    // brepkit-wasm is linked locally for testing, not published as a dependency
    'brepkit-wasm',
  ],
  workspaces: {
    '.': {
      project: ['src/**/*.ts'],
      ignoreBinaries: ['tsx'],
    },
    'packages/*': {
      ignore: ['**'],
    },
    site: {
      ignore: ['**'],
    },
  },
};

export default config;
