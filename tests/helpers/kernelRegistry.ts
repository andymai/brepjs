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
    capabilities: {
      projection: true,
      constraintSketch: true,
      kernel2D: true,
      variableFillet: true,
      offsetSolidV2: false,
      gridPattern: false,
    },
  },
  {
    id: 'brepkit',
    displayName: 'brepkit',
    coverageThresholds: 'informational',
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
    coverageThresholds: 'informational',
    excludeTests: ['tests/brepkitExtended.test.ts', 'tests/brepkitAdapter.test.ts'],
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

export function getKernelConfig(id: string): KernelConfig | undefined {
  return kernelConfigs.find((k) => k.id === id);
}

export function getKernelCapabilities(id: string): KernelConfig['capabilities'] {
  const cfg = getKernelConfig(id);
  if (!cfg) throw new Error(`Unknown kernel: "${id}"`);
  return cfg.capabilities;
}
