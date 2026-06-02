import * as WebIFC from 'web-ifc';

/**
 * Indicative material bulk densities in kg/m³, keyed by lowercase material name.
 * These are nominal values for deriving an analytic IfcQuantityWeight from a
 * solid volume; they are not authoritative engineering figures. Callers that
 * need precise densities should pass an explicit value rather than relying on
 * this lookup table.
 */
export const MATERIAL_DENSITY_KG_M3: Readonly<Record<string, number>> = {
  concrete: 2400,
  'reinforced concrete': 2500,
  steel: 7850,
  aluminium: 2700,
  aluminum: 2700,
  timber: 500,
  wood: 500,
  glass: 2500,
  brick: 1920,
  masonry: 2000,
  stone: 2700,
  gypsum: 1200,
  plaster: 1200,
  insulation: 50,
  water: 1000,
  copper: 8960,
};

/** The subset of the IfcWriter surface needed to emit a single quantity line. */
export interface QtoWeightWriter {
  nextId(): number;
  mkType(type: number, value: unknown): Record<string, unknown>;
  writeLine(entity: { expressID: number } & Record<string, unknown>): number;
}

/**
 * Resolves a nominal bulk density (kg/m³) for a material name, case-insensitive.
 * Returns `undefined` when the name is not in {@link MATERIAL_DENSITY_KG_M3}.
 */
export function densityFor(materialName: string): number | undefined {
  return MATERIAL_DENSITY_KG_M3[materialName.toLowerCase()];
}

/**
 * Computes mass in kilograms from a solid volume (m³) and a bulk density
 * (kg/m³). This is the analytic basis for the emitted IfcQuantityWeight value.
 */
export function computeWeightKg(volumeM3: number, densityKgM3: number): number {
  return volumeM3 * densityKgM3;
}

/**
 * Emits an IfcQuantityWeight whose WeightValue is `volumeM3 * densityKgM3`
 * expressed as an IfcMassMeasure (kg). Returns the express id of the written
 * quantity; callers collect these into an IfcElementQuantity set.
 */
export function writeWeightQuantity(
  w: QtoWeightWriter,
  name: string,
  volumeM3: number,
  densityKgM3: number
): number {
  const id = w.nextId();
  w.writeLine({
    expressID: id,
    type: WebIFC.IFCQUANTITYWEIGHT,
    Name: w.mkType(WebIFC.IFCLABEL, name),
    Description: null,
    Unit: null,
    WeightValue: w.mkType(WebIFC.IFCMASSMEASURE, computeWeightKg(volumeM3, densityKgM3)),
    Formula: null,
  });
  return id;
}
