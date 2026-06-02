import type { MaterialSpec } from './types.js';

export const DEFAULT_K_FACTOR = 0.44;

function gauge(name: string, thickness: number, kFactor = DEFAULT_K_FACTOR): MaterialSpec {
  return {
    name,
    thickness,
    defaultRule: { innerRadius: thickness, kFactor },
  };
}

export const STEEL_GAUGES: Readonly<Record<string, MaterialSpec>> = {
  'steel-24ga': gauge('steel-24ga', 0.61),
  'steel-22ga': gauge('steel-22ga', 0.76),
  'steel-20ga': gauge('steel-20ga', 0.91),
  'steel-18ga': gauge('steel-18ga', 1.21),
  'steel-16ga': gauge('steel-16ga', 1.52),
  'steel-14ga': gauge('steel-14ga', 1.9),
  'steel-12ga': gauge('steel-12ga', 2.66),
  'steel-10ga': gauge('steel-10ga', 3.42),
};

export const ALUMINUM_GAUGES: Readonly<Record<string, MaterialSpec>> = {
  'aluminum-22ga': gauge('aluminum-22ga', 0.64),
  'aluminum-20ga': gauge('aluminum-20ga', 0.81),
  'aluminum-18ga': gauge('aluminum-18ga', 1.02),
  'aluminum-16ga': gauge('aluminum-16ga', 1.29),
  'aluminum-14ga': gauge('aluminum-14ga', 1.63),
  'aluminum-12ga': gauge('aluminum-12ga', 2.05),
  'aluminum-10ga': gauge('aluminum-10ga', 2.59),
};

export const MATERIALS: Readonly<Record<string, MaterialSpec>> = {
  ...STEEL_GAUGES,
  ...ALUMINUM_GAUGES,
};

export function getMaterial(name: string): MaterialSpec | undefined {
  return MATERIALS[name];
}
