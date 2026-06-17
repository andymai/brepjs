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
      // it's consumed by the brepjs-viewer/brepjs-verify workspaces, not root src.
      // (occt-wasm is now the default kernel — dynamically imported in src/kernel/index.ts + src/quick.ts.)
      // sharp is used only by the local OG generator (scripts/gen-og-docs.mjs via
      // `npm run gen:og`); it's hoisted (transitive) so declaring it would churn
      // the lockfile with sharp's platform binaries for no runtime/CI benefit.
      ignoreDependencies: ['@types/react', 'sharp'],
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
    'packages/brepjs-verify': {
      ignore: ['**'],
    },
    'apps/playground': {
      ignore: ['**'],
    },
  },
};

export default config;
