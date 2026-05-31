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
      ignoreBinaries: ['tsx'],
      // occt-wasm is dynamically imported in tests/helpers/kernelInit.ts (outside project scope).
      // @types/react is pinned at the root to force ONE React-19 types copy across the monorepo
      // (so @react-three/fiber's JSX augmentation resolves it, not a stale @types/react@18 hoist);
      // it's consumed by the brepjs-viewer/brepjs-agent workspaces, not root src.
      ignoreDependencies: ['occt-wasm', '@types/react'],
    },
    'packages/brepjs-opencascade': {
      ignore: ['**'],
    },
    'packages/brepjs-viewer': {
      ignore: ['**'],
    },
    'packages/brepjs-agent': {
      ignore: ['**'],
    },
    'apps/playground': {
      ignore: ['**'],
    },
  },
};

export default config;
