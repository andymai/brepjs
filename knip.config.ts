import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts'],
  project: ['src/**/*.ts'],
  ignore: ['src/**/*.test.ts'],
  ignoreDependencies: [],
  ignoreExportsUsedInFile: true,
};

export default config;
