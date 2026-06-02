/**
 * Central kernel registry — pure data, no project imports.
 *
 * Consumed by vitest.config.ts at config-load time (before TS path aliases).
 * Adding a new kernel = adding an entry to `kernelConfigs`.
 */

export interface CoverageThresholds {
  readonly statements: number;
  readonly branches: number;
  readonly functions: number;
  readonly lines: number;
}

export interface KernelConfig {
  readonly id: string;
  readonly displayName: string;
  readonly envOverrides?: Record<string, string> | undefined;
  readonly excludeTests?: readonly string[] | undefined;
  readonly coverageThresholds?: CoverageThresholds | 'informational' | undefined;
  /**
   * Repo-root-relative path to this kernel's adapter directory (e.g. `"src/kernel/occt"`).
   * Used to derive coverage exclude patterns: every kernel excludes the
   * adapter dirs it doesn't load.
   */
  readonly adapterDir: string;
  /** Marks the auto-selected default kernel for the test gate. Exactly one config sets this. */
  readonly default?: boolean | undefined;
  /** Extra coverage exclude patterns specific to this kernel (e.g. files the kernel doesn't load). */
  readonly extraCoverageExcludes?: readonly string[] | undefined;
  readonly capabilities: {
    readonly projection: boolean;
    readonly constraintSketch: boolean;
    readonly kernel2D: boolean;
    readonly variableFillet: boolean;
    readonly offsetSolidV2: boolean;
    readonly gridPattern: boolean;
  };
}

export const kernelConfigs: readonly KernelConfig[] = [
  {
    id: 'occt',
    displayName: 'OpenCascade',
    coverageThresholds: { statements: 84, branches: 74, functions: 90, lines: 84 },
    adapterDir: 'src/kernel/occt',
    // OCCT.js adapter doesn't load the pure-TS 2D module (occt's own 2D ops cover it).
    extraCoverageExcludes: ['src/kernel/geometry2d.ts'],
    capabilities: {
      projection: true,
      // constraintSketch (sketchNew/sketchDof) is brepkit/manifold-only — the OCCT
      // adapter does not implement it. variableFillet (filletVariable) is a throwing
      // brepkit-only stub on this adapter; only occt-wasm implements it.
      constraintSketch: false,
      kernel2D: true,
      variableFillet: false,
      offsetSolidV2: false,
      gridPattern: false,
    },
  },
  {
    id: 'brepkit',
    displayName: 'brepkit',
    coverageThresholds: 'informational',
    adapterDir: 'src/kernel/brepkit',
    capabilities: {
      projection: false,
      constraintSketch: true,
      kernel2D: true,
      variableFillet: false,
      offsetSolidV2: true,
      gridPattern: true,
    },
  },
  {
    id: 'occt-wasm',
    displayName: 'occt-wasm',
    default: true,
    coverageThresholds: 'informational',
    adapterDir: 'src/kernel/occtWasm',
    // brepkit-only and gltf-roundtrip files that don't exercise the occt-wasm
    // adapter; they stay excluded even though occt-wasm is now the default project.
    excludeTests: [
      'tests/brepkitExtended.test.ts',
      'tests/brepkitAdapter.test.ts',
      'tests/brepkitSketchArc.test.ts',
      'tests/brepkitOffsetV2.test.ts',
      'tests/gltfRoundTrip.test.ts',
    ],
    capabilities: {
      projection: true,
      constraintSketch: false,
      kernel2D: true,
      // occt-wasm implements filletVariable (single-edge); occt's is a throwing stub.
      variableFillet: true,
      offsetSolidV2: false,
      gridPattern: false,
    },
  },
  {
    id: 'manifold',
    displayName: 'Manifold',
    coverageThresholds: 'informational',
    adapterDir: 'src/kernel/manifold',
    capabilities: {
      projection: false,
      constraintSketch: false,
      kernel2D: false,
      variableFillet: false,
      offsetSolidV2: false,
      gridPattern: false,
    },
  },
] as const;

/**
 * Coverage exclude patterns for a given kernel: every other kernel's adapter
 * directory (those files aren't loaded so coverage there is meaningless),
 * plus any kernel-specific extras.
 *
 * Throws on unknown id so a typo fails at config-load time rather than
 * silently producing a wrong exclude list.
 */
export function coverageExcludesFor(id: string): readonly string[] {
  const config = getKernelConfig(id);
  if (!config) throw new Error(`Unknown kernel: "${id}"`);
  return [
    ...kernelConfigs.filter((k) => k.id !== id).map((k) => `${k.adapterDir}/**`),
    ...(config.extraCoverageExcludes ?? []),
  ];
}

export function getKernelConfig(id: string): KernelConfig | undefined {
  return kernelConfigs.find((k) => k.id === id);
}

export function getKernelCapabilities(id: string): KernelConfig['capabilities'] {
  const cfg = getKernelConfig(id);
  if (!cfg) throw new Error(`Unknown kernel: "${id}"`);
  return cfg.capabilities;
}

/** The id of the default kernel for the test gate (single source of truth). */
export function defaultKernelId(): string {
  const found = kernelConfigs.find((k) => k.default);
  if (!found) throw new Error('kernelRegistry: no kernel marked default');
  return found.id;
}
