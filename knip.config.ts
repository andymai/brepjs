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
      // @types/react is pinned at the root to force ONE React-19 types copy across the monorepo
      // (so @react-three/fiber's JSX augmentation resolves it, not a stale @types/react@18 hoist);
      // it's consumed by the brepjs-viewer/brepjs-verify workspaces, not root src.
      // (occt-wasm is now the default kernel — dynamically imported in src/kernel/index.ts + src/quick.ts.)
      ignoreDependencies: ['@types/react'],
    },
    'packages/brepjs-opencascade': {
      ignore: ['**'],
    },
    // Committed Rust→WASM artifact: knip can't reason about the wasm-pack output
    // or the external wasm-pack build binary.
    'packages/brepjs-voxel-wasm': {
      ignore: ['**'],
    },
    'packages/brepjs-viewer': {
      ignore: ['**'],
    },
    'packages/brepjs-verify': {
      ignore: ['**'],
    },
    'apps/playground': {
      ignore: ['**'],
    },
  },
};

export default config;
