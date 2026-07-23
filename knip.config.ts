import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,
  // Exports tagged `@testOnly` are exercised only by the suite in `tests/`
  // (outside `src`). knip can't trace those usages here — the tests import via
  // the `@/…js` alias from a separate tsconfig — so treat the tag as "used".
  tags: ['-testOnly'],
  rules: {
    // Intentional API-compat aliases (drawRectangle = drawRoundedRectangle, etc.)
    duplicates: 'off',
    // brepjs-opencascade is an intentional optional peerDependency
    optionalPeerDependencies: 'off',
  },
  workspaces: {
    '.': {
      project: ['src/**/*.ts'],
      ignoreBinaries: ['tsx', 'tar'],
      // @types/react is pinned at the root to force ONE React-19 types copy across the monorepo
      // (so @react-three/fiber's JSX augmentation resolves it, not a stale @types/react@18 hoist);
      // it's consumed by the brepjs-viewer/brepjs-cad workspaces, not root src.
      // (occt-wasm is now the default kernel — dynamically imported in src/kernel/index.ts + src/quick.ts.)
      // sharp is used only by the local OG generator (scripts/gen-og-docs.mjs via
      // `npm run gen:og`); it's hoisted (transitive) so declaring it would churn
      // the lockfile with sharp's platform binaries for no runtime/CI benefit.
      // brepjs-voxel-wasm is a sibling workspace package imported only by the
      // out-of-src test suite (tests/voxel*.test.ts), which root `project` excludes.
      // @emnapi/core + @emnapi/runtime are never imported: they are declared only to
      // stop npm < 11.11 pruning them from the lockfile (they are otherwise reachable
      // just as hoisted optional peer deps of the *-wasm32-wasi binaries), which made
      // CI's npm fail every Dependabot PR with "Missing: @emnapi/... from lock file".
      ignoreDependencies: [
        '@types/react',
        'sharp',
        'brepjs-voxel-wasm',
        '@emnapi/core',
        '@emnapi/runtime',
      ],
    },
    // examples/ holds runnable demos (entry points, not imported by src); the
    // IfcOpenShell validator under scripts/ is Python. src/ stays fully checked.
    'packages/brepjs-bim': {
      ignore: ['examples/**'],
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
    'packages/brepjs-cad': {
      ignore: ['**'],
    },
    'apps/playground': {
      ignore: ['**'],
    },
  },
};

export default config;
