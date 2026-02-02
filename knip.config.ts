import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: ['src/index.ts'],
  project: ['src/**/*.ts'],
  ignore: ['src/**/*.test.ts'],
  ignoreDependencies: ['brepjs-opencascade'],
  ignoreExportsUsedInFile: true,
  rules: {
    // Intentional API-compat aliases (drawRectangle = drawRoundedRectangle, etc.)
    duplicates: 'off',
  },
};

export default config;
