import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts'],
  project: ['src/**/*.ts'],
  ignore: ['src/**/*.test.ts'],
  ignoreDependencies: ['brepjs-opencascade'],
  ignoreExportsUsedInFile: true,
};

export default config;
