import type { ConversionReport, MeshUnit, UnitSuggestion } from './types.js';

/** The report as the engine serializes it, before the TS-side fields are added. */
export type EngineReport = Omit<
  ConversionReport,
  'tierReached' | 'units' | 'faces' | 'timings' | 'tier1' | 'tier2'
> & {
  readonly units: Omit<ConversionReport['units'], 'suggestions'>;
};

/** The engine's Tier 1 segmentation summary. */
export type Tier1EngineReport = Omit<
  NonNullable<ConversionReport['tier1']>,
  'arrangement' | 'freeform' | 'fallbackReason'
>;

const MM_PER: Record<MeshUnit, number> = { um: 0.001, mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

/**
 * Units worth offering when the file carried none and its size in millimeters
 * looks implausible. Ranges cover hand-held parts through furniture.
 */
export function unitSuggestions(
  largestMm: number,
  source: ConversionReport['units']['source']
): UnitSuggestion[] {
  if (source !== 'assumed' || !(largestMm > 0)) return [];
  const plausible = (mm: number) => mm >= 2 && mm <= 3000;
  const out: UnitSuggestion[] = [];
  const consider = (unit: MeshUnit, reason: string) => {
    const mm = largestMm * MM_PER[unit];
    if (plausible(mm)) out.push({ unit, largestDimensionMm: mm, reason });
  };
  if (largestMm < 2) {
    consider('m', 'under 2 mm as millimeters; scanners and some exporters write meters');
    consider('in', 'under 2 mm as millimeters; could be inches');
    consider('cm', 'under 2 mm as millimeters; could be centimeters');
    consider('ft', 'under 2 mm as millimeters; could be feet');
  } else if (largestMm <= 12) {
    consider('in', 'small enough that the file may be in inches');
  } else if (largestMm > 3000) {
    consider('um', 'over 3 m as millimeters; could be micrometers');
  }
  return out;
}

export function finishReport(
  engine: EngineReport,
  faces: ConversionReport['faces'],
  timings: ConversionReport['timings'],
  extraWarnings: readonly string[],
  tiers: {
    tierReached: ConversionReport['tierReached'];
    tier1?: ConversionReport['tier1'];
    tier2?: ConversionReport['tier2'];
  } = {
    tierReached: 0,
  }
): ConversionReport {
  const size = engine.input.bboxMax.map((v, i) => v - (engine.input.bboxMin[i] ?? 0));
  const largestMm = Math.max(...size);
  const suggestions = unitSuggestions(largestMm, engine.units.source);
  const warnings = [...engine.warnings, ...extraWarnings];
  if (suggestions.length > 0) {
    warnings.push(
      `units assumed to be millimeters (largest dimension ${largestMm.toPrecision(3)} mm); check the units option`
    );
  }
  return {
    ...engine,
    tierReached: tiers.tierReached,
    ...(tiers.tier1 !== undefined ? { tier1: tiers.tier1 } : {}),
    ...(tiers.tier2 !== undefined ? { tier2: tiers.tier2 } : {}),
    units: { ...engine.units, suggestions },
    faces,
    timings,
    warnings,
  };
}
