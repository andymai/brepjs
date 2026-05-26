export type LengthUnit = 'mm' | 'm' | 'in' | 'ft';

export interface UnitSystem {
  readonly length: LengthUnit;
}

export const DEFAULT_UNITS: UnitSystem = { length: 'mm' };

export function toLengthMm(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'mm':
      return value;
    case 'm':
      return value * 1000;
    case 'in':
      return value * 25.4;
    case 'ft':
      return value * 304.8;
  }
}

export function toIfcLengthM(mm: number): number {
  return mm / 1000;
}
