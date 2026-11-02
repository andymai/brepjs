import type { MeshUnit } from 'brepjs-mesh2solid';

export const UNITS: readonly { readonly unit: MeshUnit; readonly label: string }[] = [
  { unit: 'mm', label: 'millimeters' },
  { unit: 'cm', label: 'centimeters' },
  { unit: 'm', label: 'meters' },
  { unit: 'in', label: 'inches' },
  { unit: 'ft', label: 'feet' },
  { unit: 'um', label: 'micrometers' },
];

export function unitLabel(unit: MeshUnit): string {
  return UNITS.find((u) => u.unit === unit)?.label ?? unit;
}

/** A length in millimeters, switching to micrometers below a thousandth. */
export function length(mm: number): string {
  if (!Number.isFinite(mm)) return 'n/a';
  if (mm === 0) return '0 mm';
  // Below a nanometer the figure is floating-point noise, not a measurement.
  if (Math.abs(mm) < 1e-6) return 'under 0.001 µm';
  if (Math.abs(mm) < 0.001) return `${Number((mm * 1000).toPrecision(2))} µm`;
  return `${Number(mm.toPrecision(3))} mm`;
}

/** A size in its own units, to at most four significant figures per side. */
export function size(sides: readonly number[], unit: string): string {
  return `${sides.map((s) => Number(s.toPrecision(4))).join(' × ')} ${unit}`;
}

export function count(n: number): string {
  return n.toLocaleString('en-US');
}

/** File name without its extension, for naming downloads. */
export function stem(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
