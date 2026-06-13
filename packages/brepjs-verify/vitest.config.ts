import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

const pkgSrc = resolve(__dirname, 'src');
const rootSrc = resolve(__dirname, '../../src');
const viewerSrc = resolve(__dirname, 'viewer/src');

export default defineConfig({
  resolve: {
    // `@/verify|snapshot|cli|sandbox` are this package's own dirs; every other `@/...`
    // belongs to the live brepjs source we alias below, so it must resolve into
    // the root src tree. A single `@`→pkgSrc alias misroutes brepjs's internal
    // `@/utils`/`@/kernel` imports and breaks any test that imports `brepjs`.
    alias: [
      { find: /^@viewer\//, replacement: `${viewerSrc}/` },
      { find: /^@\/(verify|snapshot|cli|sandbox)\//, replacement: `${pkgSrc}/$1/` },
      { find: /^@\//, replacement: `${rootSrc}/` },
      { find: 'brepjs', replacement: resolve(rootSrc, 'index.ts') },
    ],
  },
  test: {
    globals: true,
    testTimeout: 90000,
    pool: 'forks',
    execArgv: ['--max-old-space-size=6144'],
    server: { deps: { inline: [/[\\/]src[\\/]/] } },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'viewer',
          include: ['viewer/tests/**/*.test.ts'],
          environment: 'jsdom',
        },
      },
    ],
  },
});
