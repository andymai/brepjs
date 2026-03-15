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
    // Resolved via vitest alias to its Node CJS entry (path-based, not bare specifier)
    'brepkit-wasm',
  ],
  workspaces: {
    '.': {
      entry: [
        'src/index.ts',
        // Package subpath exports (brepjs/topology, brepjs/operations, etc.)
        'src/topology.ts',
        'src/operations.ts',
        'src/core.ts',
        'src/2d.ts',
        'src/io.ts',
        'src/measurement.ts',
        'src/query.ts',
        'src/sketching.ts',
        'src/worker.ts',
        'src/quick.ts',
      ],
      project: ['src/**/*.ts'],
      ignore: [
        // Extracted brepkit adapter modules — not yet wired up (progressive extraction)
        'src/kernel/brepkit/**',
      ],
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
