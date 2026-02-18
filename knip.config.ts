import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  rules: {
    // Intentional API-compat aliases (drawRectangle = drawRoundedRectangle, etc.)
    duplicates: 'off',
  },
  workspaces: {
    '.': {
      project: ['src/**/*.ts'],
      ignore: ['src/**/*.test.ts'],
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
