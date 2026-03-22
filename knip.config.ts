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
      ignore: [],
      ignoreBinaries: ['tsx'],
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
