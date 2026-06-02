/**
 * Shared material-association value types. Pure data, no imports, so they are
 * safe to reference from both the type layer (relationships, specs) and the
 * ifc-writer layer without risking a circular import.
 */

/** One physical layer in a layered material set (e.g. a wall build-up). */
export interface MaterialLayer {
  readonly name: string;
  readonly thicknessMm: number;
  readonly isVentilated?: boolean | undefined;
  readonly priority?: number | undefined;
  /** Bulk density (kg/m³) for analytic weight quantities; nominal lookup used when absent. */
  readonly densityKgM3?: number | undefined;
}
